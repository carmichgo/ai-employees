import Stripe from "stripe";
import {
  EMPLOYEE_TIERS,
  calculateAddonTotal,
  getAddonPrice,
  BYOK_PRICE_MONTHLY,
  type EmployeeTier,
  type AddonConfig,
  type HostingMode,
} from "@ai-employees/shared";

// ── Stripe Client ─────────────────────────────────────

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key, {
      apiVersion: "2026-01-28.clover",
      timeout: 20000, // 20s timeout to avoid Vercel serverless function timeouts
      maxNetworkRetries: 2, // Retry transient network errors
    });
  }
  return _stripe;
}

// ── Price Helpers ─────────────────────────────────────

export interface EmployeePricingParams {
  tier: EmployeeTier;
  employeeName: string;
  channels: string[];
  capabilities: string[];
  expertise: string[];
  hostingMode?: HostingMode;
}

/** Total monthly price in cents for one employee */
export function calculateTotalPriceCents(params: EmployeePricingParams): number {
  // BYOK: flat infrastructure fee, no add-on charges
  if (params.hostingMode === "byok") {
    return BYOK_PRICE_MONTHLY * 100;
  }
  const base = EMPLOYEE_TIERS[params.tier].priceMonthly;
  const addons = calculateAddonTotal(
    params.tier,
    params.channels,
    params.capabilities,
    params.expertise,
  );
  return (base + addons) * 100;
}

/** Total monthly price in dollars for one employee */
export function calculateTotalPriceDollars(params: EmployeePricingParams): number {
  return calculateTotalPriceCents(params) / 100;
}

/** Build description for Stripe line item */
export function buildLineItemDescription(params: EmployeePricingParams): string {
  if (params.hostingMode === "byok") {
    return `BYOK — Bring Your Own Key (infrastructure only)`;
  }
  const tier = EMPLOYEE_TIERS[params.tier];
  const parts = [`${tier.label} — ${tier.creditsIncluded} credits/mo`];

  const addons: string[] = [];
  const categories: (keyof AddonConfig)[] = ["channels", "capabilities", "expertise"];
  const items = [params.channels, params.capabilities, params.expertise];

  for (let i = 0; i < categories.length; i++) {
    for (const itemId of items[i]) {
      const price = getAddonPrice(categories[i], itemId, params.tier);
      if (price !== "free") addons.push(`${itemId} (+$${price})`);
    }
  }

  if (addons.length > 0) {
    parts.push(`Add-ons: ${addons.join(", ")}`);
  }

  return parts.join(" | ");
}

// ── Customer Management ───────────────────────────────

/** Get or create a Stripe customer for a company */
export async function getOrCreateStripeCustomer(
  companyId: string,
  companyName: string,
  email: string,
  existingStripeId?: string | null,
): Promise<string> {
  const stripe = getStripe();

  if (existingStripeId) {
    try {
      await stripe.customers.retrieve(existingStripeId);
      return existingStripeId;
    } catch {
      // Customer was deleted — create a new one
    }
  }

  const customer = await stripe.customers.create({
    name: companyName,
    email,
    metadata: { companyId },
  });

  return customer.id;
}

// ── Single-Subscription Model ─────────────────────────
// One subscription per company. Each employee is a line item
// (subscription item) with its own ad-hoc price.

/**
 * First employee hire — no subscription yet.
 * Creates a Stripe Checkout Session to collect payment method
 * and create the subscription with one line item.
 */
export async function createFirstHireCheckout(opts: {
  stripeCustomerId: string;
  companyId: string;
  pricing: EmployeePricingParams;
  pendingHireId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  const priceCents = calculateTotalPriceCents(opts.pricing);

  const session = await stripe.checkout.sessions.create({
    customer: opts.stripeCustomerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          recurring: { interval: "month" },
          product_data: {
            name: `AI Employee: ${opts.pricing.employeeName}`,
            description: buildLineItemDescription(opts.pricing),
          },
          unit_amount: priceCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      companyId: opts.companyId,
      pendingHireId: opts.pendingHireId,
    },
    subscription_data: {
      metadata: { companyId: opts.companyId },
    },
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
  });

  return session;
}

/**
 * Subsequent employee hires — subscription already exists.
 * Adds a new line item to the existing subscription.
 * Returns the new subscription item ID.
 */
export async function addEmployeeToSubscription(opts: {
  stripeSubscriptionId: string;
  pricing: EmployeePricingParams;
}): Promise<string> {
  const stripe = getStripe();
  const priceCents = calculateTotalPriceCents(opts.pricing);

  // Create an ad-hoc price for this employee
  const price = await stripe.prices.create({
    currency: "usd",
    recurring: { interval: "month" },
    product_data: {
      name: `AI Employee: ${opts.pricing.employeeName}`,
      metadata: {
        employeeName: opts.pricing.employeeName,
        tier: opts.pricing.tier,
      },
    },
    unit_amount: priceCents,
  });

  // Add as a new line item — Stripe prorates automatically
  const item = await stripe.subscriptionItems.create({
    subscription: opts.stripeSubscriptionId,
    price: price.id,
    quantity: 1,
    proration_behavior: "create_prorations",
  });

  return item.id;
}

/**
 * Update an employee's subscription item price when capabilities change.
 * Replaces the existing subscription item with a new one at the updated price.
 */
export async function updateEmployeeSubscriptionPrice(opts: {
  subscriptionItemId: string;
  stripeSubscriptionId: string;
  pricing: EmployeePricingParams;
}): Promise<string> {
  const stripe = getStripe();
  const priceCents = calculateTotalPriceCents(opts.pricing);

  // Create a new ad-hoc price for the updated capabilities
  const newPrice = await stripe.prices.create({
    currency: "usd",
    recurring: { interval: "month" },
    product_data: {
      name: `AI Employee: ${opts.pricing.employeeName}`,
      metadata: {
        employeeName: opts.pricing.employeeName,
        tier: opts.pricing.tier,
      },
    },
    unit_amount: priceCents,
  });

  // Swap the price on the existing subscription item
  const updatedItem = await stripe.subscriptionItems.update(
    opts.subscriptionItemId,
    {
      price: newPrice.id,
      proration_behavior: "create_prorations",
    },
  );

  return updatedItem.id;
}

/**
 * Remove an employee's line item from the subscription.
 * Called when an employee is terminated.
 */
export async function removeEmployeeFromSubscription(
  subscriptionItemId: string,
): Promise<void> {
  const stripe = getStripe();
  await stripe.subscriptionItems.del(subscriptionItemId, {
    proration_behavior: "create_prorations",
  });
}

/** Create a Stripe billing portal session */
export async function createPortalSession(
  stripeCustomerId: string,
  returnUrl: string,
): Promise<Stripe.BillingPortal.Session> {
  const stripe = getStripe();
  return stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });
}
