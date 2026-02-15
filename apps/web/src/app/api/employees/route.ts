import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, companies, channelConnections } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import { getEmployeeBackend, createBackendClient } from "@/lib/backend";
import { createEmployeeDroplet, isDropletProvisioningEnabled } from "@/lib/digitalocean";
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
  const { gatewayToken, interserviceSecret, ...safe } = emp as { gatewayToken?: string; interserviceSecret?: string } & Record<
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
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await db
    .select()
    .from(employees)
    .where(eq(employees.companyId, session.companyId))
    .orderBy(employees.createdAt);

  return NextResponse.json({ employees: result.map(sanitize) });
}

// POST /api/employees — hire
export async function POST(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const input = createEmployeeSchema.parse(body);

    // Fetch company for use throughout the handler
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, session.companyId))
      .limit(1);

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // Resolve template defaults
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

    // Always create the employee record first
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

    if (input.channels?.length) {
      await createChannelConnectionRows(employee.id, input.channels);
    }

    // Auto-provision a droplet for this employee
    if (isDropletProvisioningEnabled()) {
      try {
        await createEmployeeDroplet(employee.id);
      } catch (err: any) {
        return NextResponse.json(
          {
            employee: sanitize(employee),
            error: `Hired ${input.name} but droplet provisioning failed: ${err.message}`,
            dropletStatus: "error",
          },
          { status: 201 },
        );
      }

      return NextResponse.json(
        {
          employee: sanitize(employee),
          message: `${input.name} is being hired! Setting up their dedicated server — this takes 2-3 minutes.`,
          dropletStatus: "provisioning",
        },
        { status: 201 },
      );
    }

    // No DO token — demo mode fallback
    await db
      .update(employees)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(employees.id, employee.id));

    const updatedEmployee = { ...employee, status: "active" };

    return NextResponse.json(
      {
        employee: sanitize(updatedEmployee),
        message: `${input.name} has been hired! (demo mode — no OpenClaw container)`,
      },
      { status: 201 },
    );
  } catch (err: any) {
    if (err?.name === "ZodError" && typeof err.flatten === "function") {
      const fieldErrors = err.flatten().fieldErrors;
      const messages = Object.entries(fieldErrors)
        .map(([field, errs]) => `${field}: ${(errs as string[]).join(", ")}`)
        .join("; ");
      return NextResponse.json(
        { error: `Validation error: ${messages}` },
        { status: 400 },
      );
    }
    console.error("Hire employee error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
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
    "voice-chat": "Web Voice Chat", phone: "Phone (Twilio)",
  };
  await db.insert(channelConnections).values(
    channels.map((ch) => ({
      employeeId,
      channelType: ch,
      name: CHANNEL_NAMES[ch] || ch,
      status: ch === "slack" || ch === "voice-chat" ? "connected" : "pending",
    })),
  );
}

/**
 * Pull channel credentials from company settings for selected channels.
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

  // Slack: handled by the centralized Slack proxy on the backend.

  return creds;
}
