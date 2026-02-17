import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, employees, channelConnections, subscriptions } from "@/lib/schema";
import { getStripe } from "@/lib/stripe";
import { getCompanyBackend, createBackendClient } from "@/lib/backend";
import { createCompanyDroplet, isDropletProvisioningEnabled } from "@/lib/digitalocean";
import {
  getJobTemplate,
  PLAN_LIMITS,
  type PlanTier,
  getModelForTier,
  type EmployeeTier,
} from "@ai-employees/shared";
import type Stripe from "stripe";

// Disable Next.js body parsing — Stripe needs the raw body for signature verification
export const runtime = "nodejs";

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * POST /api/webhooks/stripe
 * Handles Stripe webhook events for subscription lifecycle.
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
        // Unhandled event type — that's fine
        break;
    }
  } catch (err: any) {
    console.error(`Error handling Stripe event ${event.type}:`, err);
    return NextResponse.json({ error: "Webhook handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ── Event Handlers ─────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // Only handle subscription checkouts (not one-time payments)
  if (session.mode !== "subscription") return;

  const companyId = session.metadata?.companyId;
  const hirePayloadRaw = session.metadata?.hirePayload;
  const tier = (session.metadata?.tier || "junior") as EmployeeTier;
  const basePriceMonthly = parseInt(session.metadata?.basePriceMonthly || "0", 10);
  const addonPriceMonthly = parseInt(session.metadata?.addonPriceMonthly || "0", 10);

  if (!companyId || !hirePayloadRaw) {
    console.error("Checkout session missing companyId or hirePayload metadata");
    return;
  }

  const hirePayload = JSON.parse(hirePayloadRaw);
  const stripeSubscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  if (!stripeSubscriptionId) {
    console.error("Checkout session missing subscription ID");
    return;
  }

  const stripeCustomerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id || "";

  // Fetch the subscription to get period info
  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId) as any;

  // 1) Create the subscription record
  await db.insert(subscriptions).values({
    companyId,
    stripeSubscriptionId,
    stripeCustomerId,
    status: sub.status,
    tier,
    basePriceMonthly,
    addonPriceMonthly,
    addonItems: {
      channels: hirePayload.channels || [],
      capabilities: hirePayload.capabilities || [],
      expertise: hirePayload.expertise || [],
    },
    currentPeriodStart: sub.current_period_start ? new Date(sub.current_period_start * 1000) : undefined,
    currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : undefined,
  });

  // 2) Provision the employee (same logic as POST /api/employees)
  const employeeId = await provisionEmployee(companyId, hirePayload, tier);

  // 3) Link subscription to employee
  if (employeeId) {
    await db
      .update(subscriptions)
      .set({ employeeId, updatedAt: new Date() })
      .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));

    // Also update Stripe subscription metadata with the employee ID
    await stripe.subscriptions.update(stripeSubscriptionId, {
      metadata: { companyId, tier, employeeId },
    });
  }
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  const stripeSubId = sub.id;
  const subAny = sub as any;

  // Update local subscription record
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

  // If subscription went past_due or unpaid, pause the employee
  if (sub.status === "past_due" || sub.status === "unpaid") {
    const [record] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, stripeSubId))
      .limit(1);

    if (record?.employeeId) {
      await db
        .update(employees)
        .set({ status: "paused", updatedAt: new Date() })
        .where(eq(employees.id, record.employeeId));
    }
  }
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const stripeSubId = sub.id;

  // Update local status
  await db
    .update(subscriptions)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubId));

  // Terminate the employee
  const [record] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubId))
    .limit(1);

  if (record?.employeeId) {
    await db
      .update(employees)
      .set({ status: "terminated", updatedAt: new Date() })
      .where(eq(employees.id, record.employeeId));
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const inv = invoice as any;
  const stripeSubId =
    typeof inv.subscription === "string"
      ? inv.subscription
      : inv.subscription?.id;

  if (!stripeSubId) return;

  // Mark subscription as past_due
  await db
    .update(subscriptions)
    .set({ status: "past_due", updatedAt: new Date() })
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubId));
}

// ── Employee Provisioning ──────────────────────────────
// Same logic as POST /api/employees but called from the webhook.

async function provisionEmployee(
  companyId: string,
  input: Record<string, any>,
  tier: EmployeeTier,
): Promise<string | null> {
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!company) {
    console.error(`provisionEmployee: company ${companyId} not found`);
    return null;
  }

  let persona = input.persona;
  let goals = input.goals;
  let emoji = "🤖";

  if (input.templateId) {
    const template = getJobTemplate(input.templateId);
    if (template) {
      persona = persona || template.persona;
      goals = goals || template.goals;
      emoji = template.emoji;
    }
  }

  const gatewayToken = crypto.randomBytes(32).toString("hex");
  const tierModel = getModelForTier(tier);

  // Check if company has an active droplet backend
  const backendConfig = await getCompanyBackend(companyId);

  if (backendConfig) {
    try {
      const backend = createBackendClient(backendConfig);
      const result = await backend.provisionEmployee({
        companyId,
        name: input.name,
        jobTitle: input.jobTitle,
        tier,
        templateId: input.templateId || undefined,
        persona: persona || undefined,
        goals: goals || undefined,
        personalityConfig: input.personalityConfig || undefined,
        authorityConfig: input.authorityConfig || undefined,
        channels: input.channels || [],
        channelCredentials: {},
        modelConfig: input.modelConfig,
        toolsAllow: input.toolsAllow || undefined,
        skills: input.skills || undefined,
      });

      if (result.employee?.id && input.channels?.length) {
        await createChannelConnectionRows(result.employee.id, input.channels);
      }

      return result.employee?.id || null;
    } catch (err: any) {
      console.error("provisionEmployee backend error:", err);
    }
  }

  // Determine status based on droplet availability
  let status = "active"; // demo mode
  if (isDropletProvisioningEnabled()) {
    if (company.dropletStatus !== "active") {
      try {
        await createCompanyDroplet(companyId);
      } catch (err: any) {
        console.error("provisionEmployee droplet creation error:", err);
      }
      status = "provisioning";
    }
  }

  const [employee] = await db
    .insert(employees)
    .values({
      companyId,
      name: input.name,
      jobTitle: input.jobTitle,
      templateId: input.templateId,
      tier,
      emoji,
      persona,
      goals,
      personalityConfig: input.personalityConfig || {
        autonomy: "high",
        proactivity: "proactive",
        communication: "concise",
      },
      authorityConfig: input.authorityConfig || {
        defaultRole: "manager",
        members: [],
      },
      modelConfig: input.modelConfig || { primary: tierModel },
      toolsConfig: input.toolsAllow ? { allow: input.toolsAllow } : {},
      gatewayToken,
      status,
      containerName: `ai-emp-${company.slug}-${slugify(input.name)}-${crypto.randomBytes(3).toString("hex")}`,
    })
    .returning();

  if (input.channels?.length) {
    await createChannelConnectionRows(employee.id, input.channels);
  }

  return employee.id;
}

async function createChannelConnectionRows(employeeId: string, channels: string[]) {
  if (!channels.length) return;
  const CHANNEL_NAMES: Record<string, string> = {
    slack: "Slack", email: "Email", telegram: "Telegram",
    whatsapp: "WhatsApp", discord: "Discord", signal: "Signal",
    teams: "Microsoft Teams", "google-chat": "Google Chat", matrix: "Matrix",
  };
  await db.insert(channelConnections).values(
    channels.map((ch) => ({
      employeeId,
      channelType: ch,
      name: CHANNEL_NAMES[ch] || ch,
      status: ch === "slack" ? "connected" : "pending",
    })),
  );
}

