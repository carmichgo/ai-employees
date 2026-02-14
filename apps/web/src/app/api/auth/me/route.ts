import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, users } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, payload.userId))
    .limit(1);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, payload.companyId))
    .limit(1);

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    company: company
      ? {
          id: company.id,
          name: company.name,
          slug: company.slug,
          plan: company.plan,
        }
      : null,
  });
}
