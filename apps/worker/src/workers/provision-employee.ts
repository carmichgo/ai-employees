import { eq } from "drizzle-orm";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { db, employees, companies } from "@ai-employees/db";
import { CONTAINER_RESOURCES, type PlanTier } from "@ai-employees/shared";
import {
  generateOpenClawConfig,
  generateSoulMd,
  generateEmployeeEmail,
  type EmployeeInput,
} from "@ai-employees/openclaw-config";
import { docker, ensureNetwork, ensureImage } from "../docker/client.js";

const OPENCLAW_IMAGE = process.env.OPENCLAW_IMAGE || "ghcr.io/openclaw/openclaw:latest";
const OPENCLAW_NETWORK = process.env.OPENCLAW_NETWORK || "ai-employees-internal";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const BRAVE_API_KEY = process.env.BRAVE_API_KEY || "";

export interface ProvisionJobData {
  employeeId: string;
  companyId: string;
  channels: string[];
  channelCredentials?: Record<string, Record<string, unknown>>;
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

    // Write OpenClaw config + soul.md to a host directory that gets bind-mounted
    const configDir = `/opt/ai-employees/openclaw-configs/${employeeId}`;
    mkdirSync(`${configDir}/workspace`, { recursive: true });
    mkdirSync(`${configDir}/workspace/uploads`, { recursive: true });
    writeFileSync(`${configDir}/openclaw.json`, JSON.stringify(config, null, 2));
    writeFileSync(`${configDir}/SOUL.md`, soulMd);
    writeFileSync(`${configDir}/workspace/SOUL.md`, soulMd);

    // Write init script that installs CLI tools before starting OpenClaw
    writeFileSync(`${configDir}/init.sh`, generateInitScript());

    // Fix permissions for the node user (uid 1000) inside the container
    execSync(`chown -R 1000:1000 ${configDir}`);
    execSync(`chmod +x ${configDir}/init.sh`);

    // Create the container — init script installs tools then starts OpenClaw
    const container = await docker.createContainer({
      Image: OPENCLAW_IMAGE,
      name: employee.containerName!,
      Cmd: ["sh", "-c", "bash /home/node/.openclaw/init.sh"],
      User: "0", // Run as root so init script can install packages, then drops to node
      Env: [
        `HOME=/home/node`,
        `NODE_OPTIONS=--max-old-space-size=1536`,
        `DISPLAY=:99`, // Virtual display for real (non-headless) browser via Xvfb
        `OPENCLAW_GATEWAY_TOKEN=${employee.gatewayToken}`,
        `ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}`,
        ...(BRAVE_API_KEY ? [`BRAVE_API_KEY=${BRAVE_API_KEY}`] : []),
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

  if (employee.containerId) {
    try {
      const container = docker.getContainer(employee.containerId);
      await container.stop().catch(() => {}); // May already be stopped
      await container.remove({ force: true });
    } catch {
      // Container may already be removed
    }
  }

  // Remove volume
  try {
    const volume = docker.getVolume(`ai-emp-data-${employeeId}`);
    await volume.remove();
  } catch {
    // Volume may not exist
  }

  console.log(`[teardown] Employee ${employee.name} (${employeeId}) fully terminated`);
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

/** Generate container init script that installs CLI tools and starts OpenClaw */
function generateInitScript(): string {
  return `#!/bin/bash
set -e

echo "[init] Installing tools..."

# Install system packages (Xvfb for real browser, git, etc.)
apt-get update -qq 2>/dev/null && apt-get install -y -qq xvfb git curl wget jq python3 python3-pip 2>/dev/null || true

# Start Xvfb virtual display for non-headless browser
Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp &
export DISPLAY=:99

# Install himalaya (email CLI for IMAP/SMTP)
if ! command -v himalaya &>/dev/null; then
  echo "[init] Installing himalaya..."
  curl -sSL https://github.com/pimalaya/himalaya/releases/latest/download/himalaya-x86_64-linux-gnu.tar.gz | tar xz -C /usr/local/bin/ 2>/dev/null || true
fi

# Install GitHub CLI (gh)
if ! command -v gh &>/dev/null; then
  echo "[init] Installing GitHub CLI..."
  curl -sSL https://github.com/cli/cli/releases/latest/download/gh_2.67.0_linux_amd64.tar.gz | tar xz -C /tmp/ 2>/dev/null && cp /tmp/gh_*/bin/gh /usr/local/bin/ 2>/dev/null || true
fi

# Install Python packages for image/data processing
pip install --quiet Pillow matplotlib 2>/dev/null || true

# Ensure workspace uploads directory exists
mkdir -p /home/node/.openclaw/workspace/uploads
chown -R 1000:1000 /home/node/.openclaw/workspace

echo "[init] Tools installed, starting OpenClaw..."

# Drop privileges and start OpenClaw as node user
exec su -s /bin/sh node -c 'cd /home/node && exec node openclaw.mjs gateway --bind lan --allow-unconfigured'
`;
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
