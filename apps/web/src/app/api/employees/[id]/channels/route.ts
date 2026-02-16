/**
 * GET    /api/employees/[id]/channels          — list channel connections
 * POST   /api/employees/[id]/channels          — connect/update a channel
 * DELETE  /api/employees/[id]/channels?type=x   — disconnect a channel
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, channelConnections } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import { getEmployeeBackend, createBackendClient } from "@/lib/backend";

async function authenticate(request: NextRequest) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
}

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// GET — list all channel connections for this employee
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verify employee belongs to this company
  const [employee] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const connections = await db
    .select()
    .from(channelConnections)
    .where(eq(channelConnections.employeeId, id));

  // Mask credentials — only return whether they exist
  const masked = connections.map((c) => ({
    id: c.id,
    channelType: c.channelType,
    name: c.name,
    status: c.status,
    hasCredentials: Object.keys((c.credentials as Record<string, unknown>) || {}).length > 0,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));

  return NextResponse.json({ channels: masked });
}

// POST — connect a channel (save credentials + update container config)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { channelType, credentials } = body as {
    channelType: string;
    credentials: Record<string, unknown>;
  };

  if (!channelType) {
    return NextResponse.json({ error: "channelType is required" }, { status: 400 });
  }

  // Verify employee belongs to this company
  const [employee] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  // Upsert channel connection
  const existing = await db
    .select()
    .from(channelConnections)
    .where(
      and(
        eq(channelConnections.employeeId, id),
        eq(channelConnections.channelType, channelType),
      ),
    )
    .limit(1);

  const CHANNEL_NAMES: Record<string, string> = {
    slack: "Slack", email: "Email", telegram: "Telegram",
    whatsapp: "WhatsApp", discord: "Discord", signal: "Signal",
    teams: "Microsoft Teams", "google-chat": "Google Chat", matrix: "Matrix",
    "voice-chat": "Web Voice Chat", phone: "Phone (Twilio)",
  };

  if (existing.length > 0) {
    await db
      .update(channelConnections)
      .set({
        credentials: credentials || {},
        status: "connected",
        updatedAt: new Date(),
      })
      .where(eq(channelConnections.id, existing[0].id));
  } else {
    await db.insert(channelConnections).values({
      employeeId: id,
      channelType,
      name: CHANNEL_NAMES[channelType] || channelType,
      credentials: credentials || {},
      status: "connected",
    });
  }

  // Now gather ALL connected channels and push updated config to the droplet
  const allConnections = await db
    .select()
    .from(channelConnections)
    .where(eq(channelConnections.employeeId, id));

  // QR-paired channels (like WhatsApp) have empty credentials — they authenticate
  // via device linking, not static API keys. Include them in the config.
  const QR_PAIRED = new Set(["whatsapp"]);

  const allChannels = allConnections
    .filter((c) => c.status === "connected" && (QR_PAIRED.has(c.channelType) || Object.keys((c.credentials as Record<string, unknown>) || {}).length > 0))
    .map((c) => ({
      type: c.channelType,
      credentials: (c.credentials as Record<string, unknown>) || {},
      config: (c.config as Record<string, unknown>) || {},
    }));

  // Forward to droplet API to update the running container
  const backendConfig = await getEmployeeBackend(id);
  if (backendConfig) {
    try {
      const backend = createBackendClient(backendConfig);
      await backend.connectChannel(id, {
        agentId: slugify(employee.name),
        allChannels,
      });
    } catch (err: any) {
      // Don't fail the whole operation — credentials are saved, container update can be retried
      console.error(`Failed to update container config: ${err.message}`);
    }
  }

  return NextResponse.json({
    message: `${CHANNEL_NAMES[channelType] || channelType} connected`,
    status: "connected",
  });
}

// DELETE — disconnect a channel
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const channelType = request.nextUrl.searchParams.get("type");

  if (!channelType) {
    return NextResponse.json({ error: "type query parameter is required" }, { status: 400 });
  }

  // Verify employee belongs to this company
  const [employee] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  // Update status to disconnected
  await db
    .update(channelConnections)
    .set({ status: "disconnected", credentials: {}, updatedAt: new Date() })
    .where(
      and(
        eq(channelConnections.employeeId, id),
        eq(channelConnections.channelType, channelType),
      ),
    );

  // Push updated config to droplet (without this channel)
  const allConnections = await db
    .select()
    .from(channelConnections)
    .where(eq(channelConnections.employeeId, id));

  const QR_PAIRED_DEL = new Set(["whatsapp"]);
  const allChannels = allConnections
    .filter((c) => c.status === "connected" && (QR_PAIRED_DEL.has(c.channelType) || Object.keys((c.credentials as Record<string, unknown>) || {}).length > 0))
    .map((c) => ({
      type: c.channelType,
      credentials: (c.credentials as Record<string, unknown>) || {},
      config: (c.config as Record<string, unknown>) || {},
    }));

  const backendConfig = await getEmployeeBackend(id);
  if (backendConfig) {
    try {
      const backend = createBackendClient(backendConfig);
      await backend.connectChannel(id, {
        agentId: slugify(employee.name),
        allChannels,
      });
    } catch (err: any) {
      console.error(`Failed to update container config: ${err.message}`);
    }
  }

  return NextResponse.json({ message: `${channelType} disconnected` });
}
