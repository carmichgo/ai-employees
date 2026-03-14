import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";

/**
 * GET /api/billing/subscriptions
 * List all subscriptions for the current company.
 */
export async function GET(request: NextRequest) {
  try {
    const token =
      request.cookies.get("token")?.value ||
      request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const session = await verifyToken(token);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const subs = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.companyId, session.companyId))
      .orderBy(subscriptions.createdAt);

    return NextResponse.json({ subscriptions: subs });
  } catch (err: any) {
    console.error("GET /api/billing/subscriptions error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch subscriptions" },
      { status: 500 },
    );
  }
}
