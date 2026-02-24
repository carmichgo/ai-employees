/**
 * POST /api/employees/[id]/files — upload a file to an employee's workspace
 * GET  /api/employees/[id]/files — list files in an employee's workspace
 * DELETE /api/employees/[id]/files?name=... — delete a file
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import { getEmployeeBackend } from "@/lib/backend";

async function authenticate(request: NextRequest) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
}

// POST — upload file
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verify employee belongs to company (explicit columns to avoid SELECT * breakage)
  const [employee] = await db
    .select({ id: employees.id, companyId: employees.companyId })
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  // Get the backend
  const backend = await getEmployeeBackend(id);
  if (!backend) {
    return NextResponse.json({ error: "Employee backend not available" }, { status: 503 });
  }

  // Read multipart form data
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 413 });
  }

  // Convert to base64 and proxy to droplet
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  const res = await fetch(`${backend.url}/internal/employees/${id}/files`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-interservice-secret": backend.secret,
    },
    body: JSON.stringify({
      name: file.name,
      content: base64,
      mimeType: file.type,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Upload failed" }));
    return NextResponse.json(body, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data, { status: 201 });
}

// GET — list files
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [employee] = await db
    .select({ id: employees.id, companyId: employees.companyId })
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const backend = await getEmployeeBackend(id);
  if (!backend) {
    return NextResponse.json({ files: [] });
  }

  const res = await fetch(`${backend.url}/internal/employees/${id}/files`, {
    headers: {
      "x-interservice-secret": backend.secret,
    },
  });

  if (!res.ok) {
    return NextResponse.json({ files: [] });
  }

  const data = await res.json();
  return NextResponse.json(data);
}

// DELETE — delete a file
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get("name");

  if (!filename) {
    return NextResponse.json({ error: "File name required" }, { status: 400 });
  }

  const [employee] = await db
    .select({ id: employees.id, companyId: employees.companyId })
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const backend = await getEmployeeBackend(id);
  if (!backend) {
    return NextResponse.json({ error: "Employee backend not available" }, { status: 503 });
  }

  const res = await fetch(
    `${backend.url}/internal/employees/${id}/files/${encodeURIComponent(filename)}`,
    {
      method: "DELETE",
      headers: {
        "x-interservice-secret": backend.secret,
      },
    },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Delete failed" }));
    return NextResponse.json(body, { status: res.status });
  }

  return NextResponse.json({ message: "File deleted" });
}
