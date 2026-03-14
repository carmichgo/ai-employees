import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import { powerOnEmployeeDroplet, checkDropletHealth } from "@/lib/digitalocean";

export const maxDuration = 60;

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

  // Allow resume from "paused", recover from stuck "provisioning", or recover from "error"
  if (employee.status !== "paused" && employee.status !== "provisioning" && employee.status !== "error") {
    return NextResponse.json({ error: "Employee is not paused or in error" }, { status: 400 });
  }

  // If stuck in provisioning or error with a container, force-recover to active.
  if (employee.status === "provisioning" || (employee.status === "error" && !employee.dropletId)) {
    const [updated] = await db
      .update(employees)
      .set({ status: "active", errorMessage: null, updatedAt: new Date() })
      .where(eq(employees.id, id))
      .returning();
    const { gatewayToken, interserviceSecret, ...safe } = updated as any;
    return NextResponse.json({ employee: safe, recovered: true });
  }

  // Power on the droplet via DigitalOcean API
  if (employee.dropletId) {
    const powered = await powerOnEmployeeDroplet(id);
    if (!powered) {
      return NextResponse.json(
        { error: "Failed to power on droplet" },
        { status: 502 },
      );
    }

    // Mark as active immediately so the UI updates, set droplet to booting
    await db
      .update(employees)
      .set({
        status: "active",
        dropletStatus: "booting",
        errorMessage: null,
        updatedAt: new Date(),
      } as any)
      .where(eq(employees.id, id));

    // Poll for health recovery (droplet takes ~30-60s to boot)
    let recovered = false;
    if (employee.dropletIp) {
      await new Promise((r) => setTimeout(r, 15000));
      for (let i = 0; i < 8; i++) {
        const health = await checkDropletHealth(employee.dropletIp);
        if (health.ok) {
          recovered = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 5000));
      }
    }

    if (recovered) {
      const [updated] = await db
        .update(employees)
        .set({
          status: "active",
          dropletStatus: "active",
          lastHealthAt: new Date(),
          errorMessage: null,
          updatedAt: new Date(),
        } as any)
        .where(eq(employees.id, id))
        .returning();
      const { gatewayToken, interserviceSecret, ...safe } = updated as any;
      return NextResponse.json({
        employee: safe,
        message: `${employee.name} is back online.`,
      });
    }

    // Didn't recover in time but droplet is booting — health cron will update
    const [current] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, id))
      .limit(1);
    const { gatewayToken, interserviceSecret, ...safe } = current as any;
    return NextResponse.json({
      employee: safe,
      message: `${employee.name}'s server is powering on. It may take another minute to be fully ready.`,
    });
  }

  // No droplet (demo mode) — just set active
  const [updated] = await db
    .update(employees)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(employees.id, id))
    .returning();

  const { gatewayToken, interserviceSecret, ...safe } = updated as any;
  return NextResponse.json({ employee: safe });
}
