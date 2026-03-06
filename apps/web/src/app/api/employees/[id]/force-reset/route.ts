import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import { getEmployeeBackend, createBackendClient } from "@/lib/backend";

export const maxDuration = 60;

/**
 * POST /api/employees/[id]/force-reset
 * Force-reset an employee's container while PRESERVING all data.
 * This tears down the container and reprovisions it, but the bind-mounted
 * config directory (memory.md, workspace files, credentials) stays intact.
 *
 * Use this when an employee is completely stuck and no other recovery works.
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

  if (employee.status === "terminated") {
    return NextResponse.json({ error: "Employee is terminated — use Reactivate instead" }, { status: 400 });
  }

  const results: string[] = [];

  // Step 1: Try to teardown existing container via backend (if reachable)
  if (employee.dropletIp && employee.interserviceSecret) {
    const baseUrl = `http://${employee.dropletIp}:3001`;
    const headers = {
      "Content-Type": "application/json",
      "x-interservice-secret": employee.interserviceSecret,
    };

    try {
      const tearRes = await fetch(`${baseUrl}/internal/employees/${id}/teardown`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(15000),
      });
      if (tearRes.ok) {
        results.push("Container torn down");
      } else {
        results.push("Teardown skipped (container may already be gone)");
      }
    } catch {
      results.push("Could not reach server for teardown (will recreate anyway)");
    }
  }

  // Step 2: Set status to provisioning so reprovision can proceed
  await db
    .update(employees)
    .set({
      status: "provisioning",
      errorMessage: null,
      updatedAt: new Date(),
    } as any)
    .where(eq(employees.id, id));

  // Step 3: Trigger reprovision via backend — this creates a new container
  // but reuses the existing bind mount (config dir with memory, workspace, etc.)
  const backendConfig = await getEmployeeBackend(id);

  if (backendConfig) {
    try {
      const backend = createBackendClient(backendConfig);
      const result = await backend.reprovisionEmployee(id);
      results.push("Reprovision triggered — container will be back in ~30 seconds");
      results.push("Memory, files, and credentials are preserved");
      return NextResponse.json({
        success: true,
        message: `Force reset started for ${employee.name}. Memory and files are preserved. Container will be back in ~30 seconds.`,
        results,
      });
    } catch (err: any) {
      results.push(`Reprovision failed: ${err.message}`);
    }
  } else {
    results.push("Backend not reachable — server may need a reboot first");
  }

  return NextResponse.json({
    success: false,
    message: `Could not complete force reset. Try rebooting the server first, then retry.`,
    results,
  }, { status: 502 });
}
