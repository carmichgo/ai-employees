/**
 * GET  /api/employees/[id]/capabilities — get current capabilities
 * PUT  /api/employees/[id]/capabilities — update capabilities and adjust billing
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, subscriptions } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import {
  CAPABILITY_OPTIONS,
  getAddonPrice,
  calculateAddonTotal,
  type EmployeeTier,
} from "@ai-employees/shared";

async function authenticate(request: NextRequest) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
}

/** Expand capability IDs to tool-allow entries */
function expandCapabilities(capIds: string[]): string[] {
  const tools = new Set<string>();
  for (const id of capIds) {
    const cap = CAPABILITY_OPTIONS.find((c) => c.id === id);
    if (cap) {
      for (const t of cap.toolsAllow) tools.add(t);
    }
  }
  return Array.from(tools);
}

// GET — get current capabilities for this employee
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

  // Reverse-map toolsConfig.allow back to capability IDs
  const toolsAllow: string[] = (employee.toolsConfig as any)?.allow || [];
  const activeCapabilities: string[] = [];

  for (const cap of CAPABILITY_OPTIONS) {
    // A capability is active if ALL its toolsAllow entries are in the employee's tools
    if (cap.toolsAllow.length > 0 && cap.toolsAllow.every((t) => toolsAllow.includes(t))) {
      activeCapabilities.push(cap.id);
    }
  }

  return NextResponse.json({
    capabilities: activeCapabilities,
    tier: employee.tier,
  });
}

// PUT — update capabilities and adjust billing
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { capabilities } = body as { capabilities: string[] };

  if (!Array.isArray(capabilities)) {
    return NextResponse.json({ error: "capabilities must be an array" }, { status: 400 });
  }

  // Validate capability IDs
  const validIds = new Set(CAPABILITY_OPTIONS.map((c) => c.id));
  for (const cap of capabilities) {
    if (!validIds.has(cap)) {
      return NextResponse.json({ error: `Unknown capability: ${cap}` }, { status: 400 });
    }
  }

  const [employee] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const tier = employee.tier as EmployeeTier;

  // Calculate price difference for confirmation
  const toolsAllow: string[] = (employee.toolsConfig as any)?.allow || [];
  const oldCapabilities: string[] = [];
  for (const cap of CAPABILITY_OPTIONS) {
    if (cap.toolsAllow.length > 0 && cap.toolsAllow.every((t) => toolsAllow.includes(t))) {
      oldCapabilities.push(cap.id);
    }
  }

  const oldAddonCost = calculateAddonTotal(tier, [], oldCapabilities, []);
  const newAddonCost = calculateAddonTotal(tier, [], capabilities, []);
  const priceDifference = newAddonCost - oldAddonCost;

  // Expand capabilities to tool-allow entries
  const newToolsAllow = expandCapabilities(capabilities);

  // Update the employee's toolsConfig
  const currentToolsConfig = (employee.toolsConfig as Record<string, unknown>) || {};
  const updatedToolsConfig = { ...currentToolsConfig, allow: newToolsAllow };

  await db
    .update(employees)
    .set({
      toolsConfig: updatedToolsConfig,
      updatedAt: new Date(),
    })
    .where(eq(employees.id, id));

  // Update Stripe billing if the employee has a subscription item and price changed
  let billingUpdated = false;
  if (priceDifference !== 0 && employee.stripeSubscriptionItemId) {
    try {
      // Get the subscription for this company
      const [sub] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.companyId, session.companyId))
        .limit(1);

      if (sub && (sub.status === "active" || sub.status === "trialing")) {
        const { updateEmployeeSubscriptionPrice, calculateTotalPriceDollars } = await import("@/lib/stripe");

        // Recalculate the full pricing (we need channels and expertise from the current state)
        // For now, we use the old price and just add the addon difference
        const newPriceMonthly = (employee.priceMonthly || 0) + priceDifference;

        await updateEmployeeSubscriptionPrice({
          subscriptionItemId: employee.stripeSubscriptionItemId,
          stripeSubscriptionId: sub.stripeSubscriptionId,
          pricing: {
            tier,
            employeeName: employee.name,
            channels: [], // Channels are billed separately via channel connections
            capabilities,
            expertise: [], // Expertise doesn't change here
          },
        });

        // Update the cached price on the employee
        await db
          .update(employees)
          .set({ priceMonthly: newPriceMonthly })
          .where(eq(employees.id, id));

        billingUpdated = true;
      }
    } catch (err: any) {
      console.error("Failed to update Stripe subscription:", err.message);
      // Don't fail the request — capabilities are updated, billing can be fixed manually
    }
  }

  // Regenerate configs on the droplet (fire-and-forget)
  if (employee.dropletIp && employee.interserviceSecret && employee.dropletStatus === "active") {
    fetch(`http://${employee.dropletIp}:3001/internal/regenerate-configs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-interservice-secret": employee.interserviceSecret,
      },
      signal: AbortSignal.timeout(15000),
    }).catch(() => {});
  }

  return NextResponse.json({
    capabilities,
    priceDifference,
    billingUpdated,
    message: priceDifference > 0
      ? `Capabilities updated. $${priceDifference}/mo added to your plan.`
      : priceDifference < 0
        ? `Capabilities updated. $${Math.abs(priceDifference)}/mo removed from your plan.`
        : "Capabilities updated.",
  });
}
