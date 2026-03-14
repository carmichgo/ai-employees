import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

/**
 * POST /api/billing/validate-keys
 *
 * Validates user-provided API keys by making a minimal test call.
 * Used during BYOK employee setup to ensure keys work before provisioning.
 */
export async function POST(request: NextRequest) {
  try {
    const token =
      request.cookies.get("token")?.value ||
      request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const session = await verifyToken(token);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { anthropicKey, geminiKey } = await request.json();

    const result: {
      anthropicValid: boolean;
      anthropicError?: string;
      geminiValid: boolean;
      geminiError?: string;
    } = {
      anthropicValid: false,
      geminiValid: true, // default true if not provided
    };

    // Validate Anthropic key with a minimal API call
    if (anthropicKey) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1,
            messages: [{ role: "user", content: "hi" }],
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (res.ok) {
          result.anthropicValid = true;
        } else {
          const body = await res.json().catch(() => ({}));
          if (res.status === 401) {
            result.anthropicError = "Invalid API key";
          } else if (res.status === 403) {
            result.anthropicError = "API key lacks required permissions";
          } else if (res.status === 429) {
            // Rate limited but key is valid
            result.anthropicValid = true;
          } else {
            result.anthropicError = body.error?.message || `API error (${res.status})`;
          }
        }
      } catch (err: any) {
        result.anthropicError = err.name === "TimeoutError"
          ? "Request timed out — check your key and try again"
          : `Connection failed: ${err.message}`;
      }
    } else {
      result.anthropicError = "Anthropic API key is required";
    }

    // Validate Gemini key if provided
    if (geminiKey) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`,
          { signal: AbortSignal.timeout(10000) },
        );

        if (res.ok) {
          result.geminiValid = true;
        } else if (res.status === 400 || res.status === 403) {
          result.geminiValid = false;
          result.geminiError = "Invalid API key";
        } else {
          result.geminiValid = false;
          result.geminiError = `API error (${res.status})`;
        }
      } catch (err: any) {
        result.geminiValid = false;
        result.geminiError = err.name === "TimeoutError"
          ? "Request timed out"
          : `Connection failed: ${err.message}`;
      }
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("POST /api/billing/validate-keys error:", err);
    return NextResponse.json(
      { error: err.message || "Validation failed" },
      { status: 500 },
    );
  }
}
