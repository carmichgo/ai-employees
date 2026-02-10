/**
 * GET /api/integrations/slack/callback
 *
 * Handles the OAuth callback from Slack.
 * Exchanges the authorization code for a bot token and stores it
 * in the company's settings JSONB field.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies } from "@/lib/schema";

const SLACK_CLIENT_ID = (process.env.SLACK_CLIENT_ID || "").trim();
const SLACK_CLIENT_SECRET = (process.env.SLACK_CLIENT_SECRET || "").trim();

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

  // User denied the authorization
  if (error) {
    return NextResponse.redirect(
      `${appUrl}/dashboard/settings?slack=denied`,
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${appUrl}/dashboard/settings?slack=error&reason=missing_params`,
    );
  }

  // Decode state to get companyId
  let stateData: { companyId: string; userId: string; nonce: string };
  try {
    stateData = JSON.parse(Buffer.from(state, "base64url").toString());
  } catch {
    return NextResponse.redirect(
      `${appUrl}/dashboard/settings?slack=error&reason=invalid_state`,
    );
  }

  if (!stateData.companyId) {
    return NextResponse.redirect(
      `${appUrl}/dashboard/settings?slack=error&reason=invalid_state`,
    );
  }

  // Exchange code for token
  const redirectUri = `${appUrl}/api/integrations/slack/callback`;

  try {
    const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: SLACK_CLIENT_ID,
        client_secret: SLACK_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json() as {
      ok: boolean;
      error?: string;
      access_token?: string;
      token_type?: string;
      scope?: string;
      bot_user_id?: string;
      app_id?: string;
      team?: { id: string; name: string };
      authed_user?: { id: string };
    };

    if (!tokenData.ok) {
      console.error("[slack-oauth] Token exchange failed:", tokenData.error);
      return NextResponse.redirect(
        `${appUrl}/dashboard/settings?slack=error&reason=${tokenData.error}`,
      );
    }

    // Store Slack credentials in company settings
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, stateData.companyId))
      .limit(1);

    if (!company) {
      return NextResponse.redirect(
        `${appUrl}/dashboard/settings?slack=error&reason=company_not_found`,
      );
    }

    const currentSettings = (company.settings as Record<string, unknown>) || {};
    const updatedSettings = {
      ...currentSettings,
      integrations: {
        ...((currentSettings.integrations as Record<string, unknown>) || {}),
        slack: {
          connected: true,
          botToken: tokenData.access_token,
          botUserId: tokenData.bot_user_id,
          appId: tokenData.app_id,
          teamId: tokenData.team?.id,
          teamName: tokenData.team?.name,
          scope: tokenData.scope,
          connectedAt: new Date().toISOString(),
          connectedBy: stateData.userId,
        },
      },
    };

    await db
      .update(companies)
      .set({ settings: updatedSettings, updatedAt: new Date() })
      .where(eq(companies.id, stateData.companyId));

    console.log(
      `[slack-oauth] Connected workspace "${tokenData.team?.name}" (${tokenData.team?.id}) for company ${stateData.companyId}`,
    );

    return NextResponse.redirect(
      `${appUrl}/dashboard/settings?slack=connected&team=${encodeURIComponent(tokenData.team?.name || "")}`,
    );
  } catch (err) {
    console.error("[slack-oauth] Callback error:", err);
    return NextResponse.redirect(
      `${appUrl}/dashboard/settings?slack=error&reason=exchange_failed`,
    );
  }
}
