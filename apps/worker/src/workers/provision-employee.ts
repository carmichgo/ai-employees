import { eq, not, inArray } from "drizzle-orm";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { db, employees, companies, users } from "@ai-employees/db";
import { getResourcesForTier, type EmployeeTier } from "@ai-employees/shared";
import {
  generateOpenClawConfig,
  generateIdentityMd,
  generateSoulMd,
  generateUserMd,
  generateToolsMd,
  generateAgentsMd,

  generateCredentialManagerScript,
  generateSendEmailScript,
  generateCaptchaSolvingSkill,
  generateAccountCreationSkill,
  generateTaskLoggingSkill,
  generateMediaGenerationSkill,
  generateRestartGatewaySkill,
  generateTeamCommunicationSkill,
  generateTaskManagementSkill,
  generateImageScript,
  generateVideoScript,
  generateDocxSkill,
  generateDocxInstallScript,
  generateSkillBuildingSkill,
  generateHeartbeatMd,
  type EmployeeInput,
} from "@ai-employees/openclaw-config";
import { docker, ensureNetwork, ensureImage } from "../docker/client.js";

const OPENCLAW_IMAGE = process.env.OPENCLAW_IMAGE || "ghcr.io/carmichgo/openclaw:latest";
const OPENCLAW_NETWORK = process.env.OPENCLAW_NETWORK || "ai-employees-internal";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const BRAVE_API_KEY = process.env.BRAVE_API_KEY || "";
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "";
const INTERSERVICE_SECRET = process.env.INTERSERVICE_SECRET || "";
const API_DOMAIN = process.env.API_DOMAIN || "";

/** Derive a per-employee encryption key from the system key + employee ID */
function deriveEmployeeEncryptionKey(employeeId: string): string {
  return crypto
    .createHmac("sha256", ENCRYPTION_KEY)
    .update(`employee-cred-key:${employeeId}`)
    .digest("hex");
}

export interface ProvisionJobData {
  employeeId: string;
  companyId: string;
  channels: string[];
  channelCredentials?: Record<string, Record<string, unknown>>;
  skills?: string[];
}

export async function provisionEmployee(data: ProvisionJobData): Promise<void> {
  const { employeeId } = data;

  console.log(`[provision] Starting provisioning for employee ${employeeId}`);

  // Get employee from DB
  const employee = await db.query.employees.findFirst({
    where: eq(employees.id, employeeId),
  });
  if (!employee) throw new Error(`Employee ${employeeId} not found`);

  // Guard against duplicate runs (e.g. BullMQ stalled-job retry).
  // If the employee already has a running container, skip silently.
  if (employee.status === "active" && employee.containerHost && employee.containerPort) {
    console.log(`[provision] Employee ${employeeId} is already active — skipping duplicate job`);
    return;
  }

  // Get company for slug and plan
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, data.companyId),
  });
  if (!company) throw new Error(`Company ${data.companyId} not found`);

  // Get company owner (first user / admin) so the employee knows their manager
  const owner = await db.query.users.findFirst({
    where: eq(users.companyId, data.companyId),
  });

  try {
    // Update status
    await db
      .update(employees)
      .set({ status: "provisioning", updatedAt: new Date() })
      .where(eq(employees.id, employeeId));

    // Use the email address configured by the manager (if any) — no fake email generation
    const emailAddress = employee.emailAddress || null;

    // Ensure Docker network exists
    await ensureNetwork(OPENCLAW_NETWORK);

    // Ensure OpenClaw image is available
    await ensureImage(OPENCLAW_IMAGE);

    // Create Docker volume for this employee's data
    const volumeName = `ai-emp-data-${employeeId}`;
    await docker.createVolume({ Name: volumeName });

    // Build channel inputs — merge credentials from company integrations
    const channelCreds = data.channelCredentials || {};
    const channelInputs = data.channels.map((type) => ({
      type,
      credentials: channelCreds[type] || {},
      config: {},
    }));

    // Determine resource limits based on employee tier
    const tier = (employee.tier as EmployeeTier) || "junior";

    // Generate OpenClaw config
    const employeeInput: EmployeeInput = {
      id: employee.id,
      name: employee.name,
      jobTitle: employee.jobTitle,
      emoji: employee.emoji || undefined,
      tier,
      persona: employee.persona,
      goals: employee.goals,
      personalityConfig: employee.personalityConfig as { autonomy?: string; proactivity?: string; communication?: string } | null,
      authorityConfig: employee.authorityConfig as { defaultRole?: "manager" | "colleague"; members?: Array<{ slackUserId: string; name: string; role: "manager" | "colleague" }> } | null,
      companySlug: company.slug,
      companyName: company.name,
      ownerName: owner?.name,
      modelConfig: employee.modelConfig as { primary: string; fallbacks?: string[] },
      toolsConfig: employee.toolsConfig as Record<string, unknown>,
      sandboxConfig: employee.sandboxConfig as Record<string, unknown>,
      channels: channelInputs,
    };

    // Generate all OpenClaw workspace files per the OpenClaw documentation:
    //   IDENTITY.md — Agent name, emoji, vibe
    //   SOUL.md     — Persona, philosophy, values, communication style
    //   USER.md     — Info about the human manager
    //   TOOLS.md    — Tool usage notes and guidance
    //   AGENTS.md   — Operating instructions, task logging, memory, safety
    //   HEARTBEAT.md — Autonomous work loop instructions
    const identityMd = generateIdentityMd(employeeInput);
    const soulMd = generateSoulMd(employeeInput);
    const userMd = generateUserMd(employeeInput);
    const toolsMd = generateToolsMd(employeeInput);
    const agentsMd = generateAgentsMd(employeeInput);
    const heartbeatMd = generateHeartbeatMd(employeeInput);
    const config = generateOpenClawConfig(employeeInput, employee.gatewayToken!, soulMd);

    const resources = getResourcesForTier(tier);

    // Write OpenClaw config + workspace files + skills to a host directory that gets bind-mounted
    const configDir = `/opt/ai-employees/openclaw-configs/${employeeId}`;
    mkdirSync(`${configDir}/workspace`, { recursive: true });
    mkdirSync(`${configDir}/workspace/uploads`, { recursive: true });
    mkdirSync(`${configDir}/credentials`, { recursive: true, mode: 0o700 });
    mkdirSync(`${configDir}/skills/captcha-solving`, { recursive: true });
    mkdirSync(`${configDir}/skills/account-creation`, { recursive: true });
    mkdirSync(`${configDir}/skills/task-logging`, { recursive: true });
    mkdirSync(`${configDir}/skills/media-generation`, { recursive: true });
    mkdirSync(`${configDir}/skills/restart-gateway`, { recursive: true });
    mkdirSync(`${configDir}/skills/team-communication`, { recursive: true });
    mkdirSync(`${configDir}/skills/task-management`, { recursive: true });
    mkdirSync(`${configDir}/skills/docx`, { recursive: true });
    mkdirSync(`${configDir}/skills/skill-building`, { recursive: true });

    // Write main config
    writeFileSync(`${configDir}/openclaw.json`, JSON.stringify(config, null, 2));

    // Write OpenClaw workspace files (root .openclaw dir — loaded into system prompt)
    writeFileSync(`${configDir}/IDENTITY.md`, identityMd);
    writeFileSync(`${configDir}/SOUL.md`, soulMd);
    writeFileSync(`${configDir}/USER.md`, userMd);
    writeFileSync(`${configDir}/TOOLS.md`, toolsMd);
    writeFileSync(`${configDir}/AGENTS.md`, agentsMd);
    writeFileSync(`${configDir}/HEARTBEAT.md`, heartbeatMd);

    // Also write to workspace/ subdirectory (OpenClaw reads from here too)
    writeFileSync(`${configDir}/workspace/IDENTITY.md`, identityMd);
    writeFileSync(`${configDir}/workspace/SOUL.md`, soulMd);
    writeFileSync(`${configDir}/workspace/USER.md`, userMd);
    writeFileSync(`${configDir}/workspace/TOOLS.md`, toolsMd);
    writeFileSync(`${configDir}/workspace/AGENTS.md`, agentsMd);
    writeFileSync(`${configDir}/workspace/HEARTBEAT.md`, heartbeatMd);

    // OpenClaw creates workspace-main at runtime — write there too if it exists
    if (existsSync(`${configDir}/workspace-main`)) {
      writeFileSync(`${configDir}/workspace-main/IDENTITY.md`, identityMd);
      writeFileSync(`${configDir}/workspace-main/SOUL.md`, soulMd);
      writeFileSync(`${configDir}/workspace-main/USER.md`, userMd);
      writeFileSync(`${configDir}/workspace-main/TOOLS.md`, toolsMd);
      writeFileSync(`${configDir}/workspace-main/AGENTS.md`, agentsMd);
      writeFileSync(`${configDir}/workspace-main/HEARTBEAT.md`, heartbeatMd);
    }

    // Write credential manager CLI script
    writeFileSync(`${configDir}/cred.js`, generateCredentialManagerScript(), { mode: 0o755 });

    // Write send-email CLI script (sends via Resend API, bypasses blocked SMTP ports)
    writeFileSync(`${configDir}/send-email.js`, generateSendEmailScript(), { mode: 0o755 });

    // Write skill files
    writeFileSync(`${configDir}/skills/captcha-solving/SKILL.md`, generateCaptchaSolvingSkill());
    writeFileSync(`${configDir}/skills/account-creation/SKILL.md`, generateAccountCreationSkill());
    writeFileSync(`${configDir}/skills/task-logging/SKILL.md`, generateTaskLoggingSkill());
    writeFileSync(`${configDir}/skills/media-generation/SKILL.md`, generateMediaGenerationSkill());
    writeFileSync(`${configDir}/skills/restart-gateway/SKILL.md`, generateRestartGatewaySkill());
    writeFileSync(`${configDir}/skills/team-communication/SKILL.md`, generateTeamCommunicationSkill());
    writeFileSync(`${configDir}/skills/task-management/SKILL.md`, generateTaskManagementSkill());
    writeFileSync(`${configDir}/skills/docx/SKILL.md`, generateDocxSkill());
    writeFileSync(`${configDir}/skills/skill-building/SKILL.md`, generateSkillBuildingSkill());

    // Write CLI wrapper scripts for image/video generation (installed into container below)
    writeFileSync(`${configDir}/generate-image.sh`, generateImageScript(), { mode: 0o755 });
    writeFileSync(`${configDir}/generate-video.sh`, generateVideoScript(), { mode: 0o755 });

    // Fix permissions for the node user (uid 1000) inside the container
    execSync(`chown -R 1000:1000 ${configDir}`);

    // Remove any stale container with the same name (handles 409 conflicts after failed teardowns)
    try {
      const stale = docker.getContainer(employee.containerName!);
      await stale.stop().catch(() => {});
      await stale.remove({ force: true });
      console.log(`[provision] Removed stale container ${employee.containerName}`);
    } catch {
      // No stale container — expected path
    }

    // Create the container — OpenClaw starts directly with all built-in tools enabled
    const container = await docker.createContainer({
      Image: OPENCLAW_IMAGE,
      name: employee.containerName!,
      Cmd: ["node", "openclaw.mjs", "gateway", "--bind", "lan", "--allow-unconfigured"],
      Env: [
        `HOME=/home/node`,
        `NODE_OPTIONS=--max-old-space-size=${getNodeHeapForTier(tier)}`,
        `OPENCLAW_GATEWAY_TOKEN=${employee.gatewayToken}`,
        `ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}`,
        ...(GEMINI_API_KEY ? [`GEMINI_API_KEY=${GEMINI_API_KEY}`] : []),
        ...(BRAVE_API_KEY ? [`BRAVE_API_KEY=${BRAVE_API_KEY}`] : []),
        ...(TWILIO_ACCOUNT_SID ? [`TWILIO_ACCOUNT_SID=${TWILIO_ACCOUNT_SID}`] : []),
        ...(TWILIO_AUTH_TOKEN ? [`TWILIO_AUTH_TOKEN=${TWILIO_AUTH_TOKEN}`] : []),
        `ENCRYPTION_KEY=${deriveEmployeeEncryptionKey(employeeId)}`,
        `EMPLOYEE_ID=${employeeId}`,
        ...(emailAddress ? [`EMPLOYEE_EMAIL=${emailAddress}`] : []),
        `EMPLOYEE_NAME=${employee.name}`,
        `EMPLOYEE_JOB_TITLE=${employee.jobTitle}`,
        `COMPANY_ID=${data.companyId}`,
        // Internal API URL — used by task-management, restart-gateway, team-communication, send-email skills
        `BLITZ_API_URL=http://host.docker.internal:${process.env.API_PORT || "3001"}`,
        `INTERSERVICE_SECRET=${INTERSERVICE_SECRET}`,
        // Email IMAP/SMTP credentials (if configured by company owner)
        ...buildEmailEnvVars(employee.provisionedAccounts as Record<string, unknown>),
      ],
      HostConfig: {
        Binds: [
          `${configDir}:/home/node/.openclaw`,
        ],
        ExtraHosts: ["host.docker.internal:host-gateway"],
        NetworkMode: OPENCLAW_NETWORK,
        Memory: parseMemory(resources.memory),
        NanoCpus: parseCpus(resources.cpus),
        // Chromium uses /dev/shm for tab rendering. Docker defaults it to 64MB which
        // causes Chromium to crash with SIGBUS / "Aw, Snap!" on any non-trivial page.
        ShmSize: 512 * 1024 * 1024, // 512MB
        RestartPolicy: { Name: "unless-stopped" },
      },
      Labels: {
        "ai-employees.employee-id": employeeId,
        "ai-employees.company-id": data.companyId,
        // Traefik labels — expose the OpenClaw gateway externally so users can
        // connect the OpenClaw browser extension via a local node host.
        // External URL: https://{API_DOMAIN}/gw/{employeeId}/
        ...(API_DOMAIN ? buildTraefikLabels(employeeId, API_DOMAIN) : {}),
      },
    });

    // Start the container
    await container.start();

    // Copy bundled skills from the Docker image into the bind-mounted config dir.
    // The bind mount at /home/node/.openclaw shadows the image's /app/skills/ directory,
    // so we need to explicitly copy bundled skills into the container's skill dir.
    // This runs synchronously so skills are available immediately (not after async CLI install).
    try {
      execSync(
        `docker exec ${employee.containerName} bash -c 'cp -rn /app/skills/* /home/node/.openclaw/skills/ 2>/dev/null; chown -R node:node /home/node/.openclaw/skills/ 2>/dev/null'`,
        { timeout: 15000 },
      );
      console.log(`[provision] Bundled skills copied into container for ${employee.name}`);
    } catch {
      console.log(`[provision] Could not copy bundled skills (non-critical, may not exist in image)`);
    }

    // Get container info for host/port
    const info = await container.inspect();
    let containerIp = info.NetworkSettings.Networks?.[OPENCLAW_NETWORK]?.IPAddress || null;

    // Update DB with container details (still provisioning until gateway ready)
    await db
      .update(employees)
      .set({
        containerId: info.Id,
        containerHost: containerIp,
        containerPort: 18789,
        updatedAt: new Date(),
      })
      .where(eq(employees.id, employeeId));

    // Install CLI tools synchronously BEFORE marking active.
    // This installs Chromium, GitHub CLI, himalaya, credential manager, etc.
    // The container is restarted at the end to pick up Chromium, so we need
    // to re-fetch the IP and wait for the gateway after this step.
    console.log(`[provision] Installing CLI tools for ${employee.name}...`);
    installCliTools(employee.containerName!);

    // After installCliTools restarts the container, poll until Docker reports it
    // as "running" before checking IP — Docker needs a moment to assign the
    // network IP, and heavy containers can take 15-30s to come up.
    {
      const maxWaitMs = 30_000;
      const pollInterval = 2000;
      const startWait = Date.now();
      let containerRunning = false;
      while (Date.now() - startWait < maxWaitMs) {
        try {
          const statusOut = execSync(
            `docker inspect --format='{{.State.Status}}' ${employee.containerName}`,
            { timeout: 5000, stdio: "pipe" },
          ).toString().trim();
          if (statusOut === "running") {
            containerRunning = true;
            break;
          }
          console.log(`[provision] Container status after restart: ${statusOut}, waiting...`);
        } catch { /* ignore */ }
        await new Promise((r) => setTimeout(r, pollInterval));
      }
      if (!containerRunning) {
        console.log(`[provision] Container not running after ${maxWaitMs / 1000}s — will still attempt IP refresh`);
      }
      // Extra 3s for network IP assignment after "running" state
      await new Promise((r) => setTimeout(r, 3000));
    }

    // Get the new IP address after restart
    try {
      const refreshedInfo = await container.inspect();
      const newIp = refreshedInfo.NetworkSettings.Networks?.[OPENCLAW_NETWORK]?.IPAddress || null;
      if (newIp && newIp !== containerIp) {
        containerIp = newIp;
        await db
          .update(employees)
          .set({ containerHost: newIp, updatedAt: new Date() })
          .where(eq(employees.id, employeeId));
        console.log(`[provision] Updated container IP after CLI install: ${newIp}`);
      } else if (!newIp) {
        console.log(`[provision] WARNING: No IP address found after restart — gateway polling may fail`);
      } else {
        console.log(`[provision] Container IP unchanged after restart: ${containerIp}`);
      }
    } catch (inspectErr) {
      const msg = inspectErr instanceof Error ? inspectErr.message : String(inspectErr);
      console.log(`[provision] Could not refresh container IP after CLI install: ${msg.slice(0, 200)}`);
    }

    // Wait for the OpenClaw gateway to be ready before marking active.
    // 300s timeout accounts for heavy containers after CLI tool installs
    // (Chromium, LibreOffice, pandoc add significant startup weight).
    if (containerIp) {
      const result = await waitForGateway(containerIp, 18789, 300_000, employee.containerName!);
      // Update DB if the IP changed during gateway polling (e.g. after container restart)
      if (result.host !== containerIp) {
        containerIp = result.host;
        await db
          .update(employees)
          .set({ containerHost: containerIp, updatedAt: new Date() })
          .where(eq(employees.id, employeeId));
        console.log(`[provision] Updated container IP after gateway ready: ${containerIp}`);
      }
    }

    await db
      .update(employees)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(employees.id, employeeId));

    console.log(
      `[provision] Employee ${employee.name} (${employeeId}) is now active at ${containerIp}:18789${emailAddress ? ` — email: ${emailAddress}` : ""}`,
    );

    // Create Slack channel for the employee if Slack is in their channels
    if (data.channels.includes("slack")) {
      createSlackChannel(employeeId);
    }
  } catch (error) {
    console.error(`[provision] Failed to provision employee ${employeeId}:`, error);

    // Store full error including container diagnostics (truncate to 4000 chars for DB)
    const fullError = error instanceof Error ? error.message : String(error);
    await db
      .update(employees)
      .set({
        status: "error",
        errorMessage: fullError.slice(0, 4000),
        updatedAt: new Date(),
      })
      .where(eq(employees.id, employeeId));

    throw error;
  }
}

export async function stopEmployee(employeeId: string): Promise<void> {
  const employee = await db.query.employees.findFirst({
    where: eq(employees.id, employeeId),
  });
  if (!employee?.containerId) return;

  const container = docker.getContainer(employee.containerId);
  await container.stop();
}

export async function startEmployee(employeeId: string): Promise<void> {
  const employee = await db.query.employees.findFirst({
    where: eq(employees.id, employeeId),
  });
  if (!employee?.containerId) return;

  const container = docker.getContainer(employee.containerId);
  await container.start();

  // Get possibly-changed IP after start
  const info = await container.inspect();
  const network = process.env.OPENCLAW_NETWORK || OPENCLAW_NETWORK;
  const ip = info.NetworkSettings.Networks?.[network]?.IPAddress || employee.containerHost;

  if (ip) {
    await db.update(employees).set({ containerHost: ip, updatedAt: new Date() }).where(eq(employees.id, employeeId));
    try {
      const result = await waitForGateway(ip, 18789, 30_000, employee.containerName || undefined);
      if (result.host !== ip) {
        await db.update(employees).set({ containerHost: result.host, updatedAt: new Date() }).where(eq(employees.id, employeeId));
      }
    } catch {
      console.log(`[start] Gateway not ready for ${employeeId} after restart, marking active anyway (container is running)`);
    }
  }

  await db
    .update(employees)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(employees.id, employeeId));
}

export async function teardownEmployee(employeeId: string): Promise<void> {
  const employee = await db.query.employees.findFirst({
    where: eq(employees.id, employeeId),
  });
  if (!employee) return;

  // Stop and remove container by ID
  if (employee.containerId) {
    try {
      const container = docker.getContainer(employee.containerId);
      await container.stop().catch(() => {});
      await container.remove({ force: true });
      console.log(`[teardown] Container ${employee.containerId.slice(0, 12)} removed`);
    } catch {
      // Container may already be removed
    }
  }

  // Also try by container name (fallback if containerId failed)
  if (employee.containerName) {
    try {
      const container = docker.getContainer(employee.containerName);
      await container.stop().catch(() => {});
      await container.remove({ force: true });
      console.log(`[teardown] Container ${employee.containerName} removed by name`);
    } catch {
      // Already removed above or doesn't exist
    }
  }

  // Remove volume
  try {
    const volume = docker.getVolume(`ai-emp-data-${employeeId}`);
    await volume.remove();
  } catch {
    // Volume may not exist
  }

  // Remove config directory
  try {
    execSync(`rm -rf /opt/ai-employees/openclaw-configs/${employeeId}`, { timeout: 5000 });
  } catch {
    // Config dir may not exist
  }

  // Archive Slack channel (fire-and-forget)
  archiveSlackChannel(employeeId);

  console.log(`[teardown] Employee ${employee.name} (${employeeId}) fully terminated`);
}

/** On startup, find and remove containers for terminated employees */
export async function cleanupOrphanedContainers(): Promise<void> {
  // Get all containers with our label prefix
  const containers = await docker.listContainers({
    all: true,
    filters: { label: ["ai-employees.employee-id"] },
  });

  if (containers.length === 0) return;

  // Keep containers for employees that are active, provisioning, or paused
  const keepEmployees = await db.query.employees.findMany({
    where: not(inArray(employees.status, ["terminated"])),
    columns: { id: true, containerName: true },
  });
  const activeIds = new Set(keepEmployees.map((e) => e.id));
  const activeNames = new Set(keepEmployees.map((e) => e.containerName).filter(Boolean));

  let removed = 0;
  for (const info of containers) {
    const empId = info.Labels?.["ai-employees.employee-id"];
    const name = info.Names?.[0]?.replace(/^\//, "");

    // Keep if employee is active
    if (empId && activeIds.has(empId)) continue;
    if (name && activeNames.has(name)) continue;

    // Remove orphaned container
    try {
      const container = docker.getContainer(info.Id);
      await container.stop().catch(() => {});
      await container.remove({ force: true });
      removed++;
      console.log(`[cleanup] Removed orphaned container ${name || info.Id.slice(0, 12)}`);
    } catch {
      // Already gone
    }
  }

  if (removed > 0) {
    console.log(`[cleanup] Startup cleanup: removed ${removed} orphaned containers`);
  }
}

/** Poll the gateway until it responds or timeout is reached. Throws on timeout.
 *  Also checks Docker container health periodically to fail fast if the container is dead.
 *  Re-inspects the container IP every 30s and after restarts to handle IP changes.
 *  Monitors container restart count to detect crash loops and dumps logs periodically. */
async function waitForGateway(
  host: string,
  port: number,
  timeoutMs: number,
  containerName?: string,
): Promise<{ host: string }> {
  const start = Date.now();
  const interval = 2000;
  let attempts = 0;
  let lastError = "";
  let consecutiveFetchFails = 0;
  let currentHost = host;
  let lastLogDumpAt = 0;
  let proactiveRestartDone = false;

  /** Re-inspect the container to get the current network IP */
  function refreshContainerIp(): string | null {
    if (!containerName) return null;
    try {
      const network = process.env.OPENCLAW_NETWORK || OPENCLAW_NETWORK;
      const ipOutput = execSync(
        `docker inspect --format='{{.NetworkSettings.Networks.${network}.IPAddress}}' ${containerName}`,
        { timeout: 5000, stdio: "pipe" },
      ).toString().trim().replace(/^'|'$/g, "");
      return ipOutput || null;
    } catch {
      return null;
    }
  }

  /** Get the container's restart count to detect crash loops */
  function getRestartCount(): number {
    if (!containerName) return 0;
    try {
      const output = execSync(
        `docker inspect --format='{{.RestartCount}}' ${containerName}`,
        { timeout: 5000, stdio: "pipe" },
      ).toString().trim().replace(/^'|'$/g, "");
      return parseInt(output) || 0;
    } catch {
      return 0;
    }
  }

  /** Dump recent container logs for diagnostics and return them */
  function dumpContainerLogs(label: string, lines = 30): string {
    if (!containerName) return "";
    try {
      const logs = execSync(`docker logs --tail ${lines} ${containerName} 2>&1`, { timeout: 10_000, stdio: "pipe" })
        .toString().trim();
      if (logs) console.log(`[provision] ${label}:\n${logs}`);
      return logs;
    } catch { /* ignore log fetch errors */ return ""; }
  }

  /** Check if the gateway process is actually listening inside the container */
  function isGatewayListening(): boolean {
    if (!containerName) return false;
    try {
      // Check if any process is listening on the gateway port
      const output = execSync(
        `docker exec ${containerName} sh -c 'ss -tlnp 2>/dev/null | grep :${port} || netstat -tlnp 2>/dev/null | grep :${port} || true'`,
        { timeout: 5000, stdio: "pipe" },
      ).toString().trim();
      return output.length > 0;
    } catch {
      return false;
    }
  }

  while (Date.now() - start < timeoutMs) {
    attempts++;
    try {
      const res = await fetch(`http://${currentHost}:${port}/v1/models`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        console.log(`[provision] Gateway ready at ${currentHost}:${port} (${Date.now() - start}ms, ${attempts} attempts)`);
        return { host: currentHost };
      }
      lastError = `HTTP ${res.status}`;
      consecutiveFetchFails = 0;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const cause = err instanceof Error && (err as any).cause?.message ? ` (cause: ${(err as any).cause.message})` : "";
      lastError = `${errMsg}${cause}`;
      consecutiveFetchFails++;
    }

    // Every 30s (15 attempts), or after 10 consecutive fetch failures,
    // check if the container is actually running and refresh IP.
    if (containerName && (attempts % 15 === 0 || consecutiveFetchFails === 10)) {
      try {
        const statusOutput = execSync(
          `docker inspect --format='{{.State.Status}} {{.State.ExitCode}} {{.State.OOMKilled}} {{.State.StartedAt}}' ${containerName}`,
          { timeout: 5000, stdio: "pipe" },
        ).toString().trim();
        const parts = statusOutput.split(" ");
        const [status, exitCode, oomKilled] = parts;
        const startedAt = parts.slice(3).join(" ");
        const restartCount = getRestartCount();
        const listening = status === "running" ? isGatewayListening() : false;
        const elapsedSec = Math.round((Date.now() - start) / 1000);
        console.log(
          `[provision] Container ${containerName} state: status=${status} exitCode=${exitCode} oomKilled=${oomKilled} restartCount=${restartCount} ` +
          `listeningOn${port}=${listening} startedAt=${startedAt} ` +
          `(${elapsedSec}s elapsed, polling ${currentHost}:${port}, consecutiveFails=${consecutiveFetchFails}, last error: ${lastError})`,
        );

        // Dump container logs periodically (every 60s) for diagnostics
        const now = Date.now();
        if (now - lastLogDumpAt >= 60_000) {
          lastLogDumpAt = now;
          dumpContainerLogs(`Container logs at ${elapsedSec}s`);
        }

        // Detect crash loops: if restart count is high, the gateway is repeatedly crashing
        if (restartCount >= 3) {
          console.log(`[provision] WARNING: Container has restarted ${restartCount} times — gateway may be crash-looping`);
          dumpContainerLogs("Container logs (crash loop detected)", 50);
        }

        if (status === "running") {
          // Container is running but gateway not responding — refresh IP in case it changed
          const newIp = refreshContainerIp();
          if (newIp && newIp !== currentHost) {
            console.log(`[provision] Container IP changed: ${currentHost} → ${newIp}`);
            currentHost = newIp;
            consecutiveFetchFails = 0;
          }

          // If gateway has been refusing connections for 120s+ and hasn't been
          // proactively restarted yet, force a restart to clear stuck state
          if (!proactiveRestartDone && elapsedSec >= 120 && consecutiveFetchFails >= 20 && !listening) {
            console.log(`[provision] Gateway not listening after ${elapsedSec}s — proactively restarting container...`);
            dumpContainerLogs("Container logs before proactive restart", 50);
            try {
              execSync(`docker restart -t 15 ${containerName}`, { timeout: 30_000 });
              console.log(`[provision] Proactive restart complete, waiting 15s for gateway to initialize...`);
              await new Promise((r) => setTimeout(r, 15_000));
              consecutiveFetchFails = 0;
              proactiveRestartDone = true;
              const newIpAfterRestart = refreshContainerIp();
              if (newIpAfterRestart) {
                if (newIpAfterRestart !== currentHost) {
                  console.log(`[provision] Container IP after proactive restart: ${currentHost} → ${newIpAfterRestart}`);
                }
                currentHost = newIpAfterRestart;
              }
            } catch (restartErr) {
              const msg = restartErr instanceof Error ? restartErr.message : String(restartErr);
              console.log(`[provision] Proactive restart failed: ${msg.slice(0, 200)}`);
              proactiveRestartDone = true; // Don't retry
            }
          }
        } else if (status === "exited" || status === "dead") {
          // Container is dead — log diagnostics and try to restart
          console.log(`[provision] Container is ${status} (exit=${exitCode}, oom=${oomKilled}). Attempting restart...`);
          dumpContainerLogs("Container logs before restart", 50);

          try {
            execSync(`docker start ${containerName}`, { timeout: 30_000 });
            console.log(`[provision] Container restarted, waiting 10s for it to initialize...`);
            await new Promise((r) => setTimeout(r, 10_000));
            consecutiveFetchFails = 0;

            // Re-inspect to get the new IP after restart
            const newIp = refreshContainerIp();
            if (newIp) {
              if (newIp !== currentHost) {
                console.log(`[provision] Container IP after restart: ${currentHost} → ${newIp}`);
              }
              currentHost = newIp;
            }
          } catch (restartErr) {
            const msg = restartErr instanceof Error ? restartErr.message : String(restartErr);
            console.log(`[provision] Failed to restart container: ${msg.slice(0, 200)}`);
          }
        } else if (status === "restarting") {
          console.log(`[provision] Container is restarting (Docker restart policy), waiting for it to come back...`);
          await new Promise((r) => setTimeout(r, 5000));
          const newIp = refreshContainerIp();
          if (newIp) {
            if (newIp !== currentHost) {
              console.log(`[provision] Container IP after Docker restart: ${currentHost} → ${newIp}`);
            }
            currentHost = newIp;
            consecutiveFetchFails = 0;
          }
        }
      } catch {
        // docker inspect failed — container might be gone entirely
        console.log(`[provision] Could not inspect container ${containerName} (${Math.round((Date.now() - start) / 1000)}s elapsed)`);
      }
    } else if (attempts % 15 === 0) {
      console.log(`[provision] Still waiting for gateway at ${currentHost}:${port} (${Math.round((Date.now() - start) / 1000)}s elapsed, last error: ${lastError})`);
    }

    await new Promise((r) => setTimeout(r, interval));
  }

  // Final diagnostic dump on timeout — capture logs for error message
  let containerLogs = "";
  let finalDiag = "";
  if (containerName) {
    containerLogs = dumpContainerLogs("Container logs at timeout", 80);
    const restartCount = getRestartCount();
    const listening = isGatewayListening();
    // Get container state
    let containerState = "unknown";
    try {
      containerState = execSync(
        `docker inspect --format='status={{.State.Status}} exitCode={{.State.ExitCode}} oomKilled={{.State.OOMKilled}} restartCount={{.RestartCount}}' ${containerName}`,
        { timeout: 5000, stdio: "pipe" },
      ).toString().trim().replace(/^'|'$/g, "");
    } catch { /* ignore */ }
    finalDiag = `\n\n--- Container Diagnostics ---\n${containerState}\nlisteningOnPort${port}=${listening}\nrestartCount=${restartCount}\n\n--- Last ${Math.min(containerLogs.split("\n").length, 40)} lines of container logs ---\n${containerLogs.split("\n").slice(-40).join("\n")}`;
    console.log(`[provision] Final state: restartCount=${restartCount} listeningOn${port}=${listening}`);
  }

  throw new Error(`Gateway at ${currentHost}:${port} did not respond within ${timeoutMs}ms (${attempts} attempts, last error: ${lastError})${finalDiag}`);
}

/** Scale Node.js heap to the tier — leave room for Chromium + OS overhead */
function getNodeHeapForTier(tier: string): number {
  // Container memory: junior=2GB, senior/expert=4GB
  // Reserve ~40% for Chromium + OS, give ~60% to Node
  const heapByTier: Record<string, number> = {
    junior: 1024,  // 1GB heap in 2GB container (leaves ~1GB for Chromium)
    senior: 2048,  // 2GB heap in 4GB container (leaves ~2GB for Chromium)
    expert: 2048,  // 2GB heap in 4GB container
  };
  return heapByTier[tier] || 1024;
}

function parseMemory(mem: string): number {
  const match = mem.match(/^(\d+)([gmk]?)$/i);
  if (!match) return 1024 * 1024 * 1024; // 1GB default
  const [, num, unit] = match;
  const multipliers: Record<string, number> = {
    g: 1024 * 1024 * 1024,
    m: 1024 * 1024,
    k: 1024,
    "": 1,
  };
  return parseInt(num) * (multipliers[unit.toLowerCase()] || 1);
}

function parseCpus(cpus: string): number {
  return Math.floor(parseFloat(cpus) * 1e9);
}

/**
 * Install CLI tools into the container synchronously.
 * This MUST complete before the employee is marked "active" so that
 * all tools (Chromium, gh, himalaya, etc.) are available immediately.
 *
 * The container is restarted at the end so the gateway picks up Chromium.
 * The caller is responsible for re-fetching the container IP after this.
 */
function installCliTools(containerName: string): void {
  const steps: Array<{ name: string; cmd: string; timeout: number }> = [
    {
      name: "system packages + sudo",
      cmd: `docker exec -u root ${containerName} bash -c '
        apt-get update -qq &&
        apt-get install -y -qq --no-install-recommends \
          jq tmux ffmpeg python3-pip ca-certificates gnupg sudo &&
        echo "node ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers
      '`,
      timeout: 120_000,
    },
    {
      // Single robust step: try playwright first, fall back to apt
      name: "Chromium browser",
      cmd: `docker exec -u root ${containerName} bash -c '
        INSTALLED=0

        # Method 1: playwright-core (preferred — matches OpenClaw browser config)
        if command -v npx >/dev/null 2>&1; then
          echo "[chromium] Trying playwright-core install..."
          cd /app
          npx playwright-core install-deps chromium 2>&1 || echo "[chromium] install-deps had warnings"
          su -s /bin/bash node -c "cd /app && npx playwright-core install chromium 2>&1" || echo "[chromium] binary install had warnings"
          CHROME_BIN=$(find /home/node/.cache/ms-playwright -name chrome -path "*/chrome-linux64/*" 2>/dev/null | head -1)
          if [ -n "$CHROME_BIN" ] && [ -x "$CHROME_BIN" ]; then
            ln -sf "$CHROME_BIN" /usr/local/bin/chromium
            echo "[chromium] Installed via playwright: $CHROME_BIN"
            INSTALLED=1
          else
            echo "[chromium] playwright install did not produce a working binary"
          fi
        else
          echo "[chromium] npx not found, skipping playwright method"
        fi

        # Method 2: apt fallback
        if [ "$INSTALLED" = "0" ]; then
          echo "[chromium] Trying apt install fallback..."
          apt-get install -y -qq chromium 2>&1 || apt-get install -y -qq chromium-browser 2>&1 || true
          for bin in /usr/bin/chromium /usr/bin/chromium-browser; do
            if [ -x "$bin" ]; then
              ln -sf "$bin" /usr/local/bin/chromium
              echo "[chromium] Installed via apt: $bin"
              INSTALLED=1
              break
            fi
          done
        fi

        # Verify
        if [ -x /usr/local/bin/chromium ]; then
          echo "[chromium] Ready at /usr/local/bin/chromium"
        else
          echo "[chromium] ERROR: All installation methods failed"
          exit 1
        fi
      '`,
      timeout: 180_000,
    },
    {
      name: "GitHub CLI (gh)",
      cmd: `docker exec -u root ${containerName} bash -c '
        curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg 2>/dev/null &&
        echo "deb [arch=\$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list &&
        apt-get update -qq &&
        apt-get install -y -qq gh
      '`,
      timeout: 60_000,
    },
    {
      name: "himalaya email CLI",
      cmd: `docker exec -u root ${containerName} bash -c '
        curl -fsSL https://raw.githubusercontent.com/pimalaya/himalaya/master/install.sh | sh 2>/dev/null &&
        mv /root/.local/bin/himalaya /usr/local/bin/himalaya 2>/dev/null || true
      '`,
      timeout: 60_000,
    },
    {
      name: "credential manager (cred)",
      cmd: `docker exec -u root ${containerName} bash -c '
        cat > /usr/local/bin/cred << "CREDEOF"
#!/bin/bash
exec node /home/node/.openclaw/cred.js "$@"
CREDEOF
        chmod +x /usr/local/bin/cred
      '`,
      timeout: 10_000,
    },
    {
      name: "2captcha CLI (solve-captcha)",
      cmd: `docker exec -u root ${containerName} bash -c '
        curl -fsSL https://github.com/2captcha/cli/releases/latest/download/solve-captcha-linux-amd64 -o /usr/local/bin/solve-captcha 2>/dev/null &&
        chmod +x /usr/local/bin/solve-captcha || true
      '`,
      timeout: 30_000,
    },
    {
      name: "oathtool (TOTP 2FA)",
      cmd: `docker exec -u root ${containerName} bash -c '
        apt-get install -y -qq oathtool 2>/dev/null || true
      '`,
      timeout: 30_000,
    },
    {
      name: "media generation CLI wrappers",
      cmd: `docker exec -u root ${containerName} bash -c '
        cp /home/node/.openclaw/generate-image.sh /usr/local/bin/generate-image 2>/dev/null &&
        cp /home/node/.openclaw/generate-video.sh /usr/local/bin/generate-video 2>/dev/null &&
        chmod +x /usr/local/bin/generate-image /usr/local/bin/generate-video
      '`,
      timeout: 10_000,
    },
    {
      name: "Python deps for media generation",
      cmd: `docker exec ${containerName} bash -c '
        pip3 install -q --break-system-packages google-genai Pillow 2>/dev/null || true
      '`,
      timeout: 60_000,
    },
    {
      name: "DOCX skill deps (pandoc, LibreOffice, poppler, docx npm)",
      cmd: `docker exec -u root ${containerName} bash -c '
        ${generateDocxInstallScript()}
      ' && docker exec ${containerName} bash -c '
        npm install -g docx 2>/dev/null || true
      '`,
      timeout: 180_000,
    },
    {
      name: "gogcli (Google Workspace CLI)",
      cmd: `docker exec -u root ${containerName} bash -c '
        GOG_VERSION=$(curl -fsSL https://api.github.com/repos/steipete/gogcli/releases/latest 2>/dev/null | grep -o "\"tag_name\":\"[^\"]*\"" | head -1 | cut -d"\"" -f4 | sed "s/^v//") &&
        if [ -n "$GOG_VERSION" ]; then
          curl -fsSL "https://github.com/steipete/gogcli/releases/download/v$GOG_VERSION/gogcli_\${GOG_VERSION}_linux_amd64.tar.gz" -o /tmp/gogcli.tar.gz &&
          tar xzf /tmp/gogcli.tar.gz -C /usr/local/bin &&
          rm -f /tmp/gogcli.tar.gz &&
          chmod +x /usr/local/bin/gog
        fi
      '`,
      timeout: 60_000,
    },
    {
      name: "send-email CLI wrapper",
      cmd: `docker exec -u root ${containerName} bash -c '
        cat > /usr/local/bin/send-email << "SENDEMAILEOF"
#!/bin/bash
exec node /home/node/.openclaw/send-email.js "$@"
SENDEMAILEOF
        chmod +x /usr/local/bin/send-email
      '`,
      timeout: 10_000,
    },
  ];

  for (const step of steps) {
    try {
      const output = execSync(step.cmd, { timeout: step.timeout, stdio: "pipe" });
      const out = output.toString().trim();
      if (out) console.log(`[cli-tools] ${out.split("\n").pop()}`);
      console.log(`[cli-tools] ✓ ${step.name}`);
    } catch (err: unknown) {
      // Log stderr so we can diagnose failures — but don't abort provisioning
      const execErr = err as { stderr?: Buffer; message?: string };
      const stderr = execErr.stderr?.toString().trim().slice(0, 300) || "";
      const msg = execErr.message?.slice(0, 200) || String(err).slice(0, 200);
      console.log(`[cli-tools] ✗ ${step.name} failed: ${msg}`);
      if (stderr) console.log(`[cli-tools]   stderr: ${stderr}`);
    }
  }

  // Restart container so the gateway picks up Chromium and other new binaries.
  // Use a longer timeout (60s) — heavy containers with Chromium + LibreOffice
  // can take 30+ seconds to stop and restart. Retry once on failure.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`[cli-tools] Restarting container to pick up installed tools (attempt ${attempt})...`);
      execSync(`docker restart ${containerName}`, { timeout: 60_000 });
      console.log(`[cli-tools] Container restarted successfully`);
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[cli-tools] Container restart attempt ${attempt} failed: ${msg.slice(0, 200)}`);
      if (attempt === 1) {
        // Before retrying, try a stop + start sequence which can be more reliable
        try {
          console.log(`[cli-tools] Trying stop + start fallback...`);
          execSync(`docker stop -t 30 ${containerName}`, { timeout: 40_000, stdio: "pipe" });
          execSync(`docker start ${containerName}`, { timeout: 30_000, stdio: "pipe" });
          console.log(`[cli-tools] Container started via stop+start fallback`);
          break;
        } catch (fallbackErr) {
          const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
          console.log(`[cli-tools] Stop+start fallback also failed: ${fbMsg.slice(0, 200)}`);
        }
      }
    }
  }
}

/**
 * Create a Slack channel for an employee by calling the API's Slack proxy.
 * Runs in background — doesn't block provisioning.
 */
function createSlackChannel(employeeId: string): void {
  const apiPort = process.env.API_PORT || "3001";
  const url = `http://127.0.0.1:${apiPort}/slack-proxy/create-channel`;

  // Fire-and-forget with retry
  const attempt = (retries: number, delay: number) => {
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId }),
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json() as { ok: boolean; channelId?: string; error?: string };
          if (data.ok) {
            console.log(`[provision] Slack channel created for employee ${employeeId}: ${data.channelId}`);
          } else {
            console.log(`[provision] Slack channel creation skipped: ${data.error}`);
          }
        } else if (retries > 0) {
          console.log(`[provision] Slack channel API returned ${res.status}, retrying in ${delay}ms...`);
          setTimeout(() => attempt(retries - 1, delay * 2), delay);
        } else {
          console.log(`[provision] Slack channel creation failed after retries`);
        }
      })
      .catch((err: Error) => {
        if (retries > 0) {
          console.log(`[provision] Slack proxy unreachable (${err.message}), retrying in ${delay}ms...`);
          setTimeout(() => attempt(retries - 1, delay * 2), delay);
        } else {
          console.log(`[provision] Slack channel creation failed: ${err.message}`);
        }
      });
  };

  // Start first attempt after 5s (give the API's Slack proxy time to start)
  setTimeout(() => attempt(3, 5000), 5000);
}

/** Archive a Slack channel when an employee is terminated (fire-and-forget) */
function archiveSlackChannel(employeeId: string): void {
  const apiPort = process.env.API_PORT || "3001";
  const url = `http://127.0.0.1:${apiPort}/slack-proxy/archive-channel`;

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeId }),
  })
    .then(() => console.log(`[teardown] Slack channel archive requested for ${employeeId}`))
    .catch((err: Error) => console.log(`[teardown] Slack channel archive failed: ${err.message}`));
}

/**
 * Build Traefik labels to expose an employee's OpenClaw gateway externally.
 * This enables users to connect the OpenClaw browser extension by running
 * a local node host pointed at https://{API_DOMAIN}/gw/{employeeId}/
 *
 * The gateway itself handles auth via OPENCLAW_GATEWAY_TOKEN.
 */
function buildTraefikLabels(employeeId: string, apiDomain: string): Record<string, string> {
  // Traefik router/service names must be alphanumeric + hyphens
  const routerId = `gw-${employeeId.replace(/[^a-z0-9-]/g, "")}`;
  return {
    "traefik.enable": "true",
    [`traefik.http.routers.${routerId}.rule`]: `Host(\`${apiDomain}\`) && PathPrefix(\`/gw/${employeeId}\`)`,
    [`traefik.http.routers.${routerId}.entrypoints`]: "websecure",
    [`traefik.http.routers.${routerId}.tls.certresolver`]: "letsencrypt",
    [`traefik.http.middlewares.${routerId}-strip.stripprefix.prefixes`]: `/gw/${employeeId}`,
    [`traefik.http.routers.${routerId}.middlewares`]: `${routerId}-strip`,
    [`traefik.http.services.${routerId}.loadbalancer.server.port`]: "18789",
  };
}

/** Webmail URLs by provider for browser-based email access */
const PROVIDER_WEBMAIL: Record<string, string> = {
  gmail: "https://mail.google.com",
  outlook: "https://outlook.live.com",
  yahoo: "https://mail.yahoo.com",
  zoho: "https://mail.zoho.com",
  icloud: "https://www.icloud.com/mail",
};

/** Build email env vars from provisionedAccounts.email if configured */
function buildEmailEnvVars(accounts: Record<string, unknown> | null): string[] {
  if (!accounts?.email) return [];
  const email = accounts.email as Record<string, unknown>;
  if (!email.address || !email.smtpHost || !email.username || !email.password) return [];

  const provider = (email.provider as string) || "custom";
  const webmail = PROVIDER_WEBMAIL[provider] || "";

  return [
    `EMAIL_PROVIDER=${provider}`,
    `EMAIL_ADDRESS=${email.address}`,
    `EMAIL_SMTP_HOST=${email.smtpHost}`,
    `EMAIL_SMTP_PORT=${email.smtpPort || 587}`,
    `EMAIL_IMAP_HOST=${email.imapHost || email.smtpHost}`,
    `EMAIL_IMAP_PORT=${email.imapPort || 993}`,
    `EMAIL_USERNAME=${email.username}`,
    `EMAIL_PASSWORD=${email.password}`,
    ...(webmail ? [`EMAIL_WEBMAIL=${webmail}`] : []),
  ];
}
