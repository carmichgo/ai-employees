/**
 * POST /api/webhooks/[token] — Public webhook receiver
 *
 * External services (GitHub, Zapier, Slack Events, etc.) POST here.
 * The token identifies which employee trigger to fire.
 * This route requires NO authentication — the token IS the auth.
 *
 * The webhook is proxied to the employee's dedicated droplet for processing.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { triggers, employees } from "@/lib/schema";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // Look up trigger by webhook token
  const trigger = await db.query.triggers.findFirst({
    where: and(eq(triggers.webhookToken, token), eq(triggers.enabled, true)),
  });

  if (!trigger) {
    return NextResponse.json({ error: "Webhook not found or disabled" }, { status: 404 });
  }

  // Get the employee's dedicated droplet
  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, trigger.employeeId))
    .limit(1);

  if (
    !employee ||
    employee.dropletStatus !== "active" ||
    !employee.dropletIp ||
    !employee.interserviceSecret
  ) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  // Forward the webhook to the employee's droplet
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // Body might not be JSON
    body = { raw: await request.text().catch(() => "") };
  }

  try {
    const dropletUrl = `http://${employee.dropletIp}:3001/webhooks/${token}`;
    const res = await fetch(dropletUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-interservice-secret": employee.interserviceSecret,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({ ok: res.ok }));
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Delivery failed: ${message}` }, { status: 502 });
  }
}

// Also support GET for webhook verification (some services like Slack send GET to verify)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const trigger = await db.query.triggers.findFirst({
    where: eq(triggers.webhookToken, token),
  });

  if (!trigger) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Slack URL verification
  const challenge = new URL(request.url).searchParams.get("challenge");
  if (challenge) {
    return NextResponse.json({ challenge });
  }

  return NextResponse.json({ ok: true, trigger: trigger.name });
}
