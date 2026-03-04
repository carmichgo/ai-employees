import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import { shutdownEmployeeDroplet } from "@/lib/digitalocean";

export const maxDuration = 60;

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
  if (employee.status !== "active") {
    return NextResponse.json({ error: "Employee is not active" }, { status: 400 });
  }

  // Shut down the droplet via DigitalOcean API (powers it off, stops billing for CPU)
  if (employee.dropletId) {
    const success = await shutdownEmployeeDroplet(id);
    if (!success) {
      return NextResponse.json(
        { error: "Failed to shut down droplet" },
        { status: 502 },
      );
    }
  }

  // Mark as paused in DB
  const [updated] = await db
    .update(employees)
    .set({
      status: "paused",
      dropletStatus: employee.dropletId ? "off" : employee.dropletStatus,
      updatedAt: new Date(),
    } as any)
    .where(eq(employees.id, id))
    .returning();

  const { gatewayToken, interserviceSecret, ...safe } = updated as any;
  return NextResponse.json({ employee: safe });
}
