import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, companies, channelConnections } from "@/lib/schema";

export const maxDuration = 60; // Allow up to 60s for DO droplet provisioning API calls
import { verifyToken } from "@/lib/auth";
import { getCompanyBackend, createBackendClient } from "@/lib/backend";
import { createCompanyDroplet, isDropletProvisioningEnabled, pollDropletStatus } from "@/lib/digitalocean";
import {
  createEmployeeSchema,
  getJobTemplate,
  getModelForTier,
  type EmployeeTier,
} from "@ai-employees/shared";

async function authenticate(request: NextRequest) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
}

function sanitize(emp: Record<string, unknown>) {
  const { gatewayToken, ...safe } = emp as { gatewayToken?: string } & Record<
    string,
    unknown
  >;
  return safe;
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// GET /api/employees — list
export async function GET(request: NextRequest) {
  try {
    const session = await authenticate(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const result = await db
      .select()
      .from(employees)
      .where(eq(employees.companyId, session.companyId))
      .orderBy(employees.createdAt);

    return NextResponse.json({ employees: result.map(sanitize) });
  } catch (err: any) {
    console.error("GET /api/employees error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}

// POST /api/employees — hire
export async function POST(request: NextRequest) {
  try {
    const session = await authenticate(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const input = createEmployeeSchema.parse(body);

    // Check if company has an active droplet backend
    let backendConfig: Awaited<ReturnType<typeof getCompanyBackend>> = null;
    try {
      backendConfig = await getCompanyBackend(session.companyId);
    } catch (err: any) {
      console.error("getCompanyBackend failed, continuing without backend:", err.message);
    }

    // If company has an active droplet but no IP stored, try to discover it
    if (!backendConfig) {
      const [comp] = await db.select().from(companies).where(eq(companies.id, session.companyId)).limit(1);
      if (comp?.dropletStatus === "active" && comp.dropletId && !comp.dropletIp) {
        console.log(`Company ${session.companyId} has active droplet but no IP, polling DO...`);
        try {
          const pollResult = await pollDropletStatus(session.companyId);
          if (pollResult.status === "active" && pollResult.ip) {
            backendConfig = await getCompanyBackend(session.companyId);
          }
        } catch (err: any) {
          console.error("pollDropletStatus failed:", err.message);
        }
      }
    }

    if (backendConfig) {
      // Droplet is active — delegate provisioning to it
      try {
        // Pull channel credentials from company settings for connected integrations
        const channelCredentials = await getChannelCredentials(session.companyId, input.channels || []);

        const backend = createBackendClient(backendConfig);
        const result = await backend.provisionEmployee({
          companyId: session.companyId,
          name: input.name,
          jobTitle: input.jobTitle,
          tier: input.tier || "junior",
          templateId: input.templateId || undefined,
          persona: input.persona || undefined,
          goals: input.goals || undefined,
          personalityConfig: input.personalityConfig || undefined,
          authorityConfig: input.authorityConfig || undefined,
          channels: input.channels || [],
          channelCredentials,
          modelConfig: input.modelConfig,
          toolsAllow: input.toolsAllow || undefined,
          skills: input.skills || undefined,
        });

        // Create channel connection rows for tracking
        if (result.employee?.id && input.channels?.length) {
          await createChannelConnectionRows(result.employee.id, input.channels);
        }

        return NextResponse.json(result, { status: 201 });
      } catch (err: any) {
        console.error("Backend provisioning failed, falling through to local create:", err.message);
        // Fall through to create employee locally instead of returning 500
      }
    }

    // Look up company (used by both droplet-provisioning and fallback paths)
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, session.companyId))
      .limit(1);

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // No active droplet — check if we should auto-provision one
    let dropletProvisioned = false;
    if (isDropletProvisioningEnabled()) {
      // Handle stale "provisioning" state — if stuck for more than 15 minutes, reset
      if (company.dropletStatus === "provisioning" && company.updatedAt) {
        const staleMins = (Date.now() - new Date(company.updatedAt).getTime()) / 60000;
        if (staleMins > 15) {
          console.warn(`Company ${session.companyId} droplet stuck in provisioning for ${Math.round(staleMins)}min, resetting`);
          await db.update(companies).set({
            dropletStatus: "error",
            updatedAt: new Date(),
          }).where(eq(companies.id, session.companyId));
          company.dropletStatus = "error";
        } else {
          return NextResponse.json(
            {
              error: "Your infrastructure is still being set up. This usually takes 2-3 minutes. Please try again shortly.",
              dropletStatus: "provisioning",
            },
            { status: 503 },
          );
        }
      }

      // Auto-provision a droplet for this company
      try {
        await createCompanyDroplet(session.companyId);
        dropletProvisioned = true;
      } catch (err: any) {
        console.error("Droplet provisioning failed, creating employee without droplet:", err.message);
        // If there's a droplet in some state, still mark as provisioning
        if (company.dropletStatus === "provisioning" || company.dropletStatus === "active") {
          dropletProvisioned = true;
        }
      }
    }

    let persona = input.persona;
    let goals = input.goals;
    let emoji = "🤖";

    if (input.templateId) {
      const template = getJobTemplate(input.templateId);
      if (template) {
        persona = persona || template.persona;
        goals = goals || template.goals;
        emoji = template.emoji;
      }
    }

    const gatewayToken = crypto.randomBytes(32).toString("hex");
    const tier = (input.tier || "junior") as EmployeeTier;
    const tierModel = getModelForTier(tier);

    const [employee] = await db
      .insert(employees)
      .values({
        companyId: session.companyId,
        name: input.name,
        jobTitle: input.jobTitle,
        templateId: input.templateId,
        tier,
        emoji,
        persona,
        goals,
        personalityConfig: input.personalityConfig || { autonomy: "high", proactivity: "proactive", communication: "concise" },
        authorityConfig: input.authorityConfig || { defaultRole: "manager", members: [] },
        modelConfig: input.modelConfig || { primary: tierModel },
        toolsConfig: input.toolsAllow ? { allow: input.toolsAllow } : {},
        gatewayToken,
        status: dropletProvisioned ? "provisioning" : "active",
        containerName: `ai-emp-${company.slug}-${slugify(input.name)}-${crypto.randomBytes(3).toString("hex")}`,
      })
      .returning();

    if (input.channels?.length) {
      await createChannelConnectionRows(employee.id, input.channels);
    }

    const message = dropletProvisioned
      ? `${input.name} is being hired! Setting up dedicated infrastructure — this takes 2-3 minutes.`
      : `${input.name} has been hired!`;

    return NextResponse.json(
      {
        employee: sanitize(employee),
        message,
        ...(dropletProvisioned ? { dropletStatus: "provisioning" } : {}),
      },
      { status: 201 },
    );
  } catch (err: any) {
    console.error("POST /api/employees error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to hire employee" },
      { status: 500 },
    );
  }
}

/** Create channelConnections rows for selected channels */
async function createChannelConnectionRows(employeeId: string, channels: string[]) {
  if (!channels.length) return;
  const CHANNEL_NAMES: Record<string, string> = {
    slack: "Slack", email: "Email", telegram: "Telegram",
    whatsapp: "WhatsApp", discord: "Discord", signal: "Signal",
    teams: "Microsoft Teams", "google-chat": "Google Chat", matrix: "Matrix",
  };
  await db.insert(channelConnections).values(
    channels.map((ch) => ({
      employeeId,
      channelType: ch,
      name: CHANNEL_NAMES[ch] || ch,
      status: ch === "slack" ? "connected" : "pending", // Slack is auto-connected via proxy
    })),
  );
}

/**
 * Pull channel credentials from company settings for selected channels.
 * Only returns credentials for integrations that are actually connected.
 */
async function getChannelCredentials(
  companyId: string,
  selectedChannels: string[],
): Promise<Record<string, Record<string, unknown>>> {
  if (selectedChannels.length === 0) return {};

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!company) return {};

  const settings = (company.settings as Record<string, unknown>) || {};
  const integrations = (settings.integrations as Record<string, unknown>) || {};
  const creds: Record<string, Record<string, unknown>> = {};

  // Slack: handled by the centralized Slack proxy on the droplet.
  // We don't pass Slack credentials to individual OpenClaw containers.
  // The proxy reads credentials from the DB and env vars directly.
  // We still include "slack" in the channels list so the worker knows
  // to create a dedicated Slack channel for the employee.

  return creds;
}
