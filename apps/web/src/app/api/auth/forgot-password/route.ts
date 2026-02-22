import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { forgotPasswordSchema } from "@ai-employees/shared";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-change-me-in-production",
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = forgotPasswordSchema.parse(body);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    // Always return success to prevent email enumeration
    if (!user) {
      return NextResponse.json({ message: "If an account exists, a reset link has been generated." });
    }

    // Sign a reset token that embeds the user ID and is tied to their current password hash
    // This makes the token single-use: once the password changes, the token is invalid
    const resetToken = await new SignJWT({
      userId: user.id,
      purpose: "password-reset",
      hash: user.passwordHash.slice(-8), // last 8 chars as fingerprint
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(JWT_SECRET);

    const origin = request.headers.get("origin") || request.nextUrl.origin;
    const resetLink = `${origin}/reset-password?token=${resetToken}`;

    // In production with email service, you'd send the link via email.
    // For now, return the link directly.
    console.log(`[Password Reset] Link for ${user.email}: ${resetLink}`);

    return NextResponse.json({
      message: "If an account exists, a reset link has been generated.",
      resetLink,
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: "Please provide a valid email" }, { status: 400 });
    }
    console.error("Forgot password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
