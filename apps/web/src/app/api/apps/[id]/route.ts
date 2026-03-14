import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employeeApps } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";

async function authenticate(request: NextRequest) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
}

// PATCH /api/apps/[id] — update an app
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.emoji !== undefined) updates.emoji = body.emoji;
  if (body.shared !== undefined) updates.shared = body.shared;
  if (body.status !== undefined) updates.status = body.status;

  const [app] = await db
    .update(employeeApps)
    .set(updates)
    .where(and(eq(employeeApps.id, id), eq(employeeApps.companyId, session.companyId)))
    .returning();

  if (!app) return NextResponse.json({ error: "App not found" }, { status: 404 });

  return NextResponse.json({ app });
}

// DELETE /api/apps/[id] — delete an app
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [app] = await db
    .delete(employeeApps)
    .where(and(eq(employeeApps.id, id), eq(employeeApps.companyId, session.companyId)))
    .returning();

  if (!app) return NextResponse.json({ error: "App not found" }, { status: 404 });

  return NextResponse.json({ message: "App deleted" });
}
