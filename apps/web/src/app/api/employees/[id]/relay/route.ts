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

  // WebSocket URL for the Chrome extension — the API server's /relay proxy
  // bridges the extension directly to the OpenClaw gateway (port 18789).
  // The extension speaks the OpenClaw operator protocol natively.
  // Use /relay/:id (no sub-path) so both old and new droplet code forward to "/".
  const wsUrl = `ws://${employee.dropletIp}:${apiPort}/relay/${employee.id}`;

  // Use the gateway token directly — the extension connects to the gateway
  // (not a separate relay server), so the derived HMAC relay token is wrong.
  // The gateway validates the token in the operator protocol handshake, but
  // some versions also check the ?token= query param on the WebSocket URL.
  const relayToken = employee.gatewayToken;

  return NextResponse.json({
    available: true,
    employeeName: employee.name,
    gatewayUrl,
    gatewayToken: employee.gatewayToken,
    // Chrome extension fields — relayToken === gatewayToken since we connect directly
    wsUrl,
    relayToken,
    command: `npx clawhub@latest node-host --gateway-url "${gatewayUrl}" --token "${employee.gatewayToken}"`,
  });
}
