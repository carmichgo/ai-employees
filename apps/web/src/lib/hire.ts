/**
 * Shared employee provisioning logic.
 * Used by:
 *   - POST /api/employees (direct hire / demo mode)
 *   - POST /api/billing/checkout (subsequent hires with existing subscription)
 *   - POST /api/webhooks/stripe (first hire after checkout completes)
 *
 * Architecture: one dedicated DigitalOcean droplet per employee.
 * The droplet runs Redis + Fastify API + BullMQ Worker + one OpenClaw container.
 */
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, companies, channelConnections } from "@/lib/schema";
import { createEmployeeDroplet, isDropletProvisioningEnabled } from "@/lib/digitalocean";
import {
  getJobTemplate,
  getModelForTier,
  type EmployeeTier,
} from "@ai-employees/shared";

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function sanitize(emp: Record<string, unknown>) {
  const { gatewayToken, interserviceSecret, ...safe } = emp as {
    gatewayToken?: string;
    interserviceSecret?: string;
  } & Record<string, unknown>;
  return safe;
}

/**
 * Provision an employee and return the API response payload.
 *
 * Flow:
 *   1. Create employee record in DB
 *   2. Create a dedicated DO droplet for the employee
 *   3. Droplet cloud-init runs → API + worker start → provisions OpenClaw container
 *   4. Employee status transitions: provisioning → active
 */
export async function provisionAndReturn(
  companyId: string,
  input: Record<string, any>,
  billingInfo?: {
    stripeSubscriptionItemId: string;
    priceMonthly: number;
  },
): Promise<{ employee: Record<string, unknown>; message: string; dropletStatus?: string }> {
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!company) throw new Error("Company not found");

  const tier = (input.tier || "junior") as EmployeeTier;
  const hostingMode = input.hostingMode || "managed";
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
  // BYOK: use the user-selected model; Managed: use the tier model
  const tierModel = hostingMode === "byok" && input.byokModel
    ? input.byokModel
    : getModelForTier(tier);

  // Determine initial status
  const doEnabled = isDropletProvisioningEnabled();
  const status = doEnabled ? "provisioning" : "active";

  // Create the employee record
  const [employee] = await db
    .insert(employees)
    .values({
      companyId,
      name: input.name,
      jobTitle: input.jobTitle,
      templateId: input.templateId,
      tier,
      hostingMode,
      // BYOK keys — stored alongside the employee record
      ...(hostingMode === "byok" && {
        byokAnthropicKey: input.byokAnthropicKey || null,
        byokGeminiKey: input.byokGeminiKey || null,
        byokModel: input.byokModel || null,
      }),
      emoji,
      persona,
      goals,
      personalityConfig: input.personalityConfig || {
        autonomy: "high",
        proactivity: "proactive",
        communication: "concise",
      },
      authorityConfig: input.authorityConfig || {
        defaultRole: "manager",
        members: [],
      },
      modelConfig: input.modelConfig || { primary: tierModel },
      toolsConfig: input.toolsAllow ? { allow: input.toolsAllow } : {},
      gatewayToken,
      status,
      containerName: `ai-emp-${company.slug}-${slugify(input.name)}-${crypto.randomBytes(3).toString("hex")}`,
      // Billing
      ...(billingInfo && {
        stripeSubscriptionItemId: billingInfo.stripeSubscriptionItemId,
        priceMonthly: billingInfo.priceMonthly,
      }),
    })
    .returning();

  if (input.channels?.length) {
    await createChannelRows(employee.id, input.channels);
  }

  // Create a dedicated droplet for this employee
  let dropletStatus: string | undefined;
  if (doEnabled) {
    try {
      await createEmployeeDroplet(employee.id);
      dropletStatus = "provisioning";
    } catch (err: any) {
      console.error(`[hire] Failed to create droplet for employee ${employee.id}:`, err.message);
      // Set status to error so the UI shows a retry button with the error message
      await db
        .update(employees)
        .set({
          status: "error",
          errorMessage: `Droplet creation failed: ${err.message}`,
          updatedAt: new Date(),
        })
        .where(eq(employees.id, employee.id));
      dropletStatus = "error";
    }
  }

  // Re-fetch employee to get current status (may have been set to "error")
  const [updatedEmployee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employee.id))
    .limit(1);

  const message = dropletStatus === "error"
    ? `Failed to set up ${input.name}'s infrastructure. You can retry from the employee page.`
    : dropletStatus
      ? `${input.name} is being hired! Setting up dedicated infrastructure — this takes 2-3 minutes.`
      : `${input.name} has been hired!`;

  return {
    employee: sanitize(updatedEmployee || employee),
    message,
    ...(dropletStatus && { dropletStatus }),
  };
}

async function createChannelRows(employeeId: string, channels: string[]) {
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
      status: ch === "slack" ? "connected" : "pending",
    })),
  );
}
