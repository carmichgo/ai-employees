/**
 * Shared employee provisioning logic.
 * Used by:
 *   - POST /api/employees (direct hire / demo mode)
 *   - POST /api/billing/checkout (subsequent hires with existing subscription)
 *   - POST /api/webhooks/stripe (first hire after checkout completes)
 */
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, companies, channelConnections } from "@/lib/schema";
import { getCompanyBackend, createBackendClient } from "@/lib/backend";
import { createCompanyDroplet, isDropletProvisioningEnabled } from "@/lib/digitalocean";
import {
  getJobTemplate,
  getModelForTier,
  type EmployeeTier,
} from "@ai-employees/shared";

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function sanitize(emp: Record<string, unknown>) {
  const { gatewayToken, ...safe } = emp as { gatewayToken?: string } & Record<string, unknown>;
  return safe;
}

/**
 * Provision an employee and return the API response payload.
 *
 * @param billingInfo Optional Stripe billing link. If provided, the employee
 *   record will include the subscription item ID and monthly price.
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
  const tierModel = getModelForTier(tier);

  // Check if company has an active droplet backend
  const backendConfig = await getCompanyBackend(companyId);

  if (backendConfig) {
    try {
      const backend = createBackendClient(backendConfig);
      const result = await backend.provisionEmployee({
        companyId,
        name: input.name,
        jobTitle: input.jobTitle,
        tier,
        templateId: input.templateId || undefined,
        persona: persona || undefined,
        goals: goals || undefined,
        personalityConfig: input.personalityConfig || undefined,
        authorityConfig: input.authorityConfig || undefined,
        channels: input.channels || [],
        channelCredentials: {},
        modelConfig: input.modelConfig,
        toolsAllow: input.toolsAllow || undefined,
        skills: input.skills || undefined,
      });

      // Update billing info on the backend-created employee
      if (result.employee?.id) {
        if (billingInfo) {
          await db.update(employees).set({
            stripeSubscriptionItemId: billingInfo.stripeSubscriptionItemId,
            priceMonthly: billingInfo.priceMonthly,
            updatedAt: new Date(),
          }).where(eq(employees.id, result.employee.id));
        }
        if (input.channels?.length) {
          await createChannelRows(result.employee.id, input.channels);
        }
      }

      return result;
    } catch (err: any) {
      console.error("provisionAndReturn backend error:", err);
      // Fall through to local provisioning
    }
  }

  // Determine status based on droplet availability
  let status = "active"; // demo mode
  let dropletStatus: string | undefined;

  if (isDropletProvisioningEnabled()) {
    // Handle stale "provisioning" state — if the droplet has been provisioning
    // for more than 15 minutes, reset so we can try again
    if (company.dropletStatus === "provisioning" && company.updatedAt) {
      const staleMins = (Date.now() - new Date(company.updatedAt).getTime()) / 60000;
      if (staleMins > 15) {
        console.warn(`Company ${companyId} droplet stuck in provisioning for ${Math.round(staleMins)}min, resetting`);
        await db.update(companies).set({
          dropletStatus: "error",
          updatedAt: new Date(),
        }).where(eq(companies.id, companyId));
        // Refresh company data
        company.dropletStatus = "error";
      }
    }

    if (company.dropletStatus !== "active") {
      try {
        await createCompanyDroplet(companyId);
        status = "provisioning";
        dropletStatus = "provisioning";
      } catch (err: any) {
        console.error("provisionAndReturn droplet creation error:", err);
        // Still set status to provisioning if there's a droplet in progress
        if (company.dropletStatus === "provisioning") {
          status = "provisioning";
          dropletStatus = "provisioning";
        }
      }
    } else {
      // Company has an "active" droplet but backend was unreachable (fell through above).
      // Create the employee as "provisioning" so it can be picked up when the backend recovers.
      status = "provisioning";
      dropletStatus = "provisioning";
    }
  }

  const [employee] = await db
    .insert(employees)
    .values({
      companyId,
      name: input.name,
      jobTitle: input.jobTitle,
      templateId: input.templateId,
      tier,
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

  const message = dropletStatus
    ? `${input.name} is being hired! Setting up dedicated infrastructure — this takes 2-3 minutes.`
    : `${input.name} has been hired!`;

  return {
    employee: sanitize(employee),
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
