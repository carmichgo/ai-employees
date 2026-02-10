/**
 * GET  /api/integrations — list connected integrations for the company
 * DELETE /api/integrations?type=slack — disconnect an integration
 */
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

export async function GET(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, session.companyId))
    .limit(1);

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const settings = (company.settings as Record<string, unknown>) || {};
  const integrations = (settings.integrations as Record<string, unknown>) || {};

  // Return integration status without exposing tokens
  const result: Record<string, unknown> = {};

  if (integrations.slack) {
    const slack = integrations.slack as Record<string, unknown>;
    result.slack = {
      connected: slack.connected,
      teamId: slack.teamId,
      teamName: slack.teamName,
      connectedAt: slack.connectedAt,
    };
  }

  return NextResponse.json({ integrations: result });
}

export async function DELETE(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const type = request.nextUrl.searchParams.get("type");
  if (!type) {
    return NextResponse.json({ error: "Missing 'type' query parameter" }, { status: 400 });
  }

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, session.companyId))
    .limit(1);

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const settings = (company.settings as Record<string, unknown>) || {};
  const integrations = (settings.integrations as Record<string, unknown>) || {};

  if (!integrations[type]) {
    return NextResponse.json({ error: `No ${type} integration found` }, { status: 404 });
  }

  // Remove the integration
  const { [type]: _, ...remaining } = integrations;
  const updatedSettings = {
    ...settings,
    integrations: remaining,
  };

  await db
    .update(companies)
    .set({ settings: updatedSettings, updatedAt: new Date() })
    .where(eq(companies.id, session.companyId));

  return NextResponse.json({ message: `${type} integration disconnected` });
}
