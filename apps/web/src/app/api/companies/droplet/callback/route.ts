import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies } from "@/lib/schema";

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

  // If the step reports the API is ready, mark as active
  if (body.step === "ready" && body.status === "ok") {
    await db
      .update(companies)
      .set({
        dropletStatus: "active",
        updatedAt: new Date(),
      })
      .where(eq(companies.id, company.id));
  }

  // If there's an error, mark the droplet as errored
  if (body.status === "error") {
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
