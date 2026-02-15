import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import {
  pollEmployeeDropletStatus,
  isDropletProvisioningEnabled,
} from "@/lib/digitalocean";

async function authenticate(request: NextRequest) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
}

// GET /api/companies/droplet — get droplet status for all employees
// Now returns per-employee droplet info since each employee has their own droplet
export async function GET(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const employeeList = await db
    .select()
    .from(employees)
    .where(eq(employees.companyId, session.companyId));

  const droplets = await Promise.all(
    employeeList
      .filter((e) => e.dropletId && e.status !== "terminated")
      .map(async (e) => {
        const result = await pollEmployeeDropletStatus(e.id);
        return {
          employeeId: e.id,
          employeeName: e.name,
          tier: e.tier,
          id: e.dropletId,
          ip: result.ip || e.dropletIp,
          region: e.dropletRegion,
          size: e.dropletSize,
          status: result.status,
          phase: result.phase,
        };
      }),
  );

  return NextResponse.json({ droplets });
}
