import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, users } from "@/lib/schema";
import { signToken } from "@/lib/auth";
import { registerSchema } from "@ai-employees/shared";

export async function POST(request: NextRequest) {
  try {
    // Validate DATABASE_URL early
    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        { error: "Server misconfigured", detail: "DATABASE_URL is not set" },
        { status: 500 },
      );
    }

    const body = await request.json();
    const input = registerSchema.parse(body);

    // Check slug
    const existingCompany = await db
      .select()
      .from(companies)
      .where(eq(companies.slug, input.companySlug))
      .limit(1);
    if (existingCompany.length > 0) {
      return NextResponse.json({ error: "Company slug already taken" }, { status: 409 });
    }

    // Check email
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (existingUser.length > 0) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    // Create company
    const [company] = await db
      .insert(companies)
      .values({ name: input.companyName, slug: input.companySlug })
      .returning();

    // Create user
    const passwordHash = await bcrypt.hash(input.password, 12);
    const [user] = await db
      .insert(users)
      .values({
        companyId: company.id,
        email: input.email,
        name: input.name,
        passwordHash,
        role: "owner",
      })
      .returning();

    const token = await signToken({
      userId: user.id,
      companyId: company.id,
      role: user.role,
    });

    const response = NextResponse.json(
      {
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        company: {
          id: company.id,
          name: company.name,
          slug: company.slug,
          plan: company.plan,
        },
      },
      { status: 201 },
    );

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
      return NextResponse.json(
        { error: "Validation error", details: error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    console.error("Register error:", error);
    return NextResponse.json(
      { error: "Internal server error", detail: error?.message || String(error) },
      { status: 500 },
    );
  }
}
