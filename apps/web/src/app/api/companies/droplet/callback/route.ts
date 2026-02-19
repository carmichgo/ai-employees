import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies } from "@/lib/schema";
import { pollDropletStatus } from "@/lib/digitalocean";

/**
 * POST /api/companies/droplet/callback
 * Called by the cloud-init script on the droplet to report progress.
 * Auth: uses the interservice secret as a bearer token.
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!auth) {
    return NextResponse.json({ error: "No auth" }, { status: 401 });
  }

  let body: { step: string; status: string; error?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Find company by interservice secret
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.interserviceSecret, auth))
    .limit(1);

  if (!company) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 403 });
  }

  console.log(
    `[droplet-callback] company=${company.slug} step=${body.step} status=${body.status}${body.error ? ` error=${body.error}` : ""}`,
  );

  // If the step reports the API is ready, mark as active AND discover the IP
  if (body.step === "ready" && body.status === "ok") {
    // First, try to extract the droplet's public IP from the request headers
    // (Vercel sets X-Forwarded-For from the originating IP)
    const forwardedFor = request.headers.get("x-forwarded-for");
    const sourceIp = forwardedFor?.split(",")[0]?.trim() || null;

    await db
      .update(companies)
      .set({
        dropletStatus: "active",
        // Store the source IP if we have it and no IP is stored yet
        ...(sourceIp && !company.dropletIp ? { dropletIp: sourceIp } : {}),
        updatedAt: new Date(),
      })
      .where(eq(companies.id, company.id));

    // Also poll DO API in the background to get the definitive IP
    // (in case X-Forwarded-For is a proxy IP or missing)
    if (!company.dropletIp) {
      pollDropletStatus(company.id).catch((err) => {
        console.error(`[droplet-callback] pollDropletStatus failed for ${company.slug}:`, err.message);
      });
    }
  }

  // Only set error status if the droplet isn't already active
  // Once active (placeholder running), Phase 2 errors are non-fatal
  if (body.status === "error" && company.dropletStatus !== "active") {
    await db
      .update(companies)
      .set({
        dropletStatus: "error",
        updatedAt: new Date(),
      })
      .where(eq(companies.id, company.id));
  }

  return NextResponse.json({ ok: true });
}
