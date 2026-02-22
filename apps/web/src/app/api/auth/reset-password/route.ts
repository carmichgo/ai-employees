import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { resetPasswordSchema } from "@ai-employees/shared";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-change-me-in-production",
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = resetPasswordSchema.parse(body);

    // Verify the reset token
    let payload;
    try {
      const result = await jwtVerify(input.token, JWT_SECRET);
      payload = result.payload as { userId: string; purpose: string; hash: string };
    } catch {
      return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
    }

    if (payload.purpose !== "password-reset") {
      return NextResponse.json({ error: "Invalid reset token" }, { status: 400 });
    }

    // Find the user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "Invalid reset token" }, { status: 400 });
    }

    // Verify the token hasn't been used (password hash fingerprint still matches)
    if (user.passwordHash.slice(-8) !== payload.hash) {
      return NextResponse.json(
        { error: "This reset link has already been used" },
        { status: 400 },
      );
    }

    // Hash and update the new password
    const passwordHash = await bcrypt.hash(input.password, 12);
    await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, user.id));

    return NextResponse.json({ message: "Password reset successfully" });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    console.error("Reset password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
