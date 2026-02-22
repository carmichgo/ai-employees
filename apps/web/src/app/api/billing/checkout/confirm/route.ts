import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { subscriptions, pendingHires } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import { getStripe, calculateTotalPriceDollars, type EmployeePricingParams } from "@/lib/stripe";
import { provisionAndReturn } from "@/lib/hire";
import type { EmployeeTier } from "@ai-employees/shared";

export const maxDuration = 60;

/**
 * POST /api/billing/checkout/confirm
 *
 * Called by the frontend after Stripe Checkout redirects back with a session_id.
 * Fulfills the hire if the webhook hasn't already done so.
 */
export async function POST(request: NextRequest) {
  try {
    const token =
      request.cookies.get("token")?.value ||
      request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const session = await verifyToken(token);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { sessionId } = await request.json();
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    // Retrieve the checkout session from Stripe
    const stripe = getStripe();
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

    if (checkoutSession.payment_status !== "paid") {
      return NextResponse.json({ error: "Payment not completed" }, { status: 402 });
    }

    const companyId = checkoutSession.metadata?.companyId;
    const pendingHireId = checkoutSession.metadata?.pendingHireId;

    if (!companyId || !pendingHireId) {
      return NextResponse.json({ error: "Invalid checkout session metadata" }, { status: 400 });
    }

    // Verify the user belongs to this company
    if (companyId !== session.companyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check if this pending hire was already fulfilled (by the webhook)
    const [pendingHire] = await db
      .select()
      .from(pendingHires)
      .where(eq(pendingHires.id, pendingHireId))
      .limit(1);

    if (!pendingHire) {
      return NextResponse.json({ error: "Pending hire not found" }, { status: 404 });
    }

    if (pendingHire.status === "completed") {
      // Already provisioned by the webhook — just return success
      return NextResponse.json({ alreadyCompleted: true, message: "Employee was already created" });
    }

    // Fulfill the hire
    const hirePayload = pendingHire.payload as Record<string, any>;

    const stripeSubscriptionId =
      typeof checkoutSession.subscription === "string"
        ? checkoutSession.subscription
        : (checkoutSession.subscription as any)?.id;

    if (!stripeSubscriptionId) {
      return NextResponse.json({ error: "Missing subscription ID from checkout" }, { status: 500 });
    }

    const stripeCustomerId =
      typeof checkoutSession.customer === "string"
        ? checkoutSession.customer
        : (checkoutSession.customer as any)?.id || "";

    // Fetch subscription details
    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId) as any;

    // Save/upsert the subscription record
    await db.insert(subscriptions).values({
      companyId,
      stripeSubscriptionId,
      stripeCustomerId,
      status: sub.status || "active",
      currentPeriodStart: sub.current_period_start
        ? new Date(sub.current_period_start * 1000)
        : undefined,
      currentPeriodEnd: sub.current_period_end
        ? new Date(sub.current_period_end * 1000)
        : undefined,
    }).onConflictDoNothing();

    // Get the first subscription item ID
    const firstItemId: string | undefined = sub.items?.data?.[0]?.id;

    // Calculate price
    const tier = (hirePayload.tier || "junior") as EmployeeTier;
    const pricing: EmployeePricingParams = {
      tier,
      employeeName: hirePayload.name,
      channels: hirePayload.channels || [],
      capabilities: hirePayload.capabilities || [],
      expertise: hirePayload.expertise || [],
    };
    const priceMonthly = calculateTotalPriceDollars(pricing);

    // Mark as completed before provisioning to prevent double-creation
    await db
      .update(pendingHires)
      .set({ status: "completed" })
      .where(eq(pendingHires.id, pendingHireId));

    // Provision the employee
    const result = await provisionAndReturn(companyId, hirePayload, firstItemId ? {
      stripeSubscriptionItemId: firstItemId,
      priceMonthly,
    } : undefined);

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/billing/checkout/confirm error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to confirm checkout" },
      { status: 500 },
    );
  }
}
