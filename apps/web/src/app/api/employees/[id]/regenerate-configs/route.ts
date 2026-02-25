import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import { getEmployeeBackend, createBackendClient } from "@/lib/backend";

export const maxDuration = 120;

/**
 * POST /api/employees/[id]/regenerate-configs
 * Regenerate SOUL.md, openclaw.json, skills, and HEARTBEAT.md on the droplet
 * without pulling code or rebuilding — uses the already-deployed code.
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
    const result = await backend.regenerateConfigs();
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[regenerate-configs] error:", err.message);
    return NextResponse.json(
      { error: `Regenerate configs failed: ${err.message}` },
      { status: 502 },
    );
  }
}
