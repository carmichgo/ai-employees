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

  // WebSocket URL for the Chrome extension — connect directly to the gateway (18789)
  // via the API server's /gw proxy. The extension relay (port 18792) is a node-host
  // feature that doesn't run inside the container, so we connect to the gateway itself
  // which speaks the same OpenClaw WebSocket protocol.
  const wsUrl = `ws://${employee.dropletIp}:${apiPort}/gw/${employee.id}`;

  // No separate relay token needed — the extension authenticates with the gateway token directly

  return NextResponse.json({
    available: true,
    employeeName: employee.name,
    gatewayUrl,
    gatewayToken: employee.gatewayToken,
    // Chrome extension fields — connect directly to gateway WebSocket
    wsUrl,
    relayToken: null,
    command: `npx clawhub@latest node-host --gateway-url "${gatewayUrl}" --token "${employee.gatewayToken}"`,
  });
}
