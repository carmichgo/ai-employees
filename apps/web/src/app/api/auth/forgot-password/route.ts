import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-change-me-in-production",
);

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Always return success to avoid leaking which emails exist
    const successResponse = {
      message: "If an account with that email exists, a password reset link has been sent.",
    };

    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    if (!user) {
      return NextResponse.json(successResponse);
    }

    // Generate a short-lived reset token (1 hour)
    const resetToken = await new SignJWT({ userId: user.id, type: "password-reset" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(JWT_SECRET);

    // Build reset URL
    const origin =
      request.headers.get("origin") ||
      request.headers.get("x-forwarded-host") ||
      "http://localhost:3000";
    const baseUrl = origin.startsWith("http") ? origin : `https://${origin}`;
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

    // Log the reset URL (visible in Vercel logs / console)
    console.log(`[PASSWORD RESET] Email: ${user.email} | URL: ${resetUrl}`);

    return NextResponse.json({ ...successResponse, resetUrl });
  } catch (error: any) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
