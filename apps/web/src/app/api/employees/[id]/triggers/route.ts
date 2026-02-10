/**
 * POST   /api/employees/[id]/triggers — create a trigger
 * GET    /api/employees/[id]/triggers — list triggers
 * PATCH  /api/employees/[id]/triggers?triggerId=... — update a trigger
 * DELETE /api/employees/[id]/triggers?triggerId=... — delete a trigger
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import { getCompanyBackend } from "@/lib/backend";

async function authenticate(request: NextRequest) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
}

// POST — create trigger
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const [employee] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const backend = await getCompanyBackend(session.companyId);
  if (!backend) {
    return NextResponse.json({ error: "Company backend not available" }, { status: 503 });
  }

  const res = await fetch(`${backend.url}/internal/employees/${id}/triggers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-interservice-secret": backend.secret,
    },
    body: JSON.stringify({
      ...body,
      companyId: session.companyId,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Failed to create trigger" }));
    return NextResponse.json(data, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data, { status: 201 });
}

// GET — list triggers
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

  const backend = await getCompanyBackend(session.companyId);
  if (!backend) {
    return NextResponse.json({ triggers: [] });
  }

  const res = await fetch(`${backend.url}/internal/employees/${id}/triggers`, {
    headers: {
      "x-interservice-secret": backend.secret,
    },
  });

  if (!res.ok) {
    return NextResponse.json({ triggers: [] });
  }

  const data = await res.json();
  return NextResponse.json(data);
}

// PATCH — update trigger
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const triggerId = searchParams.get("triggerId");
  const body = await request.json();

  if (!triggerId) {
    return NextResponse.json({ error: "triggerId required" }, { status: 400 });
  }

  // Verify employee ownership
  const [employee] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const backend = await getCompanyBackend(session.companyId);
  if (!backend) {
    return NextResponse.json({ error: "Company backend not available" }, { status: 503 });
  }

  const res = await fetch(`${backend.url}/internal/triggers/${triggerId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-interservice-secret": backend.secret,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Failed to update trigger" }));
    return NextResponse.json(data, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data);
}

// DELETE — delete trigger
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const triggerId = searchParams.get("triggerId");

  if (!triggerId) {
    return NextResponse.json({ error: "triggerId required" }, { status: 400 });
  }

  const [employee] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const backend = await getCompanyBackend(session.companyId);
  if (!backend) {
    return NextResponse.json({ error: "Company backend not available" }, { status: 503 });
  }

  const res = await fetch(`${backend.url}/internal/triggers/${triggerId}`, {
    method: "DELETE",
    headers: {
      "x-interservice-secret": backend.secret,
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Failed to delete trigger" }));
    return NextResponse.json(data, { status: res.status });
  }

  return NextResponse.json({ message: "Trigger deleted" });
}
