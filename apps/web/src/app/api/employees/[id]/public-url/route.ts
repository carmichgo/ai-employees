import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import crypto from "node:crypto";

/**
 * POST /api/employees/[id]/public-url
 * Generate a temporary public URL for a workspace file.
 * Body: { filePath: string, expiresIn?: number (seconds, default 24h, max 7d) }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Accept both user auth (dashboard) and interservice auth (from droplet)
  const interserviceSecret = request.headers.get("x-interservice-secret");
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");

  const { id } = await params;
  let companyId: string | null = null;

  if (interserviceSecret) {
    // Droplet calling on behalf of employee — verify secret matches
    const [emp] = await db
      .select({ id: employees.id, interserviceSecret: employees.interserviceSecret })
      .from(employees)
      .where(eq(employees.id, id))
      .limit(1);
    if (!emp || emp.interserviceSecret !== interserviceSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (token) {
    const session = await verifyToken(token);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    companyId = session.companyId;
  } else {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify employee exists (and belongs to company if user auth)
  const conditions = companyId
    ? and(eq(employees.id, id), eq(employees.companyId, companyId))
    : eq(employees.id, id);

  const [employee] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(conditions)
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const filePath = (body as any).filePath;
  if (!filePath || typeof filePath !== "string") {
    return NextResponse.json({ error: "filePath required" }, { status: 400 });
  }

  // Max 7 days, default 24 hours
  const maxExpiry = 7 * 24 * 3600;
  const expiresIn = Math.min(Math.max((body as any).expiresIn || 86400, 60), maxExpiry);
  const expires = Math.floor(Date.now() / 1000) + expiresIn;

  // Generate HMAC signature
  const secret = process.env.INTERSERVICE_SECRET || process.env.JWT_SECRET || "";
  const payload = `${id}.${expires}.${filePath}`;
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const signedToken = `${id}.${expires}.${signature}`;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ai-employees-ten.vercel.app";
  const publicUrl = `${baseUrl}/api/public/files/${signedToken}/${filePath}`;

  return NextResponse.json({
    url: publicUrl,
    expiresAt: new Date(expires * 1000).toISOString(),
    expiresIn,
  });
}
