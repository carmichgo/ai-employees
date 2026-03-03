import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import { getEmployeeBackend, createBackendClient } from "@/lib/backend";

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

  // Allow resume from "paused" or recover from stuck "provisioning"
  if (employee.status !== "paused" && employee.status !== "provisioning") {
    return NextResponse.json({ error: "Employee is not paused" }, { status: 400 });
  }

  // If stuck in provisioning with a container, force-recover to active.
  // The droplet's health poll will verify the container is actually running
  // within 60s, flipping to "error" if it's not.
  if (employee.status === "provisioning") {
    const [updated] = await db
      .update(employees)
      .set({ status: "active", errorMessage: null, updatedAt: new Date() })
      .where(eq(employees.id, id))
      .returning();
    const { gatewayToken, ...safe } = updated;
    return NextResponse.json({ employee: safe, recovered: true });
  }

  // If employee has an active droplet, delegate resume to it
  const backendConfig = await getEmployeeBackend(id);
  if (backendConfig) {
    try {
      const backend = createBackendClient(backendConfig);
      const result = await backend.resumeEmployee(id);
      return NextResponse.json(result);
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  // Demo mode fallback
  const [updated] = await db
    .update(employees)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(employees.id, id))
    .returning();

  const { gatewayToken, ...safe } = updated;
  return NextResponse.json({ employee: safe });
}
