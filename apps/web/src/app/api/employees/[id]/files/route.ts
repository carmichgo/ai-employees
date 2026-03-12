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

export const maxDuration = 60;

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

  // Read multipart form data — bypass Next.js's 1MB body limit by reading the
  // raw stream and parsing it through a fresh Response object.
  const contentType = request.headers.get("content-type") || "";
  const chunks: Uint8Array[] = [];
  const reader = request.body?.getReader();
  if (!reader) {
    return NextResponse.json({ error: "No request body" }, { status: 400 });
  }
  let totalSize = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    totalSize += value.length;
    if (totalSize > 10 * 1024 * 1024 + 4096) {
      // 10MB + overhead for multipart boundaries/headers
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 413 });
    }
    chunks.push(value);
  }
  const rawBody = new Blob(chunks as unknown as BlobPart[], { type: contentType });
  const formData = await new Response(rawBody).formData();
  const file = formData.get("file") as File | null;
  const folder = formData.get("folder") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Convert to base64 and proxy to droplet
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  try {
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
        ...(folder ? { folder } : {}),
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(text); } catch {}
      const errorMsg = (parsed.error as string) || `Backend returned ${res.status}: ${text.slice(0, 200)}`;
      console.error("[upload] backend error:", res.status, text.slice(0, 500));
      return NextResponse.json({ error: errorMsg }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    console.error("[upload] fetch error:", err.message || err);
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return NextResponse.json({ error: "Upload timed out — backend did not respond in time" }, { status: 504 });
    }
    return NextResponse.json({ error: `Failed to reach employee backend: ${err.message || "unknown error"}` }, { status: 502 });
  }
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

  try {
    const res = await fetch(`${backend.url}/internal/employees/${id}/files`, {
      headers: {
        "x-interservice-secret": backend.secret,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return NextResponse.json({ files: [] });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ files: [] });
  }
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

  try {
    const res = await fetch(
      `${backend.url}/internal/employees/${id}/files/${encodeURIComponent(filename)}`,
      {
        method: "DELETE",
        headers: {
          "x-interservice-secret": backend.secret,
        },
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Delete failed" }));
      return NextResponse.json(body, { status: res.status });
    }

    return NextResponse.json({ message: "File deleted" });
  } catch {
    return NextResponse.json({ error: "Failed to reach employee backend" }, { status: 502 });
  }
}
