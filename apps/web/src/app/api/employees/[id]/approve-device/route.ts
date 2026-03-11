import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import { getEmployeeBackend, createBackendClient } from "@/lib/backend";

export const maxDuration = 30;

/**
 * POST /api/employees/[id]/approve-device
 * Auto-approve a pending OpenClaw node pairing request inside the employee's container.
 * Called by the browser extension when it receives PAIRING_REQUIRED from the gateway.
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
    .select({ id: employees.id, companyId: employees.companyId })
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const backendConfig = await getEmployeeBackend(id);
  if (!backendConfig) {
    return NextResponse.json(
      { error: "Backend not available — droplet may not be ready" },
      { status: 503 },
    );
  }

  try {
    const backend = createBackendClient(backendConfig);
    const result = await backend.approveNode(id, body.requestId);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[approve-device] error:", err.message);
    return NextResponse.json(
      { error: `Approve device failed: ${err.message}` },
      { status: 502 },
    );
  }
}
