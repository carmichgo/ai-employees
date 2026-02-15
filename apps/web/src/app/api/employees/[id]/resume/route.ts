import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import { powerOnDroplet } from "@/lib/digitalocean";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await verifyToken(token);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verify ownership
  const [employee] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }
  if (employee.status !== "paused") {
    return NextResponse.json({ error: "Employee is not paused" }, { status: 400 });
  }

  // If employee has a droplet, power it on — the polling mechanism will
  // detect when the API is ready and start the container automatically
  if (employee.dropletId) {
    try {
      await powerOnDroplet(id);
    } catch (err: any) {
      return NextResponse.json(
        { error: `Failed to power on server: ${err.message}` },
        { status: 500 },
      );
    }

    // Re-read the employee after powerOnDroplet updated the DB
    const [updated] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, id))
      .limit(1);

    const { gatewayToken, interserviceSecret, ...safe } = updated as any;
    return NextResponse.json({ employee: safe });
  }

  // Demo mode fallback (no droplet)
  const [updated] = await db
    .update(employees)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(employees.id, id))
    .returning();

  const { gatewayToken, interserviceSecret, ...safe } = updated as any;
  return NextResponse.json({ employee: safe });
}
