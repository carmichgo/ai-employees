import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";

// GET /api/companies/droplet/logs — fetch build logs from the droplet
export async function GET(request: NextRequest) {
  const debugKey = request.nextUrl.searchParams.get("key");
  let companySlug: string | null = null;

  // Allow debug access with a key (temporary, for debugging)
  if (debugKey === "debug-build-logs-2026") {
    companySlug = request.nextUrl.searchParams.get("slug") || "kimik";
  } else {
    const token =
      request.cookies.get("token")?.value ||
      request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const session = await verifyToken(token);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, session.companyId))
      .limit(1);

    if (!company?.dropletIp) {
      return NextResponse.json({ error: "No droplet IP" }, { status: 404 });
    }

    return fetchLogs(company.dropletIp);
  }

  // Debug path: find company by slug
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.slug, companySlug))
    .limit(1);

  if (!company?.dropletIp) {
    return NextResponse.json({ error: "No droplet IP", slug: companySlug }, { status: 404 });
  }

  const endpoint = request.nextUrl.searchParams.get("endpoint") || "logs";
  return fetchLogs(company.dropletIp, endpoint);
}

async function fetchLogs(ip: string, endpoint = "logs") {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`http://${ip}:3001/${endpoint}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Could not reach droplet", ip }, { status: 502 });
  }
}
