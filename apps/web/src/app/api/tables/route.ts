import { NextRequest, NextResponse } from "next/server";
import { eq, and, asc, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { spreadsheetTables, spreadsheetColumns, spreadsheetRows } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";

async function authenticate(request: NextRequest) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
}

// GET /api/tables — list all tables for the company, or get a single table with columns+rows
export async function GET(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tableId = request.nextUrl.searchParams.get("tableId");
  const baseId = request.nextUrl.searchParams.get("baseId");

  try {
    if (tableId) {
      // Get single table with columns and rows
      const [table] = await db
        .select()
        .from(spreadsheetTables)
        .where(and(eq(spreadsheetTables.id, tableId), eq(spreadsheetTables.companyId, session.companyId)))
        .limit(1);

      if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

      const columns = await db
        .select()
        .from(spreadsheetColumns)
        .where(eq(spreadsheetColumns.tableId, tableId))
        .orderBy(asc(spreadsheetColumns.position));

      const rows = await db
        .select()
        .from(spreadsheetRows)
        .where(eq(spreadsheetRows.tableId, tableId))
        .orderBy(asc(spreadsheetRows.position));

      return NextResponse.json({ table, columns, rows });
    }

    // List tables — optionally filtered by baseId
    const conditions = [eq(spreadsheetTables.companyId, session.companyId)];
    if (baseId) {
      conditions.push(eq(spreadsheetTables.baseId, baseId));
    }

    const tables = await db
      .select()
      .from(spreadsheetTables)
      .where(and(...conditions))
      .orderBy(desc(spreadsheetTables.updatedAt));

    return NextResponse.json({ tables });
  } catch (err: any) {
    const message = err?.message || "Failed to load tables";
    const isMissingTable = message.includes("does not exist") || message.includes("relation");
    return NextResponse.json(
      {
        error: isMissingTable
          ? "Database tables not found. Please run migrations first (POST /api/migrate)."
          : message,
      },
      { status: 500 },
    );
  }
}

// POST /api/tables — create a new table (with default columns)
export async function POST(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { name, description, baseId } = body;

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  try {
    const [table] = await db
      .insert(spreadsheetTables)
      .values({
        companyId: session.companyId,
        baseId: baseId || null,
        name,
        description: description || null,
      })
      .returning();

    // Create default columns
    const defaultCols = [
      { name: "Name", type: "text", position: 0 },
      { name: "Notes", type: "text", position: 1 },
      { name: "Status", type: "select", position: 2, options: { choices: ["Todo", "In Progress", "Done"] } },
    ];

    const columns = await db
      .insert(spreadsheetColumns)
      .values(defaultCols.map((c) => ({ ...c, tableId: table.id, options: c.options || {} })))
      .returning();

    return NextResponse.json({ table, columns }, { status: 201 });
  } catch (err: any) {
    const message = err?.message || "Failed to create table";
    const isMissingTable = message.includes("does not exist") || message.includes("relation");
    return NextResponse.json(
      {
        error: isMissingTable
          ? "Database tables not found. Please run migrations first (POST /api/migrate)."
          : message,
      },
      { status: 500 },
    );
  }
}

// PATCH /api/tables — update table name/description
export async function PATCH(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tableId = request.nextUrl.searchParams.get("tableId");
  if (!tableId) return NextResponse.json({ error: "tableId required" }, { status: 400 });

  const body = await request.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;

  const [table] = await db
    .update(spreadsheetTables)
    .set(updates)
    .where(and(eq(spreadsheetTables.id, tableId), eq(spreadsheetTables.companyId, session.companyId)))
    .returning();

  if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

  return NextResponse.json({ table });
}

// DELETE /api/tables — delete a table and all its columns/rows (cascade)
export async function DELETE(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tableId = request.nextUrl.searchParams.get("tableId");
  if (!tableId) return NextResponse.json({ error: "tableId required" }, { status: 400 });

  const [table] = await db
    .delete(spreadsheetTables)
    .where(and(eq(spreadsheetTables.id, tableId), eq(spreadsheetTables.companyId, session.companyId)))
    .returning();

  if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

  return NextResponse.json({ message: "Table deleted" });
}
