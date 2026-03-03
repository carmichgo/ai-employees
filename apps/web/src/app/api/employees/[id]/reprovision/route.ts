import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import { getEmployeeBackend, createBackendClient } from "@/lib/backend";
import { pollEmployeeDropletStatus, createEmployeeDroplet } from "@/lib/digitalocean";

export const maxDuration = 60;

/**
 * POST /api/employees/[id]/reprovision
 * Re-queue provisioning for an employee stuck in "provisioning" status.
 * This is called by the frontend when an employee has been provisioning too long.
 *
 * Per-employee model: each employee has their own dedicated droplet.
 */
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

  const [employee] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  if (employee.status !== "provisioning" && employee.status !== "error" && employee.status !== "terminated") {
    return NextResponse.json(
      { error: `Employee is ${employee.status}, not provisioning/error/terminated` },
      { status: 400 },
    );
  }

  // If terminated, reset status to provisioning before re-creating droplet
  if (employee.status === "terminated") {
    await db
      .update(employees)
      .set({
        status: "provisioning",
        dropletId: null,
        dropletIp: null,
        dropletStatus: "none",
        interserviceSecret: null,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(employees.id, id));
  }

  // If employee has no droplet at all, create one
  if (!employee.dropletId) {
    try {
      await createEmployeeDroplet(id);
      return NextResponse.json({
        message: "Droplet creation started — this takes 2-3 minutes.",
        dropletStatus: "provisioning",
      });
    } catch (err: any) {
      console.error("[reprovision] createEmployeeDroplet failed:", err.message);
      return NextResponse.json(
        { error: `Failed to create droplet: ${err.message}` },
        { status: 502 },
      );
    }
  }

  // If employee has a droplet but no IP, try polling for it
  let backendConfig = await getEmployeeBackend(id);

  if (!backendConfig && employee.dropletId && !employee.dropletIp) {
    try {
      const pollResult = await pollEmployeeDropletStatus(id);
      if (pollResult.status === "active" && pollResult.ip) {
        backendConfig = await getEmployeeBackend(id);
      }
    } catch (err: any) {
      console.error("[reprovision] pollEmployeeDropletStatus failed:", err.message);
    }
  }

  if (!backendConfig) {
    return NextResponse.json(
      { error: "Backend not available — droplet may not be ready yet" },
      { status: 503 },
    );
  }

  try {
    const backend = createBackendClient(backendConfig);
    const result = await backend.reprovisionEmployee(id);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[reprovision] backend error:", err.message);
    return NextResponse.json(
      { error: `Reprovision failed: ${err.message}` },
      { status: 502 },
    );
  }
}
