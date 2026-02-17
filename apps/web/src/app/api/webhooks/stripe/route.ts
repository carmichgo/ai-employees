import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, employees, subscriptions } from "@/lib/schema";
import { getStripe, calculateTotalPriceDollars, type EmployeePricingParams } from "@/lib/stripe";
import { provisionAndReturn } from "@/lib/hire";
import type { EmployeeTier } from "@ai-employees/shared";
import type Stripe from "stripe";

export const runtime = "nodejs";

/**
 * POST /api/webhooks/stripe
 * Handles Stripe webhook events for the company subscription lifecycle.
 */
export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const body = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    console.error("Stripe webhook signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        break;
    }
  } catch (err: any) {
    console.error(`Error handling Stripe event ${event.type}:`, err);
    return NextResponse.json({ error: "Webhook handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ── checkout.session.completed ─────────────────────────
// First employee hire — Stripe just collected payment and created the subscription.
// We need to: save the subscription record, then provision the employee.

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.mode !== "subscription") return;

  const companyId = session.metadata?.companyId;
  const hirePayloadRaw = session.metadata?.hirePayload;
  if (!companyId || !hirePayloadRaw) {
    console.error("Checkout session missing companyId or hirePayload metadata");
    return;
  }

  const hirePayload = JSON.parse(hirePayloadRaw);
  const stripeSubscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : (session.subscription as any)?.id;

  if (!stripeSubscriptionId) {
    console.error("Checkout session missing subscription ID");
    return;
  }

  const stripeCustomerId =
    typeof session.customer === "string"
      ? session.customer
      : (session.customer as any)?.id || "";

  // Fetch the subscription to get period info and the first item ID
  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId) as any;

  // Save the company-level subscription record
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

  // Get the first subscription item ID (the employee line item)
  const firstItemId: string | undefined = sub.items?.data?.[0]?.id;

  // Calculate price for the employee
  const tier = (hirePayload.tier || "junior") as EmployeeTier;
  const pricing: EmployeePricingParams = {
    tier,
    employeeName: hirePayload.name,
    channels: hirePayload.channels || [],
    capabilities: hirePayload.capabilities || [],
    expertise: hirePayload.expertise || [],
  };
  const priceMonthly = calculateTotalPriceDollars(pricing);

  // Provision the employee
  await provisionAndReturn(companyId, hirePayload, firstItemId ? {
    stripeSubscriptionItemId: firstItemId,
    priceMonthly,
  } : undefined);
}

// ── customer.subscription.updated ──────────────────────
// Sync status. If subscription goes past_due/unpaid, pause all employees.

async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  const stripeSubId = sub.id;
  const subAny = sub as any;

  await db
    .update(subscriptions)
    .set({
      status: sub.status,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      ...(subAny.current_period_start && {
        currentPeriodStart: new Date(subAny.current_period_start * 1000),
      }),
      ...(subAny.current_period_end && {
        currentPeriodEnd: new Date(subAny.current_period_end * 1000),
      }),
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubId));

  // If payment is failing, pause all employees for this company
  if (sub.status === "past_due" || sub.status === "unpaid") {
    const [record] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, stripeSubId))
      .limit(1);

    if (record) {
      const companyEmployees = await db
        .select()
        .from(employees)
        .where(eq(employees.companyId, record.companyId));

      for (const emp of companyEmployees) {
        if (emp.status === "active") {
          await db
            .update(employees)
            .set({ status: "paused", updatedAt: new Date() })
            .where(eq(employees.id, emp.id));
        }
      }
    }
  }
}

// ── customer.subscription.deleted ──────────────────────
// Subscription cancelled — terminate all employees for this company.

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const stripeSubId = sub.id;

  await db
    .update(subscriptions)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubId));

  const [record] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubId))
    .limit(1);

  if (record) {
    const companyEmployees = await db
      .select()
      .from(employees)
      .where(eq(employees.companyId, record.companyId));

    for (const emp of companyEmployees) {
      if (emp.status !== "terminated") {
        await db
          .update(employees)
          .set({ status: "terminated", updatedAt: new Date() })
          .where(eq(employees.id, emp.id));
      }
    }
  }
}

// ── invoice.payment_failed ─────────────────────────────

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const inv = invoice as any;
  const stripeSubId =
    typeof inv.subscription === "string"
      ? inv.subscription
      : inv.subscription?.id;

  if (!stripeSubId) return;

  await db
    .update(subscriptions)
    .set({ status: "past_due", updatedAt: new Date() })
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubId));
}
