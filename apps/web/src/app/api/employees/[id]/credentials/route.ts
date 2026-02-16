/**
 * GET    /api/employees/[id]/credentials — list credentials (passwords masked)
 * PUT    /api/employees/[id]/credentials — add or update a credential
 * DELETE /api/employees/[id]/credentials?credId=xxx — remove a credential
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import { randomUUID } from "crypto";
import { getCompanyBackend, createBackendClient } from "@/lib/backend";

async function authenticate(request: NextRequest) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
}

type Credential = {
  id: string;
  label: string;
  username: string;
  password: string;
  url?: string;
  notes?: string;
};

// GET — list all credentials with passwords masked
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [employee] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const creds = (employee.credentials as Credential[]) || [];

  return NextResponse.json({
    credentials: creds.map((c) => ({
      id: c.id,
      label: c.label,
      username: c.username,
      hasPassword: !!c.password,
      url: c.url || "",
      notes: c.notes || "",
    })),
  });
}

// PUT — add or update a credential
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  if (!body.label || !body.username) {
    return NextResponse.json(
      { error: "Required: label, username" },
      { status: 400 },
    );
  }

  const [employee] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const creds = (employee.credentials as Credential[]) || [];

  if (body.id) {
    // Update existing
    const idx = creds.findIndex((c) => c.id === body.id);
    if (idx === -1) {
      return NextResponse.json({ error: "Credential not found" }, { status: 404 });
    }
    creds[idx] = {
      ...creds[idx],
      label: body.label,
      username: body.username,
      password: body.password || creds[idx].password, // keep old if blank
      url: body.url ?? creds[idx].url,
      notes: body.notes ?? creds[idx].notes,
    };
  } else {
    // Add new
    if (!body.password) {
      return NextResponse.json(
        { error: "Password is required for new credentials" },
        { status: 400 },
      );
    }
    creds.push({
      id: randomUUID(),
      label: body.label,
      username: body.username,
      password: body.password,
      url: body.url || "",
      notes: body.notes || "",
    });
  }

  await db
    .update(employees)
    .set({ credentials: creds, updatedAt: new Date() })
    .where(eq(employees.id, id));

  // Sync all credentials to the employee's container so they can access them
  const backendConfig = await getCompanyBackend(session.companyId);
  if (backendConfig) {
    try {
      const backend = createBackendClient(backendConfig);
      await backend.syncCredentials(
        id,
        creds.map((c) => ({
          label: c.label,
          username: c.username,
          password: c.password,
          url: c.url,
          notes: c.notes,
        })),
      );
    } catch (err: any) {
      // Don't fail the whole operation — DB is saved, container sync can be retried
      console.error(`Failed to sync credentials to container: ${err.message}`);
    }
  }

  const saved = creds[creds.length - 1];
  const target = body.id ? creds.find((c) => c.id === body.id)! : saved;

  return NextResponse.json({
    message: body.id ? "Credential updated" : "Credential added",
    credential: {
      id: target.id,
      label: target.label,
      username: target.username,
      hasPassword: !!target.password,
      url: target.url || "",
      notes: target.notes || "",
    },
  });
}

// DELETE — remove a credential
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const credId = request.nextUrl.searchParams.get("credId");

  if (!credId) {
    return NextResponse.json({ error: "credId is required" }, { status: 400 });
  }

  const [employee] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const creds = (employee.credentials as Credential[]) || [];
  const filtered = creds.filter((c) => c.id !== credId);

  if (filtered.length === creds.length) {
    return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  }

  await db
    .update(employees)
    .set({ credentials: filtered, updatedAt: new Date() })
    .where(eq(employees.id, id));

  // Re-sync remaining credentials to the container
  const backendConfig = await getCompanyBackend(session.companyId);
  if (backendConfig) {
    try {
      const backend = createBackendClient(backendConfig);
      await backend.syncCredentials(
        id,
        filtered.map((c) => ({
          label: c.label,
          username: c.username,
          password: c.password,
          url: c.url,
          notes: c.notes,
        })),
      );
    } catch (err: any) {
      console.error(`Failed to sync credentials to container: ${err.message}`);
    }
  }

  return NextResponse.json({ message: "Credential removed" });
}
