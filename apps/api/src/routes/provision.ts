/**
 * Internal provisioning routes — called by the Vercel frontend via inter-service auth.
 * These routes trigger actual OpenClaw container lifecycle operations.
 */
import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import path from "node:path";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, symlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { eq, and, or, inArray, sql } from "drizzle-orm";
import { db, employees, companies, users, chatMessages } from "@ai-employees/db";
import { getJobTemplate, PLAN_LIMITS, type PlanTier, getModelForTier, type EmployeeTier } from "@ai-employees/shared";
import { regenerateChannelConfig, type ChannelInput } from "@ai-employees/openclaw-config";
import { getProvisionQueue } from "../queues.js";
import { recordTokenUsage, extractUsage } from "../usage.js";

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
      authorityConfig?: { defaultRole?: string; members?: Array<{ slackUserId: string; name: string; role: string }> };
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

    // Check limits
    const planLimits = PLAN_LIMITS[company.plan as PlanTier] || PLAN_LIMITS.starter;
    const current = await db.query.employees.findMany({
      where: eq(employees.companyId, body.companyId),
    });
    const activeCount = current.filter((e) => e.status !== "terminated").length;

    if (activeCount >= planLimits.maxEmployees) {
      return reply.status(403).send({
        error: `Employee limit reached (${planLimits.maxEmployees} for ${company.plan} plan)`,
      });
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

    const authorityConfig = body.authorityConfig || {
      defaultRole: "manager",
      members: [],
    };

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
        authorityConfig,
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

  // POST /internal/employees/:id/reprovision — Re-queue provisioning for a stuck employee
  fastify.post<{ Params: { id: string } }>("/internal/employees/:id/reprovision", async (request, reply) => {
    const { id } = request.params;

    const employee = await db.query.employees.findFirst({
      where: eq(employees.id, id),
    });
    if (!employee) return reply.status(404).send({ error: "Employee not found" });
    const reprovisionableStatuses = ["provisioning", "error", "onboarding"];
    if (!reprovisionableStatuses.includes(employee.status)) {
      return reply.status(400).send({ error: `Employee is ${employee.status}, cannot reprovision` });
    }

    // Check if a container already exists for this employee
    if (employee.containerHost && employee.containerPort) {
      return reply.status(400).send({ error: "Employee already has a container" });
    }

    // Reset status to provisioning so the provision worker can proceed
    await db
      .update(employees)
      .set({ status: "provisioning", errorMessage: null, updatedAt: new Date() })
      .where(eq(employees.id, id));

    // Queue the provision job
    const queue = getProvisionQueue();
    await queue.add("provision-employee", {
      employeeId: employee.id,
      companyId: employee.companyId,
      channels: [],
      channelCredentials: {},
      skills: [],
    });

    return { employee: sanitize(employee), message: `Re-queued provisioning for ${employee.name}` };
  });

  // POST /internal/employees/:id/pause
  fastify.post<{ Params: { id: string } }>("/internal/employees/:id/pause", async (request, reply) => {
    const { id } = request.params;

    const employee = await db.query.employees.findFirst({
      where: eq(employees.id, id),
    });
    if (!employee) return reply.status(404).send({ error: "Employee not found" });
    // Accept both "active" and "paused" — the Vercel route may have already set
    // status to "paused" before calling us, so we still need to stop the container.
    if (employee.status !== "active" && employee.status !== "paused") {
      return reply.status(400).send({ error: "Employee is not active" });
    }

    // Kill the container synchronously — don't just queue it.
    // This ensures the container is actually dead before we respond.
    if (employee.containerName) {
      try {
        execSync(`docker kill ${employee.containerName}`, { timeout: 15000 });
        console.log(`[pause] Killed container ${employee.containerName} for employee ${id}`);
      } catch (err: any) {
        // If container is already stopped/not running, that's fine
        if (!err.message?.includes("is not running")) {
          console.error(`[pause] docker kill failed for ${employee.containerName}: ${err.message}`);
        }
      }
    } else if (employee.containerId) {
      try {
        execSync(`docker kill ${employee.containerId}`, { timeout: 15000 });
        console.log(`[pause] Killed container ${employee.containerId} for employee ${id}`);
      } catch (err: any) {
        if (!err.message?.includes("is not running")) {
          console.error(`[pause] docker kill failed for ${employee.containerId}: ${err.message}`);
        }
      }
    }

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

  // POST /internal/employees/:id/teardown — destroy container only (keeps employee record)
  fastify.post<{ Params: { id: string } }>("/internal/employees/:id/teardown", async (request, reply) => {
    const { id } = request.params;

    const employee = await db.query.employees.findFirst({
      where: eq(employees.id, id),
    });
    if (!employee) return reply.status(404).send({ error: "Employee not found" });

    const queue = getProvisionQueue();
    await queue.add("teardown-employee", { employeeId: id });

    return { message: `Container teardown queued for ${employee.name}` };
  });

  // POST /internal/employees/:id/restart — restart container (clears stuck state)
  fastify.post<{ Params: { id: string } }>("/internal/employees/:id/restart", async (request, reply) => {
    const { id } = request.params;

    const employee = await db.query.employees.findFirst({
      where: eq(employees.id, id),
    });
    if (!employee) return reply.status(404).send({ error: "Employee not found" });
    if (!employee.containerName) return reply.status(400).send({ error: "No container to restart" });

    try {
      execSync(`docker restart ${employee.containerName}`, { timeout: 30000 });

      // Wait for container to come up, then resolve new IP
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const newIp = execSync(
          `docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${employee.containerName}`,
          { timeout: 5000 },
        ).toString().trim();
        if (newIp && newIp !== employee.containerHost) {
          await db.update(employees).set({ containerHost: newIp, updatedAt: new Date() }).where(eq(employees.id, id));
        }
      } catch { /* IP lookup can fail briefly during restart */ }

      return { success: true, message: `Container ${employee.containerName} restarted` };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: `Failed to restart container: ${message}` });
    }
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

  // GET /internal/employees/:id/diagnostics — container logs + state for debugging
  fastify.get<{ Params: { id: string } }>("/internal/employees/:id/diagnostics", async (request, reply) => {
    const { id } = request.params;
    const employee = await db.query.employees.findFirst({ where: eq(employees.id, id) });
    if (!employee) return reply.status(404).send({ error: "Employee not found" });
    if (!employee.containerName) return reply.status(400).send({ error: "No container" });

    const result: Record<string, unknown> = { name: employee.containerName };
    try {
      const inspect = execSync(`docker inspect ${employee.containerName}`, { timeout: 5000 }).toString();
      const info = JSON.parse(inspect)[0];
      result.state = info?.State;
      result.hostConfig = { Memory: info?.HostConfig?.Memory, NanoCpus: info?.HostConfig?.NanoCpus };
    } catch (err: any) { result.inspectError = err.message?.slice(0, 300); }
    try {
      result.logs = execSync(`docker logs --tail 50 ${employee.containerName} 2>&1`, { timeout: 5000 }).toString();
    } catch (err: any) { result.logsError = err.message?.slice(0, 300); }
    try {
      result.configFiles = execSync(`ls -la /opt/ai-employees/openclaw-configs/${id}/`, { timeout: 5000 }).toString();
    } catch (err: any) { result.configFilesError = err.message?.slice(0, 300); }
    return result;
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

  // POST /internal/employees/:id/credentials/sync — push credentials to employee's container
  fastify.post<{ Params: { id: string } }>("/internal/employees/:id/credentials/sync", async (request, reply) => {
    const { id } = request.params;
    const body = request.body as {
      credentials: Array<{ label: string; username: string; password: string; url?: string; notes?: string }>;
    };

    const employee = await db.query.employees.findFirst({
      where: eq(employees.id, id),
    });
    if (!employee) return reply.status(404).send({ error: "Employee not found" });
    if (!employee.containerName) {
      return reply.status(400).send({ error: "Employee container not provisioned yet" });
    }

    try {
      // Use the cred CLI tool inside the container to store each credential
      // The cred tool encrypts credentials at rest with AES-256-GCM
      for (const cred of body.credentials) {
        const service = cred.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "default";
        // Store username
        if (cred.username) {
          execSync(
            `docker exec ${employee.containerName} cred store ${JSON.stringify(service)} username ${JSON.stringify(cred.username)}`,
            { timeout: 10000 },
          );
        }
        // Store password
        if (cred.password) {
          execSync(
            `docker exec ${employee.containerName} cred store ${JSON.stringify(service)} password ${JSON.stringify(cred.password)}`,
            { timeout: 10000 },
          );
        }
        // Store URL if provided
        if (cred.url) {
          execSync(
            `docker exec ${employee.containerName} cred store ${JSON.stringify(service)} url ${JSON.stringify(cred.url)}`,
            { timeout: 10000 },
          );
        }
        // Store notes if provided
        if (cred.notes) {
          execSync(
            `docker exec ${employee.containerName} cred store ${JSON.stringify(service)} notes ${JSON.stringify(cred.notes)}`,
            { timeout: 10000 },
          );
        }
      }

      return { success: true, synced: body.credentials.length };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      fastify.log.error(`Credential sync failed for ${id}: ${message}`);
      return reply.status(500).send({ error: `Failed to sync credentials: ${message}` });
    }
  });

  // POST /internal/employees/:id/skills/install — write skill files to the employee's container
  fastify.post<{ Params: { id: string } }>("/internal/employees/:id/skills/install", async (request, reply) => {
    const { id } = request.params;
    const { slug, content, files } = request.body as { slug: string; content: string; files?: Array<{ name: string; content: string }> };

    if (!slug || !content) {
      return reply.status(400).send({ error: "slug and content are required" });
    }

    const employee = await db.query.employees.findFirst({
      where: eq(employees.id, id),
    });
    if (!employee) {
      return reply.status(404).send({ error: "Employee not found" });
    }

    const configDir = `/opt/ai-employees/openclaw-configs/${id}`;
    const skillDir = `${configDir}/skills/${slug}`;

    try {
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(`${skillDir}/SKILL.md`, content);
      // Write additional files (scripts, templates, etc.)
      if (files?.length) {
        for (const f of files) {
          const safeName = path.basename(f.name);
          writeFileSync(`${skillDir}/${safeName}`, f.content);
        }
      }
      // Also write to workspace-main/skills/ so OpenClaw can find and edit the skill
      mkdirSync(`${configDir}/workspace-main/skills`, { recursive: true });
      const wmSkillDir = `${configDir}/workspace-main/skills/${slug}`;
      mkdirSync(wmSkillDir, { recursive: true });
      writeFileSync(`${wmSkillDir}/SKILL.md`, content);
      if (files?.length) {
        for (const f of files) {
          const safeName = path.basename(f.name);
          writeFileSync(`${wmSkillDir}/${safeName}`, f.content);
        }
      }
      execSync(`chown -R 1000:1000 ${configDir}/skills ${configDir}/workspace-main/skills 2>/dev/null; true`, { timeout: 5000 });
      return { success: true, message: `Skill "${slug}" installed` };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: `Failed to install skill: ${message}` });
    }
  });

  // POST /internal/employees/:id/skills/uninstall — remove a skill directory from the employee's container
  fastify.post<{ Params: { id: string } }>("/internal/employees/:id/skills/uninstall", async (request, reply) => {
    const { id } = request.params;
    const { slug } = request.body as { slug: string };

    if (!slug) {
      return reply.status(400).send({ error: "slug is required" });
    }

    const employee = await db.query.employees.findFirst({
      where: eq(employees.id, id),
    });
    if (!employee) {
      return reply.status(404).send({ error: "Employee not found" });
    }

    const configDir = `/opt/ai-employees/openclaw-configs/${id}`;
    const skillDir = `${configDir}/skills/${slug}`;

    try {
      if (existsSync(skillDir)) {
        execSync(`rm -rf ${JSON.stringify(skillDir)}`, { timeout: 5000 });
      }
      // Also remove from workspace-main/skills/
      const wmSkillDir = `${configDir}/workspace-main/skills/${slug}`;
      if (existsSync(wmSkillDir)) {
        execSync(`rm -rf ${JSON.stringify(wmSkillDir)}`, { timeout: 5000 });
      }
      return { success: true, message: `Skill "${slug}" uninstalled` };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: `Failed to uninstall skill: ${message}` });
    }
  });

  // POST /internal/hot-update — pull latest code, rebuild, restart services + regenerate employee configs
  fastify.post("/internal/hot-update", async (request, reply) => {
    const body = request.body as { branch?: string } | undefined;
    const branch = body?.branch || "main";

    const steps: string[] = [];
    const errors: string[] = [];

    const run = (label: string, cmd: string, timeout = 120_000): boolean => {
      try {
        const output = execSync(cmd, { timeout, cwd: "/opt/ai-employees/app", stdio: "pipe" }).toString().trim();
        steps.push(`✓ ${label}`);
        if (output) steps.push(`  ${output.split("\n").pop()}`);
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300);
        errors.push(`✗ ${label}: ${msg}`);
        return false;
      }
    };

    // 1. Update code — try git pull first, fall back to tarball download
    const hasGit = run("check git", "git rev-parse --is-inside-work-tree", 5_000);
    if (hasGit) {
      run("git fetch", `git fetch origin ${branch}`, 30_000);
      if (!run("git reset", `git reset --hard origin/${branch}`, 15_000)) {
        return reply.status(500).send({ error: "Git pull failed", steps, errors });
      }
    } else {
      // No git repo (provisioned via tarball) — download fresh tarball
      errors.length = 0; // clear the "check git" error
      const tarballUrl = `https://github.com/carmichgo/ai-employees/archive/refs/heads/${branch}.tar.gz`;
      if (!run("download tarball", `curl -sL "${tarballUrl}" -o /tmp/hot-update.tar.gz`, 60_000)) {
        return reply.status(500).send({ error: "Code download failed", steps, errors });
      }
      if (!run("extract tarball", `tar xzf /tmp/hot-update.tar.gz --strip-components=1 -C /opt/ai-employees/app && rm -f /tmp/hot-update.tar.gz`, 30_000)) {
        return reply.status(500).send({ error: "Code extraction failed", steps, errors });
      }
      run("copy env", "cp /opt/ai-employees/.env /opt/ai-employees/app/.env 2>/dev/null || true", 5_000);
    }

    // 2. Install dependencies
    run("pnpm install", "NODE_ENV=development CI=1 pnpm install --frozen-lockfile 2>&1 || NODE_ENV=development CI=1 pnpm install 2>&1", 180_000);

    // 3. Build API + worker (try turbo first, fall back to sequential tsc)
    if (!run("build", "pnpm turbo build --filter=@ai-employees/api --filter=@ai-employees/worker 2>&1", 180_000)) {
      // Turbo may fail on resource-constrained droplets — try building packages sequentially
      errors.pop(); // Remove the turbo error
      const pkgs = ["packages/shared", "packages/db", "packages/openclaw-config", "apps/api", "apps/worker"];
      let allOk = true;
      for (const pkg of pkgs) {
        if (!run(`build ${pkg}`, `cd ${pkg} && npx tsc 2>&1`, 60_000)) { allOk = false; break; }
      }
      if (!allOk) {
        return reply.status(500).send({ error: "Build failed", steps, errors });
      }
    }

    // 4. Patch package.json main fields for ESM runtime
    run("patch package.json", `sed -i 's|"main": "src/index.ts"|"main": "dist/index.js"|g' packages/*/package.json`, 5_000);

    // 5. Regenerate OpenClaw configs for all active employees
    const activeEmployees = await db.query.employees.findMany({
      where: eq(employees.status, "active"),
    });

    for (const emp of activeEmployees) {
      const configDir = `/opt/ai-employees/openclaw-configs/${emp.id}`;
      if (!existsSync(configDir)) continue;

      try {
        // Dynamically import the config generators (freshly built)
        const {
          generateIdentityMd: genIdentity,
          generateSoulMd: genSoul,
          generateUserMd: genUser,
          generateToolsMd: genTools,
          generateAgentsMd: genAgents,
          generateOpenClawConfig: genConfig,
          generateCaptchaSolvingSkill: genCaptcha,
          generateAccountCreationSkill: genAccount,
          generateTaskLoggingSkill: genTaskLog,
          generateMediaGenerationSkill: genMedia,
          generateRestartGatewaySkill: genRestart,
          generateTeamCommunicationSkill: genTeamComm,
          generateTaskManagementSkill: genTaskMgmt,
          generateCredentialManagerScript: genCred,
          generateImageScript: genImage,
          generateVideoScript: genVideo,
          generateDocxSkill: genDocx,
          generateSkillBuildingSkill: genSkillBuilding,
          generateHeartbeatMd: genHeartbeat,
        } = await import("@ai-employees/openclaw-config");

        const company = await db.query.companies.findFirst({ where: eq(companies.id, emp.companyId) });
        const owner = await db.query.users.findFirst({ where: eq(users.companyId, emp.companyId) });

        const employeeInput = {
          id: emp.id,
          name: emp.name,
          jobTitle: emp.jobTitle,
          emoji: emp.emoji || undefined,
          tier: emp.tier || "junior",
          persona: emp.persona,
          goals: emp.goals,
          personalityConfig: emp.personalityConfig as { autonomy?: string; proactivity?: string; communication?: string; bossTechnicalLevel?: string } | null,
          authorityConfig: emp.authorityConfig as { defaultRole?: "manager" | "colleague"; members?: Array<{ slackUserId: string; name: string; role: "manager" | "colleague" }> } | null,
          companySlug: company?.slug || "unknown",
          companyName: company?.name || "Unknown",
          ownerName: owner?.name,
          modelConfig: emp.modelConfig as { primary: string; fallbacks?: string[] },
          toolsConfig: emp.toolsConfig as Record<string, unknown>,
          sandboxConfig: emp.sandboxConfig as Record<string, unknown>,
          channels: [],
        };

        const identityMd = genIdentity(employeeInput);
        const soulMd = genSoul(employeeInput);
        const userMd = genUser(employeeInput);
        const toolsMd = genTools(employeeInput);
        const agentsMd = genAgents(employeeInput);
        const config = genConfig(employeeInput, emp.gatewayToken!, soulMd);

        // Write updated configs — all OpenClaw workspace files
        const heartbeatMd = genHeartbeat();
        writeFileSync(`${configDir}/openclaw.json`, JSON.stringify(config, null, 2));
        // Write all OpenClaw workspace files
        const workspaceFiles = { "IDENTITY.md": identityMd, "SOUL.md": soulMd, "USER.md": userMd, "TOOLS.md": toolsMd, "AGENTS.md": agentsMd, "HEARTBEAT.md": heartbeatMd };
        mkdirSync(`${configDir}/workspace-main`, { recursive: true });
        for (const [name, content] of Object.entries(workspaceFiles)) {
          writeFileSync(`${configDir}/${name}`, content);
          writeFileSync(`${configDir}/workspace/${name}`, content);
          writeFileSync(`${configDir}/workspace-main/${name}`, content);
        }
        writeFileSync(`${configDir}/cred.js`, genCred(), { mode: 0o755 });

        // Seed memory.md if it doesn't exist yet — Edit tool needs the file to exist
        const seedMemory = `# Memory\n\n_No notes yet. Update this file as you learn and complete tasks._\n`;
        if (!existsSync(`${configDir}/workspace/memory.md`)) {
          writeFileSync(`${configDir}/workspace/memory.md`, seedMemory);
        }
        if (!existsSync(`${configDir}/workspace-main/memory.md`)) {
          writeFileSync(`${configDir}/workspace-main/memory.md`, seedMemory);
        }

        // Write updated skills to both skills/ and workspace-main/skills/
        const skillDir = `${configDir}/skills`;
        const wmSkillDir = `${configDir}/workspace-main/skills`;
        const writeSkill = (name: string, content: string) => {
          mkdirSync(`${skillDir}/${name}`, { recursive: true });
          writeFileSync(`${skillDir}/${name}/SKILL.md`, content);
          {
            mkdirSync(`${wmSkillDir}/${name}`, { recursive: true });
            writeFileSync(`${wmSkillDir}/${name}/SKILL.md`, content);
          }
        };
        writeSkill("captcha-solving", genCaptcha());
        writeSkill("account-creation", genAccount());
        writeSkill("task-logging", genTaskLog());
        writeSkill("media-generation", genMedia());
        writeSkill("restart-gateway", genRestart());
        writeSkill("team-communication", genTeamComm());
        writeSkill("task-management", genTaskMgmt());
        writeSkill("docx", genDocx());
        writeSkill("skill-building", genSkillBuilding());

        // Also sync any custom (non-built-in) skills from skills/ to workspace-main/skills/
        {
          const builtIn = new Set(["captcha-solving","account-creation","task-logging","media-generation","restart-gateway","team-communication","task-management","docx","skill-building"]);
          try {
            const entries = readdirSync(skillDir, { withFileTypes: true });
            for (const e of entries) {
              if (e.isDirectory() && !builtIn.has(e.name)) {
                const src = `${skillDir}/${e.name}/SKILL.md`;
                if (existsSync(src)) {
                  mkdirSync(`${wmSkillDir}/${e.name}`, { recursive: true });
                  writeFileSync(`${wmSkillDir}/${e.name}/SKILL.md`, readFileSync(src, "utf-8"));
                }
              }
            }
          } catch {}
        }

        writeFileSync(`${configDir}/generate-image.sh`, genImage(), { mode: 0o755 });
        writeFileSync(`${configDir}/generate-video.sh`, genVideo(), { mode: 0o755 });

        // Create symlinks inside workspace-main so edit/write tools can reach skills etc.
        try {
          symlinkSync("../skills", `${configDir}/workspace-main/skills`);
        } catch { /* already exists */ }
        try {
          symlinkSync("../workspace", `${configDir}/workspace-main/workspace-ref`);
        } catch { /* already exists */ }
        try {
          symlinkSync("../credentials", `${configDir}/workspace-main/credentials`);
        } catch { /* already exists */ }

        // Fix permissions
        execSync(`chown -R 1000:1000 ${configDir}`, { timeout: 5000 });

        // Restart the OpenClaw container
        if (emp.containerName) {
          execSync(`docker restart ${emp.containerName}`, { timeout: 30_000 });
          // Wait for container and update IP
          await new Promise((r) => setTimeout(r, 3000));

          // Start TCP tunnel (0.0.0.0:18793 → 127.0.0.1:18792) so the API proxy
          // can reach the relay listener which only binds to localhost.
          // Write the tunnel script to the bind-mounted config dir so it persists.
          const tunnelScript = `#!/usr/bin/env node
const net = require('net');
const server = net.createServer(client => {
  const upstream = net.connect(18792, '127.0.0.1', () => {
    client.pipe(upstream);
    upstream.pipe(client);
  });
  upstream.on('error', () => client.destroy());
  client.on('error', () => upstream.destroy());
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') process.exit(0); // already running
  console.error('tunnel error:', err.message);
});
server.listen(18793, '0.0.0.0', () => console.log('relay tunnel listening on 18793'));
`;
          const configDir = `/opt/ai-employees/openclaw-configs/${emp.id}`;
          writeFileSync(`${configDir}/relay-tunnel.mjs`, tunnelScript, { mode: 0o755 });
          try {
            execSync(
              `docker exec -d ${emp.containerName} node /home/node/.openclaw/relay-tunnel.mjs`,
              { timeout: 10_000 },
            );
            steps.push(`✓ Relay tunnel started for ${emp.name}`);
          } catch (tunErr: unknown) {
            const tunMsg = tunErr instanceof Error ? tunErr.message : String(tunErr);
            errors.push(`✗ Relay tunnel for ${emp.name}: ${tunMsg.slice(0, 200)}`);
          }
          try {
            const newIp = execSync(
              `docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${emp.containerName}`,
              { timeout: 5000 },
            ).toString().trim();
            if (newIp) {
              await db.update(employees).set({ containerHost: newIp, updatedAt: new Date() }).where(eq(employees.id, emp.id));
            }
          } catch { /* non-fatal */ }
        }

        steps.push(`✓ Updated config for ${emp.name}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200);
        errors.push(`✗ Config update for ${emp.name}: ${msg}`);
      }
    }

    // 6. Restart systemd services (API + worker)
    // Use a delayed restart so this response can be sent first
    setTimeout(() => {
      try {
        execSync("systemctl restart ai-employees-api ai-employees-worker", { timeout: 15_000 });
      } catch { /* service restart is fire-and-forget */ }
    }, 2000);

    steps.push("✓ Service restart scheduled (2s delay)");

    return {
      success: errors.length === 0,
      branch,
      employeesUpdated: activeEmployees.length,
      steps,
      errors,
    };
  });

  // POST /internal/regenerate-configs — regenerate SOUL.md and skills for all active employees
  // Lightweight alternative to hot-update when code is already deployed
  fastify.post("/internal/regenerate-configs", async (_request, reply) => {
    const steps: string[] = [];
    const errors: string[] = [];

    const activeEmps = await db.query.employees.findMany({
      where: inArray(employees.status, ["active", "error"]),
    });

    for (const emp of activeEmps) {
      const configDir = `/opt/ai-employees/openclaw-configs/${emp.id}`;
      if (!existsSync(configDir)) { errors.push(`Config dir missing for ${emp.name}`); continue; }

      try {
        const {
          generateIdentityMd: genIdentity,
          generateSoulMd: genSoul,
          generateUserMd: genUser,
          generateToolsMd: genTools,
          generateAgentsMd: genAgents,
          generateOpenClawConfig: genConfig,
          generateCaptchaSolvingSkill: genCaptcha,
          generateAccountCreationSkill: genAccount,
          generateTaskLoggingSkill: genTaskLog,
          generateMediaGenerationSkill: genMedia,
          generateRestartGatewaySkill: genRestart,
          generateTeamCommunicationSkill: genTeamComm,
          generateTaskManagementSkill: genTaskMgmt,
          generateCredentialManagerScript: genCred,
          generateImageScript: genImage,
          generateVideoScript: genVideo,
          generateDocxSkill: genDocx,
          generateSkillBuildingSkill: genSkillBuilding,
          generateHeartbeatMd: genHeartbeat,
        } = await import("@ai-employees/openclaw-config");

        const company = await db.query.companies.findFirst({ where: eq(companies.id, emp.companyId) });
        const owner = await db.query.users.findFirst({ where: eq(users.companyId, emp.companyId) });

        const employeeInput = {
          id: emp.id,
          name: emp.name,
          jobTitle: emp.jobTitle,
          emoji: emp.emoji || undefined,
          tier: emp.tier || "junior",
          persona: emp.persona,
          goals: emp.goals,
          personalityConfig: emp.personalityConfig as { autonomy?: string; proactivity?: string; communication?: string; bossTechnicalLevel?: string } | null,
          authorityConfig: emp.authorityConfig as { defaultRole?: "manager" | "colleague"; members?: Array<{ slackUserId: string; name: string; role: "manager" | "colleague" }> } | null,
          companySlug: company?.slug || "unknown",
          companyName: company?.name || "Unknown",
          ownerName: owner?.name,
          modelConfig: emp.modelConfig as { primary: string; fallbacks?: string[] },
          toolsConfig: emp.toolsConfig as Record<string, unknown>,
          sandboxConfig: emp.sandboxConfig as Record<string, unknown>,
          channels: [],
        };

        const identityMd = genIdentity(employeeInput);
        const soulMd = genSoul(employeeInput);
        const userMd = genUser(employeeInput);
        const toolsMd = genTools(employeeInput);
        const agentsMd = genAgents(employeeInput);
        const config = genConfig(employeeInput, emp.gatewayToken!, soulMd);

        const heartbeatMd = genHeartbeat();
        writeFileSync(`${configDir}/openclaw.json`, JSON.stringify(config, null, 2));
        // Write all OpenClaw workspace files
        const workspaceFiles = { "IDENTITY.md": identityMd, "SOUL.md": soulMd, "USER.md": userMd, "TOOLS.md": toolsMd, "AGENTS.md": agentsMd, "HEARTBEAT.md": heartbeatMd };
        mkdirSync(`${configDir}/workspace-main`, { recursive: true });
        for (const [name, content] of Object.entries(workspaceFiles)) {
          writeFileSync(`${configDir}/${name}`, content);
          writeFileSync(`${configDir}/workspace/${name}`, content);
          writeFileSync(`${configDir}/workspace-main/${name}`, content);
        }
        writeFileSync(`${configDir}/cred.js`, genCred(), { mode: 0o755 });

        // Seed memory.md if it doesn't exist yet — Edit tool needs the file to exist
        const seedMem = `# Memory\n\n_No notes yet. Update this file as you learn and complete tasks._\n`;
        if (!existsSync(`${configDir}/workspace/memory.md`)) {
          writeFileSync(`${configDir}/workspace/memory.md`, seedMem);
        }
        if (!existsSync(`${configDir}/workspace-main/memory.md`)) {
          writeFileSync(`${configDir}/workspace-main/memory.md`, seedMem);
        }

        // Write updated skills to both skills/ and workspace-main/skills/
        const skillDir = `${configDir}/skills`;
        const wmSkillDir2 = `${configDir}/workspace-main/skills`;
        const writeSkill2 = (name: string, content: string) => {
          mkdirSync(`${skillDir}/${name}`, { recursive: true });
          writeFileSync(`${skillDir}/${name}/SKILL.md`, content);
          mkdirSync(`${wmSkillDir2}/${name}`, { recursive: true });
          writeFileSync(`${wmSkillDir2}/${name}/SKILL.md`, content);
        };
        writeSkill2("captcha-solving", genCaptcha());
        writeSkill2("account-creation", genAccount());
        writeSkill2("task-logging", genTaskLog());
        writeSkill2("media-generation", genMedia());
        writeSkill2("restart-gateway", genRestart());
        writeSkill2("team-communication", genTeamComm());
        writeSkill2("task-management", genTaskMgmt());
        writeSkill2("docx", genDocx());
        writeSkill2("skill-building", genSkillBuilding());

        // Sync custom skills to workspace-main/skills/
        {
          const builtIn2 = new Set(["captcha-solving","account-creation","task-logging","media-generation","restart-gateway","team-communication","task-management","docx","skill-building"]);
          try {
            const entries2 = readdirSync(skillDir, { withFileTypes: true });
            for (const e of entries2) {
              if (e.isDirectory() && !builtIn2.has(e.name)) {
                const src = `${skillDir}/${e.name}/SKILL.md`;
                if (existsSync(src)) {
                  mkdirSync(`${wmSkillDir2}/${e.name}`, { recursive: true });
                  writeFileSync(`${wmSkillDir2}/${e.name}/SKILL.md`, readFileSync(src, "utf-8"));
                }
              }
            }
          } catch {}
        }

        writeFileSync(`${configDir}/generate-image.sh`, genImage(), { mode: 0o755 });
        writeFileSync(`${configDir}/generate-video.sh`, genVideo(), { mode: 0o755 });

        // Create symlinks inside workspace-main so edit/write tools can reach skills etc.
        try { symlinkSync("../skills", `${configDir}/workspace-main/skills`); } catch { /* exists */ }
        try { symlinkSync("../workspace", `${configDir}/workspace-main/workspace-ref`); } catch { /* exists */ }
        try { symlinkSync("../credentials", `${configDir}/workspace-main/credentials`); } catch { /* exists */ }

        execSync(`chown -R 1000:1000 ${configDir}`, { timeout: 5000 });

        // Restart container to pick up new configs
        if (emp.containerName) {
          execSync(`docker restart ${emp.containerName}`, { timeout: 30_000 });
          await new Promise((r) => setTimeout(r, 3000));
          try {
            const newIp = execSync(
              `docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${emp.containerName}`,
              { timeout: 5000 },
            ).toString().trim();
            const updates: Record<string, unknown> = { updatedAt: new Date() };
            if (newIp) updates.containerHost = newIp;
            // If the employee was in "error" state, move back to "active" after successful config regen
            if (emp.status === "error") updates.status = "active";
            await db.update(employees).set(updates).where(eq(employees.id, emp.id));
          } catch { /* non-fatal */ }
        }

        steps.push(`✓ Regenerated configs for ${emp.name}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200);
        errors.push(`✗ ${emp.name}: ${msg}`);
      }
    }

    return { success: errors.length === 0, employeesUpdated: activeEmps.length, steps, errors };
  });

  // POST /internal/employees/:id/chat — proxy chat to container or call Anthropic directly
  fastify.post<{ Params: { id: string } }>("/internal/employees/:id/chat", async (request, reply) => {
    const { id } = request.params;
    const body = request.body as {
      messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>;
      userId?: string; // passed by dashboard so we can persist the reply
    };

    const employee = await db.query.employees.findFirst({
      where: eq(employees.id, id),
    });
    if (!employee) return reply.status(404).send({ error: "Employee not found" });
    if (employee.status === "terminated" || employee.status === "paused") {
      return reply.status(400).send({ error: `Employee is ${employee.status}` });
    }

    // Helper: persist a reply to chat_messages so it survives even if
    // the dashboard's HTTP request has already timed out.
    // Dedup: the Vercel chat route also saves the reply, so check for a
    // recent identical message before inserting to avoid duplicates.
    const saveReply = async (content: string, mode: string) => {
      if (!body.userId) return;
      try {
        const existing = await db.query.chatMessages.findFirst({
          where: and(
            eq(chatMessages.employeeId, id),
            eq(chatMessages.role, "assistant"),
            eq(chatMessages.content, content),
            sql`${chatMessages.createdAt} > now() - interval '30 seconds'`,
          ),
        });
        if (existing) {
          console.log(`[chat-proxy] Skipping duplicate save for employee ${id}`);
          return;
        }
        await db.insert(chatMessages).values({
          employeeId: id,
          userId: body.userId,
          role: "assistant",
          content,
          mode,
        });
      } catch (err) {
        console.error(`[chat-proxy] Failed to save reply for employee ${id}:`, err);
      }
    };

    // If container is available, route through it (OpenClaw).
    // The gateway's /v1/chat/completions is a pass-through — it does NOT inject
    // SOUL.md as a system prompt. So we read SOUL.md from disk and prepend it
    // as a system message so the AI knows who it is. The Vercel route also
    // injects a system prompt from the DB (belt-and-suspenders: if either
    // already has a system message, the first one wins).
    if (employee.containerHost && employee.containerPort) {
      let containerHost = employee.containerHost;
      const containerPort = employee.containerPort;

      // Inject OpenClaw workspace files + memory.md as system prompt if not already present
      // OpenClaw reads AGENTS.md, SOUL.md, USER.md, TOOLS.md, IDENTITY.md at session start.
      // For the chat-proxy path (direct HTTP), we need to replicate that by loading them all.
      let chatMessages = body.messages;
      const hasSystemMsg = chatMessages.some((m) => m.role === "system");
      if (!hasSystemMsg) {
        const configDir = `/opt/ai-employees/openclaw-configs/${id}`;
        try {
          // Load workspace files in the order OpenClaw reads them
          const workspaceFileNames = ["AGENTS.md", "SOUL.md", "USER.md", "TOOLS.md", "IDENTITY.md"];
          const parts: string[] = [];
          for (const name of workspaceFileNames) {
            try {
              const content = readFileSync(`${configDir}/${name}`, "utf-8").trim();
              if (content) parts.push(content);
            } catch {
              // File not found — skip (blank files are skipped per OpenClaw spec)
            }
          }

          let systemContent = parts.join("\n\n---\n\n");

          // Append memory.md if it exists — persistent context the employee maintains.
          // Check workspace-main first (OpenClaw's runtime session workspace), then workspace/.
          const memoryPaths = [
            `${configDir}/workspace-main/memory.md`,
            `${configDir}/workspace/memory.md`,
          ];
          for (const memoryPath of memoryPaths) {
            try {
              const memoryMd = readFileSync(memoryPath, "utf-8");
              if (memoryMd.trim()) {
                systemContent += "\n\n---\n\n# Your Memory (from memory.md)\n\nThe following is your persistent memory — context you wrote down to carry over between sessions:\n\n" + memoryMd;
                break;
              }
            } catch {
              // memory.md doesn't exist at this path — try next
            }
          }

          if (systemContent.trim()) {
            chatMessages = [{ role: "system", content: systemContent }, ...chatMessages];
          }
        } catch {
          // Workspace files not found — fall through without system prompt
          console.log(`[chat-proxy] Workspace files not found for ${id}, proceeding without system prompt`);
        }
      }

      const chatModel = (employee.modelConfig as { primary?: string })?.primary || "anthropic/claude-sonnet-4-5-20250929";
      const sendToContainer = async (host: string) => {
        const containerUrl = `http://${host}:${containerPort}/v1/chat/completions`;
        const model = chatModel;
        console.log(`[chat-proxy] Sending to ${containerUrl} model=${model} msgs=${chatMessages.length} token=${employee.gatewayToken ? "set" : "MISSING"}`);
        return fetch(containerUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${employee.gatewayToken}`,
          },
          body: JSON.stringify({
            model,
            messages: chatMessages,
            stream: false,
          }),
        });
      };

      try {
        // Track request sent
        try { await db.update(employees).set({ lastRequestSentAt: new Date() } as any).where(eq(employees.id, id)); } catch {}

        let res = await sendToContainer(containerHost);

        // Track response received
        try { await db.update(employees).set({ lastResponseAt: new Date() } as any).where(eq(employees.id, id)); } catch {}

        if (!res.ok) {
          const err = await res.text();
          return reply.status(res.status).send({ error: `OpenClaw error: ${err}` });
        }

        // Parse response — handle both JSON and SSE (streaming) formats.
        // The container may return SSE even without stream:true in some configs.
        let replyText: string;
        let usage: unknown;
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("text/event-stream")) {
          // SSE: accumulate text chunks from "data: {...}" lines
          const sseText = await res.text();
          replyText = "";
          for (const line of sseText.split("\n")) {
            if (!line.startsWith("data: ") || line.trim() === "data: [DONE]") continue;
            try {
              const chunk = JSON.parse(line.slice(6));
              const delta = chunk.choices?.[0]?.delta?.content;
              if (delta) replyText += delta;
            } catch { /* skip unparseable lines */ }
          }
          replyText = replyText || "No response";
        } else {
          const data = await res.json() as { choices?: { message?: { content?: string } }[]; usage?: unknown };
          replyText = data.choices?.[0]?.message?.content || "No response";
          usage = data.usage;
        }

        // Record token usage
        const usageData = extractUsage({ usage });
        if (usageData) {
          recordTokenUsage({
            companyId: employee.companyId,
            employeeId: id,
            source: "chat",
            model: chatModel,
            ...usageData,
          });
        }

        // Always persist — this is the key fix. The dashboard may have timed
        // out and disconnected, but this handler on the droplet keeps running.
        // By saving here, the reply is never lost.
        await saveReply(replyText, "live");

        return { reply: replyText, mode: "live", usage };
      } catch (err: unknown) {
        // Log the exact error for debugging
        const errDetail = err instanceof Error
          ? { message: err.message, code: (err as any).code, cause: (err as any).cause?.message }
          : String(err);
        console.error(`[chat-proxy] Initial fetch failed for ${employee.containerName} at ${containerHost}:${containerPort}:`, errDetail);

        // Container unreachable — IP may have changed after docker restart,
        // or the gateway may still be starting up. Retry with backoff.
        if (employee.containerName) {
          try {
            const newIp = execSync(
              `docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${employee.containerName}`,
              { timeout: 5000 },
            ).toString().trim();

            // Also check if the container is actually running
            const containerState = execSync(
              `docker inspect --format '{{.State.Status}}' ${employee.containerName}`,
              { timeout: 5000 },
            ).toString().trim();
            console.log(`[chat-proxy] Container ${employee.containerName}: state=${containerState}, ip=${newIp}, dbIp=${containerHost}`);

            if (containerState !== "running") {
              console.error(`[chat-proxy] Container ${employee.containerName} is ${containerState}, not running`);
              return reply.status(503).send({ error: `Container is ${containerState} — please wait for it to restart` });
            }

            const retryIp = (newIp && newIp !== containerHost) ? newIp : containerHost;
            if (newIp && newIp !== containerHost) {
              console.log(`[chat-proxy] IP changed for ${employee.containerName}: ${containerHost} -> ${newIp}`);
              await db.update(employees).set({ containerHost: newIp, updatedAt: new Date() }).where(eq(employees.id, id));
            }

            // Retry up to 3 times with delays — the gateway may still be starting
            for (let attempt = 1; attempt <= 3; attempt++) {
              await new Promise((r) => setTimeout(r, attempt * 2000)); // 2s, 4s, 6s
              console.log(`[chat-proxy] Retry ${attempt}/3 for ${employee.containerName} at ${retryIp}:${containerPort}`);
              try {
                const retryRes = await sendToContainer(retryIp);
                if (!retryRes.ok) {
                  const retryErr = await retryRes.text();
                  return reply.status(retryRes.status).send({ error: `OpenClaw error: ${retryErr}` });
                }
                // Handle both JSON and SSE responses
                let retryReplyText: string;
                let retryUsage: unknown;
                const retryCt = retryRes.headers.get("content-type") || "";
                if (retryCt.includes("text/event-stream")) {
                  const sseText = await retryRes.text();
                  retryReplyText = "";
                  for (const line of sseText.split("\n")) {
                    if (!line.startsWith("data: ") || line.trim() === "data: [DONE]") continue;
                    try {
                      const chunk = JSON.parse(line.slice(6));
                      const delta = chunk.choices?.[0]?.delta?.content;
                      if (delta) retryReplyText += delta;
                    } catch { /* skip */ }
                  }
                  retryReplyText = retryReplyText || "No response";
                } else {
                  const retryData = await retryRes.json() as { choices?: { message?: { content?: string } }[]; usage?: unknown };
                  retryReplyText = retryData.choices?.[0]?.message?.content || "No response";
                  retryUsage = retryData.usage;
                }
                // Record token usage for retry
                const retryUsageData = extractUsage({ usage: retryUsage });
                if (retryUsageData) {
                  recordTokenUsage({
                    companyId: employee.companyId,
                    employeeId: id,
                    source: "chat",
                    model: chatModel,
                    ...retryUsageData,
                  });
                }

                await saveReply(retryReplyText, "live");
                return { reply: retryReplyText, mode: "live", usage: retryUsage };
              } catch (retryErr: unknown) {
                const retryDetail = retryErr instanceof Error ? retryErr.message : String(retryErr);
                console.error(`[chat-proxy] Retry ${attempt}/3 failed: ${retryDetail}`);
              }
            }
          } catch (inspectErr: unknown) {
            const inspectDetail = inspectErr instanceof Error ? inspectErr.message : String(inspectErr);
            console.error(`[chat-proxy] Docker inspect failed: ${inspectDetail}`);
          }
        }

        const message = err instanceof Error ? err.message : String(err);
        return reply.status(502).send({ error: `Container unreachable: ${message}` });
      }
    }

    // No container available — employee must have a running container to chat
    return reply.status(503).send({
      error: `${employee.name} is not available — no container is running. The employee needs to be provisioned or reprovisioned.`,
    });
  });
}
