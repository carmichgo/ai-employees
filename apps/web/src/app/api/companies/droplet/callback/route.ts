import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, employees } from "@/lib/schema";
import { pollDropletStatus, pollEmployeeDropletStatus } from "@/lib/digitalocean";

/**
 * POST /api/companies/droplet/callback
 * Called by the cloud-init script on the droplet to report progress.
 * Auth: uses the interservice secret as a bearer token.
 *
 * Per-employee model: each employee has their own droplet and interservice secret.
 * We first try to find an employee by the secret, then fall back to company (legacy).
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

  // Try to find an employee by interservice secret (per-employee droplet model)
  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.interserviceSecret, auth))
    .limit(1);

  if (employee) {
    console.log(
      `[droplet-callback] employee=${employee.name} (${employee.id}) step=${body.step} status=${body.status}${body.error ? ` error=${body.error}` : ""}`,
    );

    if (body.step === "ready" && body.status === "ok") {
      const forwardedFor = request.headers.get("x-forwarded-for");
      const sourceIp = forwardedFor?.split(",")[0]?.trim() || null;

      await db
        .update(employees)
        .set({
          dropletStatus: "active",
          status: "active",
          ...(sourceIp && !employee.dropletIp ? { dropletIp: sourceIp } : {}),
          updatedAt: new Date(),
        })
        .where(eq(employees.id, employee.id));

      // Also poll DO API in the background to get the definitive IP
      if (!employee.dropletIp) {
        pollEmployeeDropletStatus(employee.id).catch((err) => {
          console.error(`[droplet-callback] pollEmployeeDropletStatus failed for ${employee.name}:`, err.message);
        });
      }
    }

    if (body.status === "error" && employee.dropletStatus !== "active") {
      await db
        .update(employees)
        .set({
          dropletStatus: "error",
          status: "error",
          errorMessage: body.error || "Droplet setup failed",
          updatedAt: new Date(),
        })
        .where(eq(employees.id, employee.id));
    }

    return NextResponse.json({ ok: true });
  }

  // Legacy fallback: find company by interservice secret
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

  if (body.step === "ready" && body.status === "ok") {
    const forwardedFor = request.headers.get("x-forwarded-for");
    const sourceIp = forwardedFor?.split(",")[0]?.trim() || null;

    await db
      .update(companies)
      .set({
        dropletStatus: "active",
        ...(sourceIp && !company.dropletIp ? { dropletIp: sourceIp } : {}),
        updatedAt: new Date(),
      })
      .where(eq(companies.id, company.id));

    if (!company.dropletIp) {
      pollDropletStatus(company.id).catch((err) => {
        console.error(`[droplet-callback] pollDropletStatus failed for ${company.slug}:`, err.message);
      });
    }
  }

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
