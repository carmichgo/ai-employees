/**
 * Internal provisioning routes — called by the Vercel frontend via inter-service auth.
 * These routes trigger actual OpenClaw container lifecycle operations.
 */
import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { eq, and } from "drizzle-orm";
import { db, employees, companies } from "@ai-employees/db";
import { getJobTemplate, getModelForTier, type EmployeeTier } from "@ai-employees/shared";
import { regenerateChannelConfig, type ChannelInput } from "@ai-employees/openclaw-config";
import { getProvisionQueue } from "../queues.js";

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function sanitize(emp: Record<string, unknown>) {
  const { gatewayToken, ...safe } = emp as { gatewayToken?: string } & Record<string, unknown>;
  return safe;
}

export async function provisionRoutes(fastify: FastifyInstance) {
  // Middleware: verify inter-service secret
  fastify.addHook("onRequest", async (request, reply) => {
    const secret = request.headers["x-interservice-secret"];
    if (secret !== process.env.INTERSERVICE_SECRET) {
      return reply.status(403).send({ error: "Forbidden" });
    }
  });

  // POST /internal/employees/provision — Hire + provision a new employee
  fastify.post("/internal/employees/provision", async (request, reply) => {
    const body = request.body as {
      companyId: string;
      name: string;
      jobTitle: string;
      tier?: string;
      templateId?: string;
      persona?: string;
      goals?: string;
      personalityConfig?: { autonomy?: string; proactivity?: string; communication?: string };
      channels?: string[];
      channelCredentials?: Record<string, Record<string, unknown>>;
      modelConfig?: { primary: string };
      toolsAllow?: string[];
      skills?: string[];
    };

    // Get company
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, body.companyId),
    });
    if (!company) {
      return reply.status(404).send({ error: "Company not found" });
    }

    // Merge template
    let persona = body.persona;
    let goals = body.goals;
    let emoji = "🤖";

    if (body.templateId) {
      const template = getJobTemplate(body.templateId);
      if (template) {
        persona = persona || template.persona;
        goals = goals || template.goals;
        emoji = template.emoji;
      }
    }

    const gatewayToken = crypto.randomBytes(32).toString("hex");

    const personalityConfig = body.personalityConfig || {
      autonomy: "high",
      proactivity: "proactive",
      communication: "concise",
    };

    // Determine model from tier
    const tier = (body.tier || "junior") as EmployeeTier;
    const tierModel = getModelForTier(tier);

    // Create employee record with status=provisioning
    const [employee] = await db
      .insert(employees)
      .values({
        companyId: body.companyId,
        name: body.name,
        jobTitle: body.jobTitle,
        templateId: body.templateId,
        tier,
        emoji,
        persona,
        goals,
        personalityConfig,
        modelConfig: body.modelConfig || { primary: tierModel },
        toolsConfig: body.toolsAllow ? { allow: body.toolsAllow } : {},
        gatewayToken,
        status: "provisioning",
        containerName: `ai-emp-${company.slug}-${slugify(body.name)}-${crypto.randomBytes(3).toString("hex")}`,
      })
      .returning();

    // Queue actual OpenClaw container provisioning
    const queue = getProvisionQueue();
    await queue.add("provision-employee", {
      employeeId: employee.id,
      companyId: body.companyId,
      channels: body.channels || [],
      channelCredentials: body.channelCredentials || {},
      skills: body.skills || [],
    });

    return reply.status(201).send({
      employee: sanitize(employee),
      message: `${body.name} is being onboarded! Their workstation is spinning up.`,
    });
  });

  // POST /internal/employees/:id/pause
  fastify.post<{ Params: { id: string } }>("/internal/employees/:id/pause", async (request, reply) => {
    const { id } = request.params;

    const employee = await db.query.employees.findFirst({
      where: eq(employees.id, id),
    });
    if (!employee) return reply.status(404).send({ error: "Employee not found" });
    if (employee.status !== "active") return reply.status(400).send({ error: "Employee is not active" });

    const queue = getProvisionQueue();
    await queue.add("stop-employee", { employeeId: id });

    const [updated] = await db
      .update(employees)
      .set({ status: "paused", updatedAt: new Date() })
      .where(eq(employees.id, id))
      .returning();

    return { employee: sanitize(updated) };
  });

  // POST /internal/employees/:id/resume
  fastify.post<{ Params: { id: string } }>("/internal/employees/:id/resume", async (request, reply) => {
    const { id } = request.params;

    const employee = await db.query.employees.findFirst({
      where: eq(employees.id, id),
    });
    if (!employee) return reply.status(404).send({ error: "Employee not found" });
    if (employee.status !== "paused") return reply.status(400).send({ error: "Employee is not paused" });

    const queue = getProvisionQueue();
    await queue.add("start-employee", { employeeId: id });

    const [updated] = await db
      .update(employees)
      .set({ status: "provisioning", updatedAt: new Date() })
      .where(eq(employees.id, id))
      .returning();

    return { employee: sanitize(updated) };
  });

  // DELETE /internal/employees/:id
  fastify.delete<{ Params: { id: string } }>("/internal/employees/:id", async (request, reply) => {
    const { id } = request.params;

    const employee = await db.query.employees.findFirst({
      where: eq(employees.id, id),
    });
    if (!employee) return reply.status(404).send({ error: "Employee not found" });

    const queue = getProvisionQueue();
    await queue.add("teardown-employee", { employeeId: id });

    const [updated] = await db
      .update(employees)
      .set({ status: "terminated", updatedAt: new Date() })
      .where(eq(employees.id, id))
      .returning();

    return { employee: sanitize(updated), message: `${employee.name} has been terminated.` };
  });

  // GET /internal/employees/:id/status — poll status
  fastify.get<{ Params: { id: string } }>("/internal/employees/:id/status", async (request, reply) => {
    const { id } = request.params;

    const employee = await db.query.employees.findFirst({
      where: eq(employees.id, id),
    });
    if (!employee) return reply.status(404).send({ error: "Employee not found" });

    return { employee: sanitize(employee) };
  });

  // POST /internal/employees/:id/channels/connect — update OpenClaw config with channel credentials
  fastify.post<{ Params: { id: string } }>("/internal/employees/:id/channels/connect", async (request, reply) => {
    const { id } = request.params;
    const body = request.body as {
      agentId: string;
      allChannels: ChannelInput[];
    };

    const employee = await db.query.employees.findFirst({
      where: eq(employees.id, id),
    });
    if (!employee) return reply.status(404).send({ error: "Employee not found" });

    const configDir = `/opt/ai-employees/openclaw-configs/${id}`;
    const configPath = `${configDir}/openclaw.json`;

    if (!existsSync(configPath)) {
      return reply.status(400).send({ error: "Employee config not found — container may not be provisioned yet" });
    }

    try {
      // Read existing config, merge in new channels
      const existing = JSON.parse(readFileSync(configPath, "utf-8"));
      const updated = regenerateChannelConfig(existing, body.agentId, body.allChannels);
      writeFileSync(configPath, JSON.stringify(updated, null, 2));

      // Restart container to pick up new config
      if (employee.containerName) {
        execSync(`docker restart ${employee.containerName}`, { timeout: 30000 });

        // Wait briefly for container to come up, then get new IP
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const newIp = execSync(
            `docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${employee.containerName}`,
            { timeout: 5000 },
          ).toString().trim();

          if (newIp) {
            await db.update(employees).set({ containerHost: newIp, updatedAt: new Date() }).where(eq(employees.id, id));
          }
        } catch {
          // Non-fatal — IP lookup can fail briefly during restart
        }
      }

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      fastify.log.error(`Channel connect failed for ${id}: ${message}`);
      return reply.status(500).send({ error: `Failed to update channel config: ${message}` });
    }
  });

  // POST /internal/employees/:id/chat — proxy chat to container or call Anthropic directly
  fastify.post<{ Params: { id: string } }>("/internal/employees/:id/chat", async (request, reply) => {
    const { id } = request.params;
    const body = request.body as {
      messages: Array<{ role: string; content: string }>;
    };

    const employee = await db.query.employees.findFirst({
      where: eq(employees.id, id),
    });
    if (!employee) return reply.status(404).send({ error: "Employee not found" });
    if (employee.status !== "active") {
      return reply.status(400).send({ error: `Employee is ${employee.status}` });
    }

    // If container is available, route through it (OpenClaw)
    if (employee.containerHost && employee.containerPort) {
      let containerHost = employee.containerHost;
      const containerPort = employee.containerPort;

      const sendToContainer = async (host: string) => {
        const containerUrl = `http://${host}:${containerPort}/v1/chat/completions`;
        const messages = [
          { role: "system", content: buildSystemPrompt(employee) },
          ...body.messages,
        ];
        return fetch(containerUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${employee.gatewayToken}`,
          },
          body: JSON.stringify({
            model: (employee.modelConfig as { primary: string }).primary,
            messages,
          }),
        });
      };

      try {
        let res = await sendToContainer(containerHost);

        if (!res.ok) {
          const err = await res.text();
          return reply.status(res.status).send({ error: `OpenClaw error: ${err}` });
        }
        const data = await res.json() as { choices?: { message?: { content?: string } }[]; usage?: unknown };
        return { reply: data.choices?.[0]?.message?.content || "No response", mode: "live", usage: data.usage };
      } catch (err: unknown) {
        // Container unreachable — IP may have changed after docker restart.
        // Try to resolve the current IP from Docker and retry once.
        if (employee.containerName) {
          try {
            const network = process.env.OPENCLAW_NETWORK || "ai-employees-internal";
            const newIp = execSync(
              `docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${employee.containerName}`,
              { timeout: 5000 },
            ).toString().trim();

            if (newIp && newIp !== containerHost) {
              console.log(`[chat-proxy] IP changed for ${employee.containerName}: ${containerHost} -> ${newIp}, retrying...`);

              // Update DB with new IP
              await db.update(employees).set({ containerHost: newIp, updatedAt: new Date() }).where(eq(employees.id, id));

              // Retry with new IP
              const retryRes = await sendToContainer(newIp);
              if (!retryRes.ok) {
                const retryErr = await retryRes.text();
                return reply.status(retryRes.status).send({ error: `OpenClaw error: ${retryErr}` });
              }
              const data = await retryRes.json() as { choices?: { message?: { content?: string } }[]; usage?: unknown };
              return { reply: data.choices?.[0]?.message?.content || "No response", mode: "live", usage: data.usage };
            }
          } catch {
            // Docker inspect failed — container may be down
          }
        }

        const message = err instanceof Error ? err.message : String(err);
        return reply.status(502).send({ error: `Container unreachable: ${message}` });
      }
    }

    // No container — call Anthropic directly
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return reply.status(500).send({ error: "ANTHROPIC_API_KEY not configured" });
    }

    const systemPrompt = buildSystemPrompt(employee);
    const modelConfig = employee.modelConfig as { primary: string };
    const modelId = toAnthropicModelId(modelConfig.primary);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: modelId,
          max_tokens: 4096,
          system: systemPrompt,
          messages: body.messages.map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        fastify.log.error(`Anthropic API error: ${err}`);
        return reply.status(502).send({ error: `LLM error: ${res.status}` });
      }

      const data = await res.json() as {
        content?: Array<{ type: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      return {
        reply: data.content?.find((c) => c.type === "text")?.text || "No response",
        mode: "live",
        usage: data.usage,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: `Anthropic API error: ${message}` });
    }
  });
}

/** Build a system prompt from employee persona/goals */
function buildSystemPrompt(employee: { name: string; jobTitle: string; persona: string | null; goals: string | null; emoji: string | null; personalityConfig?: unknown }): string {
  const parts = [
    `You are ${employee.name}, a ${employee.jobTitle}. That is your name and role — you are not a generic AI assistant. When asked who you are, introduce yourself by name and role.`,
  ];
  if (employee.persona) parts.push(`\n\n## Who You Are\n${employee.persona}`);
  if (employee.goals) parts.push(`\n\n## Your Goals\n${employee.goals}`);

  // Include personality instructions
  const pc = employee.personalityConfig as { autonomy?: string; proactivity?: string; communication?: string } | null;
  if (pc?.autonomy === "full" || pc?.autonomy === "high") {
    parts.push(`\n\nYou have ${pc.autonomy} autonomy. Bias toward action — do things instead of asking permission. Make decisions confidently. Only ask questions when the answer genuinely requires the other person's input.`);
  }

  parts.push(`\n\nBe concise. Lead with results, not process. Never say "As an AI" — you are ${employee.name}.`);
  return parts.join("");
}

/** Convert model config string to Anthropic model ID */
function toAnthropicModelId(model: string): string {
  // Strip provider prefix if present (e.g. "anthropic/claude-opus-4-6" → "claude-opus-4-6")
  const stripped = model.includes("/") ? model.split("/").slice(1).join("/") : model;
  return stripped || "claude-opus-4-6";
}
