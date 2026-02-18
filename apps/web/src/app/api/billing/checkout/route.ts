import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, users, subscriptions, employees, pendingHires } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";

export const maxDuration = 60; // Allow up to 60s for Stripe + DO API calls
import {
  getOrCreateStripeCustomer,
  createFirstHireCheckout,
  addEmployeeToSubscription,
  calculateTotalPriceDollars,
  type EmployeePricingParams,
} from "@/lib/stripe";
import {
  EMPLOYEE_TIERS,
  type EmployeeTier,
} from "@ai-employees/shared";

/**
 * POST /api/billing/checkout
 *
 * Two modes:
 * 1) Company has no subscription → creates Stripe Checkout Session, returns { url }
 * 2) Company has active subscription → adds line item directly, provisions employee, returns { employee }
 */
export async function POST(request: NextRequest) {
  try {
    const token =
      request.cookies.get("token")?.value ||
      request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const session = await verifyToken(token);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const {
      name,
      jobTitle,
      tier = "junior",
      channels = [],
      capabilities = [],
      expertise = [],
      ...restPayload
    } = body;

    if (!name || !jobTitle) {
      return NextResponse.json({ error: "name and jobTitle are required" }, { status: 400 });
    }

    if (!EMPLOYEE_TIERS[tier as EmployeeTier]) {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }

    // Fail fast if Stripe is not configured — let the frontend fall through to direct hire
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Billing is not configured. STRIPE_SECRET_KEY is missing." },
        { status: 501 },
      );
    }

    // Get company & user
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, session.companyId))
      .limit(1);
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Get or create Stripe customer
    let stripeCustomerId: string;
    try {
      stripeCustomerId = await getOrCreateStripeCustomer(
        company.id,
        company.name,
        user.email,
        company.stripeCustomerId,
      );
    } catch (err: any) {
      console.error("Stripe customer creation failed:", err.message);
      // Return a clear error so the user (and frontend) know Stripe is broken
      const isAuthError = err.type === "StripeAuthenticationError" || err.message?.includes("API key");
      return NextResponse.json(
        { error: isAuthError ? "Stripe API key is invalid. Please check STRIPE_SECRET_KEY." : `Stripe error: ${err.message}` },
        { status: 502 },
      );
    }

    // Persist stripeCustomerId if new
    if (stripeCustomerId !== company.stripeCustomerId) {
      await db
        .update(companies)
        .set({ stripeCustomerId, updatedAt: new Date() })
        .where(eq(companies.id, company.id));
    }

    const pricing: EmployeePricingParams = {
      tier: tier as EmployeeTier,
      employeeName: name,
      channels,
      capabilities,
      expertise,
    };

    const hirePayload = {
      name,
      jobTitle,
      tier,
      channels,
      capabilities,
      expertise,
      ...restPayload,
    };

    // Check if company already has an active subscription
    const [existingSub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.companyId, company.id))
      .limit(1);

    const hasActiveSubscription =
      existingSub && (existingSub.status === "active" || existingSub.status === "trialing");

    if (hasActiveSubscription) {
      // ── Subsequent hire: add line item to existing subscription ──
      let subscriptionItemId: string;
      try {
        subscriptionItemId = await addEmployeeToSubscription({
          stripeSubscriptionId: existingSub.stripeSubscriptionId,
          pricing,
        });
      } catch (err: any) {
        console.error("Stripe addEmployeeToSubscription failed:", err.message, err.type);
        return NextResponse.json(
          { error: `Failed to add employee to subscription: ${err.message}` },
          { status: 502 },
        );
      }

      // Provision the employee immediately (same as POST /api/employees)
      const { provisionAndReturn } = await import("@/lib/hire");
      const result = await provisionAndReturn(session.companyId, hirePayload, {
        stripeSubscriptionItemId: subscriptionItemId,
        priceMonthly: calculateTotalPriceDollars(pricing),
      });

      return NextResponse.json(result, { status: 201 });
    }

    // ── First hire: redirect to Stripe Checkout ──
    // Store the hire payload in the DB to avoid Stripe's 500-char metadata limit
    const [pendingHire] = await db.insert(pendingHires).values({
      companyId: company.id,
      payload: hirePayload,
    }).returning();

    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || process.env.PLATFORM_URL || "http://localhost:3000";

    let checkoutSession;
    try {
      checkoutSession = await createFirstHireCheckout({
        stripeCustomerId,
        companyId: company.id,
        pricing,
        pendingHireId: pendingHire.id,
        successUrl: `${origin}/dashboard/hire?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/dashboard/hire?payment=cancelled`,
      });
    } catch (err: any) {
      console.error("Stripe createFirstHireCheckout failed:", err.message, err.type);
      return NextResponse.json(
        { error: `Failed to create checkout session: ${err.message}` },
        { status: 502 },
      );
    }

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err: any) {
    console.error("POST /api/billing/checkout error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to process checkout" },
      { status: 500 },
    );
  }
}
