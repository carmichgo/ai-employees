import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, users } from "@/lib/schema";
import { signToken } from "@/lib/auth";
import { loginSchema } from "@ai-employees/shared";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = loginSchema.parse(body);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (!user) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1);

    const token = await signToken({
      userId: user.id,
      companyId: user.companyId,
      role: user.role,
    });

    const response = NextResponse.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      company: company
        ? { id: company.id, name: company.name, slug: company.slug, plan: company.plan }
        : null,
    });

    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: "Validation error" }, { status: 400 });
    }
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error", detail: error?.message || String(error) },
      { status: 500 },
    );
  }
}
