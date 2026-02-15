import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";

// Never cache this route — it proxies real-time data and triggers side effects
export const dynamic = "force-dynamic";

// GET /api/companies/droplet/logs?employeeId=xxx — fetch build logs from an employee's droplet
export async function GET(request: NextRequest) {
  const employeeId = request.nextUrl.searchParams.get("employeeId");

  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await verifyToken(token);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!employeeId) {
    return NextResponse.json({ error: "employeeId query parameter required" }, { status: 400 });
  }

  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!employee?.dropletIp) {
    return NextResponse.json({ error: "No droplet IP" }, { status: 404 });
  }

  const endpoint = request.nextUrl.searchParams.get("endpoint") || "logs";
  return fetchLogs(employee.dropletIp, endpoint);
}

async function fetchLogs(ip: string, endpoint = "logs") {
  try {
    const controller = new AbortController();
    const timeoutMs = endpoint.startsWith("update") ? 30000 : 5000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`http://${ip}:3001/${endpoint}`, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Could not reach droplet", ip }, { status: 502 });
  }
}
