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
  if (employee.status !== "active") {
    return NextResponse.json({ error: "Employee is not active" }, { status: 400 });
  }

  // Try to actually kill the container on the droplet FIRST.
  // Only mark as "paused" in DB if the container is confirmed dead.
  const backendConfig = await getEmployeeBackend(id);
  if (backendConfig) {
    try {
      const backend = createBackendClient(backendConfig);
      await backend.pauseEmployee(id);
    } catch (err: any) {
      console.error(`[pause] Backend call failed for ${id}: ${err.message}`);
      return NextResponse.json(
        { error: `Failed to stop container: ${err.message}` },
        { status: 502 },
      );
    }
  }

  // Container is dead (or no droplet) — now update DB
  const [updated] = await db
    .update(employees)
    .set({ status: "paused", updatedAt: new Date() })
    .where(eq(employees.id, id))
    .returning();

  const { gatewayToken, ...safe } = updated;
  return NextResponse.json({ employee: safe });
}
