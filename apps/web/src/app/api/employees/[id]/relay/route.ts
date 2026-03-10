/**
 * GET /api/employees/[id]/relay — return browser extension relay connection info
 * Returns the gateway URL, token, and WebSocket URL needed to connect the
 * OpenClaw node host or the Blitzer AI Chrome extension.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";

/** Derive the relay auth token from the gateway token + port using HMAC-SHA256.
 *  Matches OpenClaw's deriveRelayToken(gatewayToken, port) format. */
async function deriveRelayToken(gatewayToken: string, port: number): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(gatewayToken),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`openclaw-extension-relay-v1:${port}`));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await verifyToken(token);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [employee] = await db
    .select({
      id: employees.id,
      name: employees.name,
      dropletIp: employees.dropletIp,
      dropletStatus: employees.dropletStatus,
      gatewayToken: employees.gatewayToken,
      containerHost: employees.containerHost,
      containerPort: employees.containerPort,
      status: employees.status,
    })
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  if (!employee.dropletIp || employee.status !== "active") {
    return NextResponse.json({
      available: false,
      reason: !employee.dropletIp ? "No infrastructure" : "Employee not active",
    });
  }

  // Gateway URL via the API server's built-in proxy (no DNS/Traefik needed)
  const apiPort = 3001;
  const gatewayUrl = `http://${employee.dropletIp}:${apiPort}/gw/${employee.id}`;

  // WebSocket URL for the Chrome extension relay (port 18792 inside the container).
  // The extension relay is enabled via extensionRelay config in openclaw.json.
  // The API server's /relay proxy forwards to containerHost:18792.
  const wsUrl = `ws://${employee.dropletIp}:${apiPort}/relay/${employee.id}/extension`;

  // Derive relay token (HMAC of gateway token + relay port) — matches OpenClaw protocol
  const relayPort = 18792;
  const relayToken = employee.gatewayToken
    ? await deriveRelayToken(employee.gatewayToken, relayPort)
    : null;

  return NextResponse.json({
    available: true,
    employeeName: employee.name,
    gatewayUrl,
    gatewayToken: employee.gatewayToken,
    // Chrome extension fields
    wsUrl,
    relayToken,
    command: `npx clawhub@latest node-host --gateway-url "${gatewayUrl}" --token "${employee.gatewayToken}"`,
  });
}
