import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, users } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import {
  createHireCheckoutSession,
  getOrCreateStripeCustomer,
  type HireCheckoutParams,
} from "@/lib/stripe";
import {
  EMPLOYEE_TIERS,
  calculateAddonTotal,
  type EmployeeTier,
} from "@ai-employees/shared";

/**
 * POST /api/billing/checkout
 * Creates a Stripe Checkout Session for hiring an employee.
 * Returns { url } — redirect the user there.
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
    const stripeCustomerId = await getOrCreateStripeCustomer(
      company.id,
      company.name,
      user.email,
      company.stripeCustomerId,
    );

    // Persist stripeCustomerId if new
    if (stripeCustomerId !== company.stripeCustomerId) {
      await db
        .update(companies)
        .set({ stripeCustomerId, updatedAt: new Date() })
        .where(eq(companies.id, company.id));
    }

    const checkoutParams: HireCheckoutParams = {
      tier: tier as EmployeeTier,
      employeeName: name,
      channels,
      capabilities,
      expertise,
    };

    // Full hire payload passed through Stripe metadata → webhook will use it
    const hirePayload = {
      name,
      jobTitle,
      tier,
      channels,
      capabilities,
      expertise,
      ...restPayload,
    };

    const origin = request.headers.get("origin") || process.env.PLATFORM_URL || "http://localhost:3000";

    const checkoutSession = await createHireCheckoutSession({
      companyId: company.id,
      stripeCustomerId,
      params: checkoutParams,
      hirePayload,
      successUrl: `${origin}/dashboard/hire?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/dashboard/hire?payment=cancelled`,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err: any) {
    console.error("POST /api/billing/checkout error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create checkout session" },
      { status: 500 },
    );
  }
}
