import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import crypto from "node:crypto";

/**
 * GET /api/public/files/[token]/[...path]
 * Serve a workspace file publicly using a signed URL token.
 *
 * Token format: {employeeId}.{expiresEpochSeconds}.{hmacSignature}
 * The HMAC is computed over "{employeeId}.{expires}.{filePath}" using INTERSERVICE_SECRET.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string; path: string[] }> },
) {
  const { token, path: pathSegments } = await params;
  const filePath = pathSegments.join("/");

  // Parse token
  const parts = token.split(".");
  if (parts.length < 3) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const employeeId = parts[0];
  const expires = parseInt(parts[1], 10);
  const signature = parts.slice(2).join(".");

  if (isNaN(expires)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  // Check expiration
  if (Date.now() / 1000 > expires) {
    return NextResponse.json({ error: "Link expired" }, { status: 410 });
  }

  // Verify signature
  const secret = process.env.INTERSERVICE_SECRET || process.env.JWT_SECRET || "";
  const payload = `${employeeId}.${expires}.${filePath}`;
  const expectedSig = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  if (signature !== expectedSig) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 });
  }

  // Look up employee's droplet
  const [employee] = await db
    .select({
      id: employees.id,
      dropletIp: employees.dropletIp,
      dropletStatus: employees.dropletStatus,
      interserviceSecret: employees.interserviceSecret,
    })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!employee || !employee.dropletIp || employee.dropletStatus !== "active") {
    return NextResponse.json({ error: "File not available" }, { status: 404 });
  }

  // Proxy the file from the droplet
  try {
    const res = await fetch(
      `http://${employee.dropletIp}:3001/internal/employees/${employeeId}/workspace/${filePath}`,
      {
        headers: {
          "x-interservice-secret": employee.interserviceSecret || "",
        },
      },
    );

    if (!res.ok) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const filename = filePath.split("/").pop() || "file";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=300",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "File not available" }, { status: 502 });
  }
}
