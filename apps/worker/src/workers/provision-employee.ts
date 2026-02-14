import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { execSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { db, employees, companies } from "@ai-employees/db";
import { CONTAINER_RESOURCES, type PlanTier } from "@ai-employees/shared";
import {
  generateOpenClawConfig,
  generateSoulMd,
  generateEmployeeEmail,
  generateCredentialManagerScript,
  generateCaptchaSolvingSkill,
  generateAccountCreationSkill,
  type EmployeeInput,
} from "@ai-employees/openclaw-config";
import { docker, ensureNetwork, ensureImage } from "../docker/client.js";

const OPENCLAW_IMAGE = process.env.OPENCLAW_IMAGE || "ghcr.io/openclaw/openclaw:latest";
const OPENCLAW_NETWORK = process.env.OPENCLAW_NETWORK || "ai-employees-internal";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const BRAVE_API_KEY = process.env.BRAVE_API_KEY || "";
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

    // Generate OpenClaw config
    const employeeInput: EmployeeInput = {
      id: employee.id,
      name: employee.name,
      jobTitle: employee.jobTitle,
      emoji: employee.emoji || undefined,
      persona: employee.persona,
      goals: employee.goals,
      personalityConfig: employee.personalityConfig as { autonomy?: string; proactivity?: string; communication?: string } | null,
      companySlug: company.slug,
      companyName: company.name,
      modelConfig: employee.modelConfig as { primary: string; fallbacks?: string[] },
      toolsConfig: employee.toolsConfig as Record<string, unknown>,
      sandboxConfig: employee.sandboxConfig as Record<string, unknown>,
      channels: channelInputs,
    };

    const config = generateOpenClawConfig(employeeInput, employee.gatewayToken!);
    const soulMd = generateSoulMd(employeeInput);

    // Determine resource limits based on company plan
    const plan = (company.plan as PlanTier) || "starter";
    const resources = CONTAINER_RESOURCES[plan] || CONTAINER_RESOURCES.starter;

    // Write OpenClaw config + soul.md + skills to a host directory that gets bind-mounted
    const configDir = `/opt/ai-employees/openclaw-configs/${employeeId}`;
    mkdirSync(`${configDir}/workspace`, { recursive: true });
    mkdirSync(`${configDir}/workspace/uploads`, { recursive: true });
    mkdirSync(`${configDir}/credentials`, { recursive: true, mode: 0o700 });
    mkdirSync(`${configDir}/skills/captcha-solving`, { recursive: true });
    mkdirSync(`${configDir}/skills/account-creation`, { recursive: true });
    writeFileSync(`${configDir}/openclaw.json`, JSON.stringify(config, null, 2));
    writeFileSync(`${configDir}/SOUL.md`, soulMd);
    writeFileSync(`${configDir}/workspace/SOUL.md`, soulMd);

    // Write credential manager CLI script
    writeFileSync(`${configDir}/cred.js`, generateCredentialManagerScript(), { mode: 0o755 });

    // Write skill files
    writeFileSync(`${configDir}/skills/captcha-solving/SKILL.md`, generateCaptchaSolvingSkill());
    writeFileSync(`${configDir}/skills/account-creation/SKILL.md`, generateAccountCreationSkill());

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
        ...(BRAVE_API_KEY ? [`BRAVE_API_KEY=${BRAVE_API_KEY}`] : []),
        `ENCRYPTION_KEY=${deriveEmployeeEncryptionKey(employeeId)}`,
        `EMPLOYEE_EMAIL=${emailAddress}`,
        `EMPLOYEE_NAME=${employee.name}`,
        `EMPLOYEE_JOB_TITLE=${employee.jobTitle}`,
        // Email IMAP/SMTP credentials (if configured by company owner)
        ...buildEmailEnvVars(employee.provisionedAccounts as Record<string, unknown>),
      ],
      HostConfig: {
        Binds: [
          `${configDir}:/home/node/.openclaw`,
          `${configDir}/workspace:/home/node/.openclaw/workspace`,
        ],
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

    // Update DB with container details + email
    await db
      .update(employees)
      .set({
        containerId: info.Id,
        containerHost: info.NetworkSettings.Networks?.[OPENCLAW_NETWORK]?.IPAddress || null,
        containerPort: 18789,
        emailAddress,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(employees.id, employeeId));

    console.log(
      `[provision] Employee ${employee.name} (${employeeId}) is now active at ${info.NetworkSettings.Networks?.[OPENCLAW_NETWORK]?.IPAddress}:18789 — email: ${emailAddress}`,
    );

    // Create Slack channel for the employee if Slack is in their channels
    if (data.channels.includes("slack")) {
      createSlackChannel(employeeId);
    }

    // Install CLI tools in background (doesn't block provisioning)
    installCliTools(employee.containerName!, employeeId);
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

  // Get active employee IDs from DB
  const activeEmployees = await db.query.employees.findMany({
    where: eq(employees.status, "active"),
    columns: { id: true, containerName: true },
  });
  const activeIds = new Set(activeEmployees.map((e) => e.id));
  const activeNames = new Set(activeEmployees.map((e) => e.containerName).filter(Boolean));

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
 * Install CLI tools into the container in the background.
 * Skills like github, himalaya, nano-pdf etc. are bundled as SKILL.md files
 * but need their CLI binaries to actually work.
 */
function installCliTools(containerName: string, employeeId: string): void {
  const script = `
    set -e

    # Install system packages + sudo access (as root)
    docker exec -u root ${containerName} bash -c '
      apt-get update -qq &&
      apt-get install -y -qq --no-install-recommends \
        jq tmux ffmpeg python3-pip ca-certificates gnupg sudo \
        2>/dev/null &&
      echo "node ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers &&
      echo "Sudo access granted to node user"
    '

    # Install Chromium browser dependencies (for OpenClaw browser tool)
    # Uses playwright-core's install-deps to get the right system libraries
    docker exec -u root ${containerName} bash -c '
      cd /app && npx playwright-core install-deps chromium 2>/dev/null
    '

    # Install Chromium browser binary via playwright-core (as node user)
    docker exec ${containerName} bash -c '
      cd /app && npx playwright-core install chromium 2>/dev/null
    '

    # Create symlink so OpenClaw auto-detects the browser
    docker exec -u root ${containerName} bash -c '
      CHROME_BIN=$(find /home/node/.cache/ms-playwright -name chrome -path "*/chrome-linux64/*" 2>/dev/null | head -1) &&
      if [ -n "$CHROME_BIN" ]; then
        ln -sf "$CHROME_BIN" /usr/local/bin/chromium &&
        echo "Chromium linked: $CHROME_BIN -> /usr/local/bin/chromium"
      fi
    '

    # Install GitHub CLI (gh)
    docker exec -u root ${containerName} bash -c '
      curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg &&
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list &&
      apt-get update -qq &&
      apt-get install -y -qq gh
    '

    # Install himalaya email CLI
    docker exec -u root ${containerName} bash -c '
      curl -fsSL https://raw.githubusercontent.com/pimalaya/himalaya/master/install.sh | sh 2>/dev/null &&
      mv /root/.local/bin/himalaya /usr/local/bin/himalaya 2>/dev/null || true
    '

    # Install credential manager CLI (cred) — symlink the script as a global command
    docker exec -u root ${containerName} bash -c '
      cat > /usr/local/bin/cred << "CREDEOF"
#!/bin/bash
exec node /home/node/.openclaw/cred.js "$@"
CREDEOF
      chmod +x /usr/local/bin/cred &&
      echo "Credential manager (cred) installed"
    '

    # Install 2captcha CLI solver
    docker exec -u root ${containerName} bash -c '
      curl -fsSL https://github.com/2captcha/cli/releases/latest/download/solve-captcha-linux-amd64 -o /usr/local/bin/solve-captcha 2>/dev/null &&
      chmod +x /usr/local/bin/solve-captcha &&
      echo "2captcha CLI (solve-captcha) installed" ||
      echo "2captcha CLI install skipped (non-critical)"
    '

    # Install oathtool for TOTP 2FA code generation
    docker exec -u root ${containerName} bash -c '
      apt-get install -y -qq oathtool 2>/dev/null &&
      echo "oathtool installed" || true
    '

    # Restart container so gateway picks up newly installed Chromium browser
    echo "[cli-tools] Restarting container to pick up Chromium..."
    docker restart ${containerName}

    echo "[cli-tools] Installation complete for ${containerName}"
  `;

  const child = spawn("bash", ["-c", script], {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (d: Buffer) => console.log(`[cli-tools] ${d.toString().trim()}`));
  child.stderr?.on("data", (d: Buffer) => console.log(`[cli-tools:err] ${d.toString().trim()}`));
  child.on("close", async (code) => {
    console.log(`[cli-tools] Finished for ${containerName} (exit ${code})`);

    // After docker restart, the container gets a new IP address.
    // Update the DB so the chat proxy uses the correct IP.
    if (code === 0) {
      try {
        const container = docker.getContainer(containerName);
        const info = await container.inspect();
        const newIp = info.NetworkSettings.Networks?.[OPENCLAW_NETWORK]?.IPAddress || null;
        if (newIp) {
          await db
            .update(employees)
            .set({ containerHost: newIp, updatedAt: new Date() })
            .where(eq(employees.id, employeeId));
          console.log(`[cli-tools] Updated container IP for ${containerName}: ${newIp}`);
        }
      } catch (err) {
        console.error(`[cli-tools] Failed to update container IP after restart:`, err);
      }
    }
  });
  child.unref();
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
