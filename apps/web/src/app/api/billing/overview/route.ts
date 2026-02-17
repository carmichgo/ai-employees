import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, employees, subscriptions } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";

/**
 * GET /api/billing/overview
 * Returns a comprehensive billing summary: subscription, employees, invoices, payment methods.
 */
export async function GET(request: NextRequest) {
  try {
    const token =
      request.cookies.get("token")?.value ||
      request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const session = await verifyToken(token);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, session.companyId))
      .limit(1);

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // Get employees with billing info
    const allEmployees = await db
      .select({
        id: employees.id,
        name: employees.name,
        jobTitle: employees.jobTitle,
        tier: employees.tier,
        status: employees.status,
        emoji: employees.emoji,
        priceMonthly: employees.priceMonthly,
        stripeSubscriptionItemId: employees.stripeSubscriptionItemId,
        createdAt: employees.createdAt,
      })
      .from(employees)
      .where(eq(employees.companyId, session.companyId));

    // Get subscriptions from DB
    const subs = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.companyId, session.companyId))
      .orderBy(subscriptions.createdAt);

    const activeSub = subs.find((s) => s.status === "active" || s.status === "trialing");

    // Calculate totals
    const activeEmployees = allEmployees.filter((e) => e.status !== "terminated");
    const monthlyTotal = activeEmployees.reduce((sum, e) => sum + (e.priceMonthly || 0), 0);

    // Try to fetch Stripe data if customer exists
    let paymentMethods: any[] = [];
    let invoices: any[] = [];
    let stripeSubscription: any = null;

    if (company.stripeCustomerId) {
      try {
        const stripe = getStripe();

        // Fetch payment methods
        const pmList = await stripe.paymentMethods.list({
          customer: company.stripeCustomerId,
          type: "card",
        });
        paymentMethods = pmList.data.map((pm) => ({
          id: pm.id,
          brand: pm.card?.brand || "unknown",
          last4: pm.card?.last4 || "****",
          expMonth: pm.card?.exp_month,
          expYear: pm.card?.exp_year,
          isDefault: false,
        }));

        // Mark default payment method
        if (activeSub?.stripeSubscriptionId) {
          const sub = await stripe.subscriptions.retrieve(activeSub.stripeSubscriptionId);
          stripeSubscription = {
            id: sub.id,
            status: sub.status,
            currentPeriodStart: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
            currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            defaultPaymentMethod: typeof sub.default_payment_method === "string"
              ? sub.default_payment_method
              : sub.default_payment_method?.id || null,
          };

          const defaultPm = stripeSubscription.defaultPaymentMethod;
          if (defaultPm) {
            paymentMethods = paymentMethods.map((pm) => ({
              ...pm,
              isDefault: pm.id === defaultPm,
            }));
          }
        }

        // Fetch recent invoices
        const invList = await stripe.invoices.list({
          customer: company.stripeCustomerId,
          limit: 12,
        });
        invoices = invList.data.map((inv) => ({
          id: inv.id,
          number: inv.number,
          status: inv.status,
          amountDue: inv.amount_due,
          amountPaid: inv.amount_paid,
          currency: inv.currency,
          created: new Date(inv.created * 1000).toISOString(),
          periodStart: inv.period_start ? new Date(inv.period_start * 1000).toISOString() : null,
          periodEnd: inv.period_end ? new Date(inv.period_end * 1000).toISOString() : null,
          hostedUrl: inv.hosted_invoice_url,
          pdfUrl: inv.invoice_pdf,
        }));
      } catch (err: any) {
        console.error("Stripe data fetch error:", err.message);
        // Continue without Stripe data — don't fail the whole request
      }
    }

    return NextResponse.json({
      subscription: activeSub
        ? {
            id: activeSub.id,
            stripeSubscriptionId: activeSub.stripeSubscriptionId,
            status: activeSub.status,
            currentPeriodStart: stripeSubscription?.currentPeriodStart || activeSub.currentPeriodStart,
            currentPeriodEnd: stripeSubscription?.currentPeriodEnd || activeSub.currentPeriodEnd,
            cancelAtPeriodEnd: stripeSubscription?.cancelAtPeriodEnd ?? activeSub.cancelAtPeriodEnd,
          }
        : null,
      employees: allEmployees.map((e) => ({
        id: e.id,
        name: e.name,
        jobTitle: e.jobTitle,
        tier: e.tier,
        status: e.status,
        emoji: e.emoji,
        priceMonthly: e.priceMonthly,
        createdAt: e.createdAt,
      })),
      monthlyTotal,
      paymentMethods,
      invoices,
    });
  } catch (err: any) {
    console.error("GET /api/billing/overview error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
