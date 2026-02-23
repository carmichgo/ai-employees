import { eq, not, inArray } from "drizzle-orm";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { db, employees, companies, users } from "@ai-employees/db";
import { getResourcesForTier, type EmployeeTier } from "@ai-employees/shared";
import {
  generateOpenClawConfig,
  generateSoulMd,
  generateEmployeeEmail,
  generateCredentialManagerScript,
  generateCaptchaSolvingSkill,
  generateAccountCreationSkill,
  generateTaskLoggingSkill,
  generateMediaGenerationSkill,
  generateRestartGatewaySkill,
  generateTeamCommunicationSkill,
  generateTaskManagementSkill,
  generateImageScript,
  generateVideoScript,
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

    // Generate employee email
    const emailAddress = generateEmployeeEmail(employee.name, company.slug);

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

    const soulMd = generateSoulMd(employeeInput);
    const config = generateOpenClawConfig(employeeInput, employee.gatewayToken!, soulMd);

    const resources = getResourcesForTier(tier);

    // Write OpenClaw config + soul.md + skills to a host directory that gets bind-mounted
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
    writeFileSync(`${configDir}/openclaw.json`, JSON.stringify(config, null, 2));
    writeFileSync(`${configDir}/SOUL.md`, soulMd);
    writeFileSync(`${configDir}/workspace/SOUL.md`, soulMd);
    // OpenClaw creates workspace-main at runtime — write there too if it exists
    if (existsSync(`${configDir}/workspace-main`)) {
      writeFileSync(`${configDir}/workspace-main/SOUL.md`, soulMd);
    }

    // Write credential manager CLI script
    writeFileSync(`${configDir}/cred.js`, generateCredentialManagerScript(), { mode: 0o755 });

    // Write skill files
    writeFileSync(`${configDir}/skills/captcha-solving/SKILL.md`, generateCaptchaSolvingSkill());
    writeFileSync(`${configDir}/skills/account-creation/SKILL.md`, generateAccountCreationSkill());
    writeFileSync(`${configDir}/skills/task-logging/SKILL.md`, generateTaskLoggingSkill());
    writeFileSync(`${configDir}/skills/media-generation/SKILL.md`, generateMediaGenerationSkill());
    writeFileSync(`${configDir}/skills/restart-gateway/SKILL.md`, generateRestartGatewaySkill());
    writeFileSync(`${configDir}/skills/team-communication/SKILL.md`, generateTeamCommunicationSkill());
    writeFileSync(`${configDir}/skills/task-management/SKILL.md`, generateTaskManagementSkill());

    // Write CLI wrapper scripts for image/video generation (installed into container below)
    writeFileSync(`${configDir}/generate-image.sh`, generateImageScript(), { mode: 0o755 });
    writeFileSync(`${configDir}/generate-video.sh`, generateVideoScript(), { mode: 0o755 });

    // Fix permissions for the node user (uid 1000) inside the container
    execSync(`chown -R 1000:1000 ${configDir}`);

    // Create the container — OpenClaw starts directly with all built-in tools enabled
    const container = await docker.createContainer({
      Image: OPENCLAW_IMAGE,
      name: employee.containerName!,
      Cmd: ["node", "openclaw.mjs", "gateway", "--bind", "lan", "--allow-unconfigured"],
      Env: [
        `HOME=/home/node`,
        `NODE_OPTIONS=--max-old-space-size=1536`,
        `OPENCLAW_GATEWAY_TOKEN=${employee.gatewayToken}`,
        `ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}`,
        ...(GEMINI_API_KEY ? [`GEMINI_API_KEY=${GEMINI_API_KEY}`] : []),
        ...(BRAVE_API_KEY ? [`BRAVE_API_KEY=${BRAVE_API_KEY}`] : []),
        ...(TWILIO_ACCOUNT_SID ? [`TWILIO_ACCOUNT_SID=${TWILIO_ACCOUNT_SID}`] : []),
        ...(TWILIO_AUTH_TOKEN ? [`TWILIO_AUTH_TOKEN=${TWILIO_AUTH_TOKEN}`] : []),
        `ENCRYPTION_KEY=${deriveEmployeeEncryptionKey(employeeId)}`,
        `EMPLOYEE_ID=${employeeId}`,
        `EMPLOYEE_EMAIL=${emailAddress}`,
        `EMPLOYEE_NAME=${employee.name}`,
        `EMPLOYEE_JOB_TITLE=${employee.jobTitle}`,
        `COMPANY_ID=${data.companyId}`,
        // Internal API URL — used by task-management, restart-gateway, team-communication skills
        `BLITZ_API_URL=http://host.docker.internal:${process.env.API_PORT || "3001"}`,
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
        RestartPolicy: { Name: "unless-stopped" },
      },
      Labels: {
        "ai-employees.employee-id": employeeId,
        "ai-employees.company-id": data.companyId,
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

    // Update DB with container details + email (still provisioning until gateway ready)
    await db
      .update(employees)
      .set({
        containerId: info.Id,
        containerHost: containerIp,
        containerPort: 18789,
        emailAddress,
        updatedAt: new Date(),
      })
      .where(eq(employees.id, employeeId));

    // Install CLI tools synchronously BEFORE marking active.
    // This installs Chromium, GitHub CLI, himalaya, credential manager, etc.
    // The container is restarted at the end to pick up Chromium, so we need
    // to re-fetch the IP and wait for the gateway after this step.
    console.log(`[provision] Installing CLI tools for ${employee.name}...`);
    installCliTools(employee.containerName!);

    // After installCliTools restarts the container, get the new IP address
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
      }
    } catch {
      console.log(`[provision] Could not refresh container IP after CLI install (non-critical)`);
    }

    // Wait for the OpenClaw gateway to be ready before marking active
    if (containerIp) {
      await waitForGateway(containerIp, 18789, 120_000);
    }

    await db
      .update(employees)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(employees.id, employeeId));

    console.log(
      `[provision] Employee ${employee.name} (${employeeId}) is now active at ${containerIp}:18789 — email: ${emailAddress}`,
    );

    // Create Slack channel for the employee if Slack is in their channels
    if (data.channels.includes("slack")) {
      createSlackChannel(employeeId);
    }
  } catch (error) {
    console.error(`[provision] Failed to provision employee ${employeeId}:`, error);

    await db
      .update(employees)
      .set({
        status: "error",
        errorMessage: error instanceof Error ? error.message : String(error),
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
      await waitForGateway(ip, 18789, 30_000);
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

/** Poll the gateway until it responds or timeout is reached. Throws on timeout. */
async function waitForGateway(host: string, port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  const interval = 2000;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://${host}:${port}/v1/models`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        console.log(`[provision] Gateway ready at ${host}:${port} (${Date.now() - start}ms)`);
        return;
      }
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`Gateway at ${host}:${port} did not respond within ${timeoutMs}ms`);
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

  // Restart container so the gateway picks up Chromium and other new binaries
  try {
    console.log(`[cli-tools] Restarting container to pick up installed tools...`);
    execSync(`docker restart ${containerName}`, { timeout: 30_000 });
    console.log(`[cli-tools] Container restarted successfully`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[cli-tools] Container restart failed: ${msg.slice(0, 200)}`);
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
