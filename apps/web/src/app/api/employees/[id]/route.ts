import { NextRequest, NextResponse } from "next/server";
import { eq, and, not } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, tasks } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import { updateEmployeeSchema } from "@ai-employees/shared";
import { getEmployeeBackend, createBackendClient } from "@/lib/backend";
import { destroyEmployeeDroplet, pollEmployeeDropletStatus } from "@/lib/digitalocean";

export const maxDuration = 60;

async function authenticate(request: NextRequest) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
}

function sanitize(emp: Record<string, unknown>) {
  const { gatewayToken, interserviceSecret, ...safe } = emp as {
    gatewayToken?: string;
    interserviceSecret?: string;
  } & Record<string, unknown>;
  return safe;
}

// GET /api/employees/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
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

  // If employee is provisioning and has a droplet, poll DO for IP/status updates
  if (employee.status === "provisioning" && employee.dropletId) {
    try {
      const pollResult = await pollEmployeeDropletStatus(id);
      if (pollResult.status === "active" && pollResult.ip) {
        // Re-fetch the updated employee record
        const [updated] = await db
          .select()
          .from(employees)
          .where(eq(employees.id, id))
          .limit(1);
        if (updated) {
          return NextResponse.json({ employee: sanitize(updated) });
        }
      }
    } catch (err: any) {
      console.error("[employee-get] pollEmployeeDropletStatus failed:", err.message);
    }
  }

  return NextResponse.json({ employee: sanitize(employee) });
}

// PATCH /api/employees/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const input = updateEmployeeSchema.parse(body);

  const [employee] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);
  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name) updateData.name = input.name;
  if (input.jobTitle) updateData.jobTitle = input.jobTitle;
  if (input.persona !== undefined) updateData.persona = input.persona;
  if (input.goals !== undefined) updateData.goals = input.goals;
  if (input.modelConfig) updateData.modelConfig = input.modelConfig;

  const [updated] = await db
    .update(employees)
    .set(updateData)
    .where(eq(employees.id, id))
    .returning();

  return NextResponse.json({ employee: sanitize(updated) });
}

// DELETE /api/employees/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
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

  // Try backend teardown if employee has an active droplet (best-effort)
  const backendConfig = await getEmployeeBackend(id);
  if (backendConfig) {
    try {
      const backend = createBackendClient(backendConfig);
      await backend.terminateEmployee(id);
    } catch {
      // Backend teardown failed — still mark as terminated in DB
    }
  }

  // Destroy the employee's dedicated droplet
  if (employee.dropletId) {
    try {
      await destroyEmployeeDroplet(id);
    } catch (err: any) {
      console.error("Failed to destroy employee droplet:", err.message);
    }
  }

  // Remove Stripe subscription item if it exists (prorates the invoice)
  if (employee.stripeSubscriptionItemId) {
    try {
      const { removeEmployeeFromSubscription } = await import("@/lib/stripe");
      await removeEmployeeFromSubscription(employee.stripeSubscriptionItemId);
    } catch (err: any) {
      console.error("Failed to remove Stripe subscription item:", err.message);
      // Continue — still terminate the employee in DB
    }
  }

  // Archive all non-completed tasks for this employee
  try {
    await db
      .update(tasks)
      .set({ status: "archived", updatedAt: new Date() })
      .where(and(eq(tasks.employeeId, id), not(eq(tasks.status, "completed"))));
  } catch {
    // Non-fatal — tasks table may not exist or column may be missing
  }

  // Always mark as terminated in the DB
  const [updated] = await db
    .update(employees)
    .set({ status: "terminated", stripeSubscriptionItemId: null, updatedAt: new Date() })
    .where(eq(employees.id, id))
    .returning();

  return NextResponse.json({
    employee: sanitize(updated),
    message: `${employee.name} has been terminated.`,
  });
}
