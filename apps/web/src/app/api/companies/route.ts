import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";

async function authenticate(request: NextRequest) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
}

const VALID_PLANS = ["starter", "dedicated"];

// PATCH /api/companies — update company settings (plan, etc.)
export async function PATCH(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { plan } = body;

  if (plan !== undefined) {
    if (!VALID_PLANS.includes(plan)) {
      return NextResponse.json({ error: `Invalid plan. Must be one of: ${VALID_PLANS.join(", ")}` }, { status: 400 });
    }

    const [updated] = await db
      .update(companies)
      .set({ plan, updatedAt: new Date() })
      .where(eq(companies.id, session.companyId))
      .returning();

    return NextResponse.json({ company: updated });
  }

  return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
}
