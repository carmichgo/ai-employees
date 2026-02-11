/**
 * GET /api/integrations/slack/install
 *
 * Redirects the user to Slack's OAuth authorization page.
 * After the user authorizes, Slack redirects to /api/integrations/slack/callback.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { verifyToken } from "@/lib/auth";

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID || "";

// Bot scopes — what the bot can do in the workspace
const BOT_SCOPES = [
  "chat:write",
  "app_mentions:read",
  "channels:read",
  "channels:history",
  "groups:read",
  "groups:history",
  "im:read",
  "im:write",
  "im:history",
  "mpim:read",
  "mpim:write",
  "mpim:history",
  "users:read",
  "reactions:read",
  "reactions:write",
  "files:read",
  "files:write",
].join(",");

export async function GET(request: NextRequest) {
  // Verify the user is authenticated
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await verifyToken(token);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!SLACK_CLIENT_ID) {
    return NextResponse.json(
      { error: "Slack integration is not configured. Set SLACK_CLIENT_ID." },
      { status: 500 },
    );
  }

  // Generate state token to prevent CSRF — encode companyId + random nonce
  const nonce = crypto.randomBytes(16).toString("hex");
  const state = Buffer.from(
    JSON.stringify({ companyId: session.companyId, userId: session.userId, nonce }),
  ).toString("base64url");

  // Build redirect URI
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const redirectUri = `${appUrl}/api/integrations/slack/callback`;

  const slackUrl = new URL("https://slack.com/oauth/v2/authorize");
  slackUrl.searchParams.set("client_id", SLACK_CLIENT_ID);
  slackUrl.searchParams.set("scope", BOT_SCOPES);
  slackUrl.searchParams.set("redirect_uri", redirectUri);
  slackUrl.searchParams.set("state", state);

  return NextResponse.redirect(slackUrl.toString());
}
