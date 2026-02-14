import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, companies, channelConnections } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import { getCompanyBackend, createBackendClient } from "@/lib/backend";
import { createCompanyDroplet, isDropletProvisioningEnabled } from "@/lib/digitalocean";
import {
  createEmployeeSchema,
  getJobTemplate,
  PLAN_LIMITS,
  type PlanTier,
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
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const input = createEmployeeSchema.parse(body);

  // Check if company has an active droplet backend
  const backendConfig = await getCompanyBackend(session.companyId);

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
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  // No active droplet — check if we should auto-provision one
  if (isDropletProvisioningEnabled()) {
    // Get company to check droplet status
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, session.companyId))
      .limit(1);

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    if (company.dropletStatus === "provisioning") {
      return NextResponse.json(
        {
          error: "Your infrastructure is still being set up. This usually takes 2-3 minutes. Please try again shortly.",
          dropletStatus: "provisioning",
        },
        { status: 503 },
      );
    }

    // Auto-provision a droplet for this company
    try {
      await createCompanyDroplet(session.companyId);

      // Create employee record with "provisioning" status — it'll be processed
      // once the droplet is ready (the dashboard will poll)
      const planLimits = PLAN_LIMITS[company.plan as PlanTier] || PLAN_LIMITS.starter;
      const current = await db
        .select()
        .from(employees)
        .where(eq(employees.companyId, session.companyId));
      const activeCount = current.filter((e) => e.status !== "terminated").length;

      if (activeCount >= planLimits.maxEmployees) {
        return NextResponse.json(
          { error: `Employee limit reached (${planLimits.maxEmployees} for ${company.plan} plan)` },
          { status: 403 },
        );
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
          modelConfig: input.modelConfig || { primary: tierModel },
          toolsConfig: input.toolsAllow ? { allow: input.toolsAllow } : {},
          gatewayToken,
          status: "provisioning",
          containerName: `ai-emp-${company.slug}-${slugify(input.name)}-${crypto.randomBytes(3).toString("hex")}`,
        })
        .returning();

      // Create channel connection rows for tracking
      if (input.channels?.length) {
        await createChannelConnectionRows(employee.id, input.channels);
      }

      return NextResponse.json(
        {
          employee: sanitize(employee),
          message: `${input.name} is being hired! Setting up dedicated infrastructure — this takes 2-3 minutes.`,
          dropletStatus: "provisioning",
        },
        { status: 201 },
      );
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  // Demo mode fallback — no real provisioning
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, session.companyId))
    .limit(1);
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const planLimits = PLAN_LIMITS[company.plan as PlanTier] || PLAN_LIMITS.starter;
  const current = await db
    .select()
    .from(employees)
    .where(eq(employees.companyId, session.companyId));
  const activeCount = current.filter((e) => e.status !== "terminated").length;

  if (activeCount >= planLimits.maxEmployees) {
    return NextResponse.json(
      { error: `Employee limit reached (${planLimits.maxEmployees} for ${company.plan} plan)` },
      { status: 403 },
    );
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
  const demoTier = (input.tier || "junior") as EmployeeTier;
  const demoTierModel = getModelForTier(demoTier);

  const [employee] = await db
    .insert(employees)
    .values({
      companyId: session.companyId,
      name: input.name,
      jobTitle: input.jobTitle,
      templateId: input.templateId,
      tier: demoTier,
      emoji,
      persona,
      goals,
      personalityConfig: input.personalityConfig || { autonomy: "high", proactivity: "proactive", communication: "concise" },
      modelConfig: input.modelConfig || { primary: demoTierModel },
      toolsConfig: input.toolsAllow ? { allow: input.toolsAllow } : {},
      gatewayToken,
      status: "active",
      containerName: `ai-emp-${company.slug}-${slugify(input.name)}-${crypto.randomBytes(3).toString("hex")}`,
    })
    .returning();

  // Create channel connection rows for tracking
  if (input.channels?.length) {
    await createChannelConnectionRows(employee.id, input.channels);
  }

  return NextResponse.json(
    {
      employee: sanitize(employee),
      message: `${input.name} has been hired! (demo mode — no OpenClaw container)`,
    },
    { status: 201 },
  );
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
