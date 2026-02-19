import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, companies } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import { getCompanyBackend, createBackendClient } from "@/lib/backend";
import { pollDropletStatus } from "@/lib/digitalocean";

export const maxDuration = 60;

/**
 * POST /api/employees/[id]/reprovision
 * Re-queue provisioning for an employee stuck in "provisioning" status.
 * This is called by the frontend when an employee has been provisioning too long.
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

  if (employee.status !== "provisioning") {
    return NextResponse.json(
      { error: `Employee is ${employee.status}, not provisioning` },
      { status: 400 },
    );
  }

  // Get backend config (try auto-discovery if IP is missing)
  let backendConfig = await getCompanyBackend(session.companyId);

  if (!backendConfig) {
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, session.companyId))
      .limit(1);

    if (company?.dropletStatus === "active" && company.dropletId && !company.dropletIp) {
      try {
        const pollResult = await pollDropletStatus(session.companyId);
        if (pollResult.status === "active" && pollResult.ip) {
          backendConfig = await getCompanyBackend(session.companyId);
        }
      } catch (err: any) {
        console.error("[reprovision] pollDropletStatus failed:", err.message);
      }
    }
  }

  if (!backendConfig) {
    return NextResponse.json(
      { error: "Backend not available — droplet may not be ready" },
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
