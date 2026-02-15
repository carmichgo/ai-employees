/**
 * Per-employee droplet management
 *
 * GET  /api/employees/[id]/droplet — poll droplet status
 * POST /api/employees/[id]/droplet — provision a new droplet for the employee
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import {
  createEmployeeDroplet,
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

// GET /api/employees/[id]/droplet — get droplet status
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

  // If no droplet ID, return current state from DB
  if (!employee.dropletId) {
    return NextResponse.json({
      droplet: {
        status: employee.dropletStatus || "none",
        ip: employee.dropletIp,
        region: employee.dropletRegion,
        size: employee.dropletSize,
        phase: null,
      },
      provisioningEnabled: isDropletProvisioningEnabled(),
    });
  }

  // Poll live status from DigitalOcean
  const result = await pollEmployeeDropletStatus(id);

  return NextResponse.json({
    droplet: {
      status: result.status,
      ip: result.ip || employee.dropletIp,
      region: employee.dropletRegion,
      size: employee.dropletSize,
      phase: result.phase,
    },
    provisioningEnabled: isDropletProvisioningEnabled(),
  });
}

// POST /api/employees/[id]/droplet — provision a droplet
export async function POST(
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

  if (!isDropletProvisioningEnabled()) {
    return NextResponse.json(
      { error: "Droplet provisioning is not enabled. Set DO_API_TOKEN in environment." },
      { status: 400 },
    );
  }

  if (employee.dropletStatus === "active" && employee.dropletIp) {
    return NextResponse.json(
      { error: "Employee already has an active droplet." },
      { status: 400 },
    );
  }

  try {
    const { dropletId } = await createEmployeeDroplet(id);

    // Also set employee status to provisioning if it was active (demo mode)
    await db
      .update(employees)
      .set({ status: "provisioning", updatedAt: new Date() })
      .where(eq(employees.id, id));

    return NextResponse.json({
      message: `Provisioning dedicated server for ${employee.name}. This takes 2-3 minutes.`,
      dropletId,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Provisioning failed: ${err.message}` },
      { status: 500 },
    );
  }
}
