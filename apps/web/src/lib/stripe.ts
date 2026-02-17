import Stripe from "stripe";
import {
  EMPLOYEE_TIERS,
  ADDON_PRICING,
  calculateAddonTotal,
  getAddonPrice,
  type EmployeeTier,
  type AddonConfig,
} from "@ai-employees/shared";

// ── Stripe Client ─────────────────────────────────────

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key, { apiVersion: "2026-01-28.clover" });
  }
  return _stripe;
}

// ── Price Building ────────────────────────────────────
// We use Stripe Checkout with ad-hoc price_data so we don't
// need to pre-create products/prices in the Stripe Dashboard.
// Each employee subscription has a single line item with the
// total monthly cost (base + add-ons) baked in.

export interface HireCheckoutParams {
  tier: EmployeeTier;
  employeeName: string;
  channels: string[];
  capabilities: string[];
  expertise: string[];
}

/** Build the total monthly price in cents for an employee hire */
export function calculateTotalPriceCents(params: HireCheckoutParams): number {
  const base = EMPLOYEE_TIERS[params.tier].priceMonthly;
  const addons = calculateAddonTotal(
    params.tier,
    params.channels,
    params.capabilities,
    params.expertise,
  );
  return (base + addons) * 100; // dollars → cents
}

/** Build human-readable line items for the checkout page */
export function buildLineItemDescription(params: HireCheckoutParams): string {
  const tier = EMPLOYEE_TIERS[params.tier];
  const parts = [`${tier.label} — ${tier.creditsIncluded} credits/mo`];

  // Collect paid add-ons
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

/** Create a Stripe Checkout Session for hiring an employee */
export async function createHireCheckoutSession(opts: {
  companyId: string;
  stripeCustomerId: string;
  params: HireCheckoutParams;
  /** Full hiring form payload to persist through checkout */
  hirePayload: Record<string, unknown>;
  successUrl: string;
  cancelUrl: string;
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  const priceCents = calculateTotalPriceCents(opts.params);
  const baseCents = EMPLOYEE_TIERS[opts.params.tier].priceMonthly * 100;
  const addonCents = priceCents - baseCents;

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
            name: `AI Employee: ${opts.params.employeeName}`,
            description: buildLineItemDescription(opts.params),
          },
          unit_amount: priceCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      companyId: opts.companyId,
      employeeName: opts.params.employeeName,
      tier: opts.params.tier,
      basePriceMonthly: String(EMPLOYEE_TIERS[opts.params.tier].priceMonthly),
      addonPriceMonthly: String(addonCents / 100),
      // Store the full hire payload as JSON so the webhook can create the employee
      hirePayload: JSON.stringify(opts.hirePayload),
    },
    subscription_data: {
      metadata: {
        companyId: opts.companyId,
        tier: opts.params.tier,
      },
    },
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
  });

  return session;
}

/** Get or create a Stripe customer for a company */
export async function getOrCreateStripeCustomer(
  companyId: string,
  companyName: string,
  email: string,
  existingStripeId?: string | null,
): Promise<string> {
  const stripe = getStripe();

  if (existingStripeId) {
    // Verify it still exists
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
