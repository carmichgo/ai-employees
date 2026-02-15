/**
 * Internal provisioning routes — called by the Vercel frontend via inter-service auth.
 * These routes trigger actual Blitzer container lifecycle operations.
 */
import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { eq, and } from "drizzle-orm";
import { db, employees, companies, channelConnections } from "@ai-employees/db";
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

/**
 * Resolve a running Docker container target for an employee.
 * Tries containerName first, then containerId as fallback.
 * Returns the identifier to use with docker exec/inspect, or null if not found.
 */
function resolveContainer(employee: { containerName: string | null; containerId: string | null }): string | null {
  if (employee.containerName) {
    try {
      const running = execSync(
        `docker inspect --format '{{.State.Running}}' ${employee.containerName}`,
        { timeout: 5000 },
      ).toString().trim();
      if (running === "true") return employee.containerName;
    } catch {
      // Container not found by name — try containerId below
    }
  }
  if (employee.containerId) {
    try {
      const running = execSync(
        `docker inspect --format '{{.State.Running}}' ${employee.containerId}`,
        { timeout: 5000 },
      ).toString().trim();
      if (running === "true") return employee.containerId;
    } catch {
      // Not found by ID either
    }
  }
  return null;
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

    // Queue actual Blitzer container provisioning
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

  // POST /internal/employees/:id/provision-container
  // Queues Blitzer container creation for an existing employee.
  // Called by the web app once the droplet reports phase "ready".
  fastify.post<{ Params: { id: string } }>("/internal/employees/:id/provision-container", async (request, reply) => {
    const { id } = request.params;

    const employee = await db.query.employees.findFirst({
      where: eq(employees.id, id),
    });
    if (!employee) return reply.status(404).send({ error: "Employee not found" });

    // Don't re-provision if already active with a container
    if (employee.containerId && employee.status === "active") {
      return { message: "Container already provisioned", status: employee.status };
    }

    // Get channel connections for this employee
    const connections = await db.query.channelConnections.findMany({
      where: eq(channelConnections.employeeId, id),
    });
    const channels = connections.map((c) => c.channelType);

    const queue = getProvisionQueue();
    await queue.add("provision-employee", {
      employeeId: id,
      companyId: employee.companyId,
      channels,
    });

    return { message: "Container provisioning queued", status: "provisioning" };
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

  // POST /internal/employees/:id/channels/connect — update Blitzer config with channel credentials
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
      const target = resolveContainer(employee);
      if (target) {
        execSync(`docker restart ${target}`, { timeout: 30000 });

        // Wait briefly for container to come up, then get new IP
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const newIp = execSync(
            `docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${target}`,
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

  // GET /internal/employees/:id/channels/whatsapp/qr — get WhatsApp QR code for pairing
  // Runs the WhatsApp login inside the container and captures the QR string,
  // then generates a QR code PNG and returns it as base64.
  fastify.get<{ Params: { id: string } }>("/internal/employees/:id/channels/whatsapp/qr", async (request, reply) => {
    const { id } = request.params;

    const employee = await db.query.employees.findFirst({
      where: eq(employees.id, id),
    });
    if (!employee) return reply.status(404).send({ error: "Employee not found" });
    if (employee.status !== "active") return reply.status(400).send({ error: `Employee is ${employee.status}` });
    if (!employee.containerName) return reply.status(400).send({ error: "No container name configured for this employee" });

    // Resolve a running container (tries containerName, then containerId)
    const containerTarget = resolveContainer(employee);
    if (!containerTarget) {
      return reply.status(503).send({
        error: "Employee's Blitzer container is not running. WhatsApp linking requires a running container. Check that the worker service has provisioned the container.",
      });
    }

    try {
      // Check if WhatsApp is already connected by looking at the session directory
      const sessionCheck = execSync(
        `docker exec ${containerTarget} bash -c 'test -f /home/node/.openclaw/credentials/whatsapp/creds.json && echo "linked" || echo "unlinked"'`,
        { timeout: 5000 },
      ).toString().trim();

      if (sessionCheck === "linked") {
        return { status: "linked", qr: null, message: "WhatsApp is already linked to a device." };
      }

      // Run the login command with a short timeout to capture the QR code output.
      // The command outputs QR data to stdout then waits for scan — we just need the QR string.
      const output = execSync(
        `docker exec ${containerTarget} timeout 15 node -e "
          const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
          const { Boom } = require('@hapi/boom');
          (async () => {
            const { state, saveCreds } = await useMultiFileAuthState('/home/node/.openclaw/credentials/whatsapp');
            const sock = makeWASocket({ auth: state, printQRInTerminal: false });
            sock.ev.on('creds.update', saveCreds);
            sock.ev.on('connection.update', (update) => {
              if (update.qr) {
                console.log(JSON.stringify({ qr: update.qr }));
                process.exit(0);
              }
              if (update.connection === 'open') {
                console.log(JSON.stringify({ status: 'linked' }));
                process.exit(0);
              }
              if (update.connection === 'close') {
                const reason = new Boom(update.lastDisconnect?.error)?.output?.statusCode;
                if (reason !== DisconnectReason.loggedOut) {
                  console.log(JSON.stringify({ error: 'Connection closed', code: reason }));
                }
                process.exit(1);
              }
            });
          })();
        " 2>/dev/null`,
        { timeout: 20000 },
      ).toString().trim();

      // Parse the last JSON line from output
      const lines = output.split("\n").filter(Boolean);
      const lastLine = lines[lines.length - 1];
      const result = JSON.parse(lastLine);

      if (result.status === "linked") {
        return { status: "linked", qr: null, message: "WhatsApp linked successfully." };
      }

      if (result.qr) {
        return { status: "pending", qr: result.qr };
      }

      return reply.status(500).send({ error: "Failed to get QR code" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // Timeout is expected — means QR wasn't generated yet, container may still be starting
      if (message.includes("timed out") || message.includes("ETIMEDOUT")) {
        return reply.status(503).send({ error: "Container is still starting up. Try again in a few seconds." });
      }
      if (message.includes("No such container")) {
        return reply.status(503).send({
          error: "Employee's Blitzer container is not available. It may have been removed or not yet provisioned. Check the worker service.",
        });
      }
      fastify.log.error(`WhatsApp QR failed for ${id}: ${message}`);
      return reply.status(500).send({ error: `Failed to get WhatsApp QR: ${message}` });
    }
  });

  // POST /internal/employees/:id/chat — proxy chat to Blitzer container
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

    // If container is available, route through it (Blitzer)
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
          return reply.status(res.status).send({ error: `Blitzer error: ${err}` });
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
                return reply.status(retryRes.status).send({ error: `Blitzer error: ${retryErr}` });
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

    // No container available — cannot chat
    return reply.status(503).send({
      error: "Blitzer container is not running for this employee. Container provisioning may still be in progress.",
    });
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

