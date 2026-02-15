import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import { getEmployeeBackend, createBackendClient } from "@/lib/backend";
import { powerOffDroplet } from "@/lib/digitalocean";

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

  // If employee has an active droplet, stop the container then power off the droplet
  const backendConfig = await getEmployeeBackend(id);
  if (backendConfig) {
    // Stop the container on the droplet (best-effort — don't fail if unreachable)
    try {
      const backend = createBackendClient(backendConfig);
      await backend.pauseEmployee(id);
    } catch {
      // Container may already be stopped — proceed to power off
    }

    // Power off the droplet to save billing
    try {
      await powerOffDroplet(id);
    } catch (err: any) {
      console.error(`[pause] Failed to power off droplet for ${id}: ${err.message}`);
    }
  }

  // Update employee status to paused
  const [updated] = await db
    .update(employees)
    .set({ status: "paused", updatedAt: new Date() })
    .where(eq(employees.id, id))
    .returning();

  const { gatewayToken, interserviceSecret, ...safe } = updated as any;
  return NextResponse.json({ employee: safe });
}
