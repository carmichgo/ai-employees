import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import { createPortalSession } from "@/lib/stripe";

/**
 * POST /api/billing/portal
 * Creates a Stripe Customer Portal session for managing subscriptions.
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

    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, session.companyId))
      .limit(1);

    if (!company?.stripeCustomerId) {
      return NextResponse.json(
        { error: "No billing account found. Hire an employee to set up billing." },
        { status: 404 },
      );
    }

    const origin = request.headers.get("origin") || process.env.PLATFORM_URL || "http://localhost:3000";

    const portalSession = await createPortalSession(
      company.stripeCustomerId,
      `${origin}/dashboard/settings`,
    );

    return NextResponse.json({ url: portalSession.url });
  } catch (err: any) {
    console.error("POST /api/billing/portal error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create portal session" },
      { status: 500 },
    );
  }
}
