import { NextRequest, NextResponse } from "next/server";
import { eq, and, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { spreadsheetTables, spreadsheetRows } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";

async function authenticate(request: NextRequest) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
}

async function verifyTableAccess(tableId: string, companyId: string) {
  const [table] = await db
    .select()
    .from(spreadsheetTables)
    .where(and(eq(spreadsheetTables.id, tableId), eq(spreadsheetTables.companyId, companyId)))
    .limit(1);
  return table || null;
}

// POST /api/tables/rows — add a row
export async function POST(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { tableId, cells } = body;

  if (!tableId) return NextResponse.json({ error: "tableId is required" }, { status: 400 });

  const table = await verifyTableAccess(tableId, session.companyId);
  if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

  // Get max position
  const existing = await db
    .select()
    .from(spreadsheetRows)
    .where(eq(spreadsheetRows.tableId, tableId))
    .orderBy(asc(spreadsheetRows.position));

  const maxPos = existing.length > 0 ? Math.max(...existing.map((r) => r.position)) : -1;

  const [row] = await db
    .insert(spreadsheetRows)
    .values({
      tableId,
      cells: cells || {},
      position: maxPos + 1,
    })
    .returning();

  await db.update(spreadsheetTables).set({ updatedAt: new Date() }).where(eq(spreadsheetTables.id, tableId));

  return NextResponse.json({ row }, { status: 201 });
}

// PATCH /api/tables/rows — update a row's cells
export async function PATCH(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rowId = request.nextUrl.searchParams.get("rowId");
  if (!rowId) return NextResponse.json({ error: "rowId required" }, { status: 400 });

  const body = await request.json();

  const [row] = await db.select().from(spreadsheetRows).where(eq(spreadsheetRows.id, rowId)).limit(1);
  if (!row) return NextResponse.json({ error: "Row not found" }, { status: 404 });

  const table = await verifyTableAccess(row.tableId, session.companyId);
  if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.cells !== undefined) updates.cells = body.cells;
  if (body.position !== undefined) updates.position = body.position;

  const [updated] = await db
    .update(spreadsheetRows)
    .set(updates)
    .where(eq(spreadsheetRows.id, rowId))
    .returning();

  await db.update(spreadsheetTables).set({ updatedAt: new Date() }).where(eq(spreadsheetTables.id, row.tableId));

  return NextResponse.json({ row: updated });
}

// DELETE /api/tables/rows — delete a row
export async function DELETE(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rowId = request.nextUrl.searchParams.get("rowId");
  if (!rowId) return NextResponse.json({ error: "rowId required" }, { status: 400 });

  const [row] = await db.select().from(spreadsheetRows).where(eq(spreadsheetRows.id, rowId)).limit(1);
  if (!row) return NextResponse.json({ error: "Row not found" }, { status: 404 });

  const table = await verifyTableAccess(row.tableId, session.companyId);
  if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

  await db.delete(spreadsheetRows).where(eq(spreadsheetRows.id, rowId));

  await db.update(spreadsheetTables).set({ updatedAt: new Date() }).where(eq(spreadsheetTables.id, row.tableId));

  return NextResponse.json({ message: "Row deleted" });
}
