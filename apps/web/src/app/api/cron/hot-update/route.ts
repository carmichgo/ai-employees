import { NextRequest, NextResponse } from "next/server";
import { and, isNotNull, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { createBackendClient } from "@/lib/backend";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Build a tarball of the project source code from the current deployment.
 * This allows pushing code to droplets even when the GitHub repo is private.
 */
function buildTarball(): string | null {
  // In Vercel, the project files are at process.cwd() during build
  // but at runtime we need to find the source
  const projectRoot = path.resolve(process.cwd(), "../..");
  const tarPath = "/tmp/hot-update-push.tar.gz";

  try {
    // Build tarball excluding build artifacts and large directories
    execSync(
      `tar czf ${tarPath} --exclude='node_modules' --exclude='.next' --exclude='.git' --exclude='dist' --exclude='.turbo' --exclude='.cache' --exclude='.vercel' -C "${projectRoot}" .`,
      { timeout: 30000 },
    );

    if (existsSync(tarPath)) {
      const data = readFileSync(tarPath);
      // Clean up
      try { execSync(`rm -f ${tarPath}`, { timeout: 5000 }); } catch {}
      return data.toString("base64");
    }
  } catch (err: any) {
    console.error("[hot-update] Failed to build tarball:", err.message);
  }
  return null;
}

/**
 * POST /api/cron/hot-update
 * Trigger hot-update on all employee droplets (active + unhealthy).
 * Auth: CRON_SECRET via Authorization bearer or ?secret= query param.
 *
 * If the droplet can't download from GitHub (private repo), this endpoint
 * builds a tarball from the current Vercel deployment and pushes it directly.
 */
export async function POST(request: NextRequest) {
  if (CRON_SECRET) {
    const auth = request.headers.get("authorization");
    const querySecret = new URL(request.url).searchParams.get("secret");
    const isAuthorized =
      auth === `Bearer ${CRON_SECRET}` || querySecret === CRON_SECRET;
    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await request.json().catch(() => ({}));
  const branch = body.branch || "main";
  const pushCode = body.pushCode !== false; // default: push code from Vercel

  // Build tarball from current deployment to push to droplets
  let tarball: string | null = null;
  if (pushCode) {
    tarball = buildTarball();
    if (tarball) {
      console.log(`[hot-update] Built tarball (${Math.round(tarball.length / 1024)}KB base64) to push to droplets`);
    } else {
      console.log("[hot-update] Could not build tarball, droplets will try to download from GitHub");
    }
  }

  // Query employees directly with IP + secret — bypass getEmployeeBackend's
  // strict "active" status check since unhealthy droplets may still be reachable
  const targetEmployees = await db
    .select({
      id: employees.id,
      name: employees.name,
      dropletIp: employees.dropletIp,
      interserviceSecret: employees.interserviceSecret,
    })
    .from(employees)
    .where(
      and(
        inArray(employees.dropletStatus, ["active", "unhealthy"]),
        isNotNull(employees.dropletIp),
        isNotNull(employees.interserviceSecret),
      ),
    );

  // Dedupe by dropletIp — multiple employees may share a droplet
  const seen = new Set<string>();
  const results = [];

  for (const emp of targetEmployees) {
    if (!emp.dropletIp || !emp.interserviceSecret) continue;
    if (seen.has(emp.dropletIp)) {
      results.push({ id: emp.id, name: emp.name, status: "skipped", reason: "droplet already updated" });
      continue;
    }
    seen.add(emp.dropletIp);

    try {
      const backend = createBackendClient({
        url: `http://${emp.dropletIp}:3001`,
        secret: emp.interserviceSecret,
      });
      const result = await backend.hotUpdate(branch, tarball || undefined);
      results.push({ id: emp.id, name: emp.name, status: "ok", result });
    } catch (err: any) {
      results.push({ id: emp.id, name: emp.name, status: "error", error: err.message });
    }
  }

  return NextResponse.json({ results, timestamp: new Date().toISOString() });
}
