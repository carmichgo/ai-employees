import { NextRequest, NextResponse } from "next/server";
import { eq, and, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { spreadsheetTables, spreadsheetColumns } from "@/lib/schema";
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

// POST /api/tables/columns — add a column to a table
export async function POST(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { tableId, name, type, options } = body;

  if (!tableId || !name) return NextResponse.json({ error: "tableId and name are required" }, { status: 400 });

  const table = await verifyTableAccess(tableId, session.companyId);
  if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

  // Get max position
  const existing = await db
    .select()
    .from(spreadsheetColumns)
    .where(eq(spreadsheetColumns.tableId, tableId))
    .orderBy(asc(spreadsheetColumns.position));

  const maxPos = existing.length > 0 ? Math.max(...existing.map((c) => c.position)) : -1;

  const [column] = await db
    .insert(spreadsheetColumns)
    .values({
      tableId,
      name,
      type: type || "text",
      options: options || {},
      position: maxPos + 1,
    })
    .returning();

  // Update table's updatedAt
  await db.update(spreadsheetTables).set({ updatedAt: new Date() }).where(eq(spreadsheetTables.id, tableId));

  return NextResponse.json({ column }, { status: 201 });
}

// PATCH /api/tables/columns — update a column
export async function PATCH(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const columnId = request.nextUrl.searchParams.get("columnId");
  if (!columnId) return NextResponse.json({ error: "columnId required" }, { status: 400 });

  const body = await request.json();

  // Verify the column belongs to a table owned by this company
  const [col] = await db.select().from(spreadsheetColumns).where(eq(spreadsheetColumns.id, columnId)).limit(1);
  if (!col) return NextResponse.json({ error: "Column not found" }, { status: 404 });

  const table = await verifyTableAccess(col.tableId, session.companyId);
  if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.type !== undefined) updates.type = body.type;
  if (body.options !== undefined) updates.options = body.options;
  if (body.position !== undefined) updates.position = body.position;

  const [updated] = await db
    .update(spreadsheetColumns)
    .set(updates)
    .where(eq(spreadsheetColumns.id, columnId))
    .returning();

  await db.update(spreadsheetTables).set({ updatedAt: new Date() }).where(eq(spreadsheetTables.id, col.tableId));

  return NextResponse.json({ column: updated });
}

// DELETE /api/tables/columns — delete a column
export async function DELETE(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const columnId = request.nextUrl.searchParams.get("columnId");
  if (!columnId) return NextResponse.json({ error: "columnId required" }, { status: 400 });

  const [col] = await db.select().from(spreadsheetColumns).where(eq(spreadsheetColumns.id, columnId)).limit(1);
  if (!col) return NextResponse.json({ error: "Column not found" }, { status: 404 });

  const table = await verifyTableAccess(col.tableId, session.companyId);
  if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

  await db.delete(spreadsheetColumns).where(eq(spreadsheetColumns.id, columnId));

  await db.update(spreadsheetTables).set({ updatedAt: new Date() }).where(eq(spreadsheetTables.id, col.tableId));

  return NextResponse.json({ message: "Column deleted" });
}
