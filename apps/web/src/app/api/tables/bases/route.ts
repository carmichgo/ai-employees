import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { spreadsheetBases, spreadsheetTables } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";

async function authenticate(request: NextRequest) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
}

// GET /api/tables/bases — list all bases, or get a single base with its tables
export async function GET(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const baseId = request.nextUrl.searchParams.get("baseId");

  try {
    if (baseId) {
      const [base] = await db
        .select()
        .from(spreadsheetBases)
        .where(and(eq(spreadsheetBases.id, baseId), eq(spreadsheetBases.companyId, session.companyId)))
        .limit(1);

      if (!base) return NextResponse.json({ error: "Base not found" }, { status: 404 });

      const tables = await db
        .select()
        .from(spreadsheetTables)
        .where(eq(spreadsheetTables.baseId, baseId))
        .orderBy(desc(spreadsheetTables.updatedAt));

      return NextResponse.json({ base, tables });
    }

    const bases = await db
      .select()
      .from(spreadsheetBases)
      .where(eq(spreadsheetBases.companyId, session.companyId))
      .orderBy(desc(spreadsheetBases.updatedAt));

    return NextResponse.json({ bases });
  } catch (err: any) {
    const message = err?.message || "Failed to load bases";
    const isMissingTable = message.includes("does not exist") || message.includes("relation");
    return NextResponse.json(
      {
        error: isMissingTable
          ? "Database tables not found. Please run migrations first."
          : message,
      },
      { status: 500 },
    );
  }
}

// POST /api/tables/bases — create a new base (with a default table)
export async function POST(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { name, description, color, icon } = body;

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  try {
    const [base] = await db
      .insert(spreadsheetBases)
      .values({
        companyId: session.companyId,
        name,
        description: description || null,
        color: color || "#3b82f6",
        icon: icon || "📊",
      })
      .returning();

    return NextResponse.json({ base }, { status: 201 });
  } catch (err: any) {
    const message = err?.message || "Failed to create base";
    const isMissingTable = message.includes("does not exist") || message.includes("relation");
    return NextResponse.json(
      {
        error: isMissingTable
          ? "Database tables not found. Please run migrations first."
          : message,
      },
      { status: 500 },
    );
  }
}

// PATCH /api/tables/bases — update base name/description/color/icon
export async function PATCH(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const baseId = request.nextUrl.searchParams.get("baseId");
  if (!baseId) return NextResponse.json({ error: "baseId required" }, { status: 400 });

  const body = await request.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.color !== undefined) updates.color = body.color;
  if (body.icon !== undefined) updates.icon = body.icon;

  const [base] = await db
    .update(spreadsheetBases)
    .set(updates)
    .where(and(eq(spreadsheetBases.id, baseId), eq(spreadsheetBases.companyId, session.companyId)))
    .returning();

  if (!base) return NextResponse.json({ error: "Base not found" }, { status: 404 });

  return NextResponse.json({ base });
}

// DELETE /api/tables/bases — delete a base and all its tables (cascade)
export async function DELETE(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const baseId = request.nextUrl.searchParams.get("baseId");
  if (!baseId) return NextResponse.json({ error: "baseId required" }, { status: 400 });

  const [base] = await db
    .delete(spreadsheetBases)
    .where(and(eq(spreadsheetBases.id, baseId), eq(spreadsheetBases.companyId, session.companyId)))
    .returning();

  if (!base) return NextResponse.json({ error: "Base not found" }, { status: 404 });

  return NextResponse.json({ message: "Base deleted" });
}
