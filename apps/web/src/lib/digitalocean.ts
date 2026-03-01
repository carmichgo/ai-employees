/**
 * DigitalOcean API client — provisions per-company droplets.
 *
 * Each company gets its own droplet running:
 *   Redis + Fastify API + BullMQ Worker + Traefik + OpenClaw containers
 *
 * Requires DO_API_TOKEN env var (DigitalOcean personal access token).
 */

import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, employees } from "@/lib/schema";

const DO_API_TOKEN = process.env.DO_API_TOKEN?.trim();
const DO_API = "https://api.digitalocean.com/v2";

// The GitHub repo URL for cloning on the droplet
const REPO_URL = process.env.REPO_URL || "https://github.com/carmichgo/ai-employees.git";
const REPO_BRANCH = (process.env.REPO_BRANCH || "main").trim();

export function isDropletProvisioningEnabled(): boolean {
  return !!DO_API_TOKEN && DO_API_TOKEN.length > 10;
}

async function doFetch(path: string, options: RequestInit = {}): Promise<Response> {
  if (!DO_API_TOKEN) {
    throw new Error("DO_API_TOKEN not configured");
  }

  // Use AbortController for timeout to avoid hanging on slow DO API responses
  // (Vercel serverless functions have a 10s default timeout)
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000); // 25s timeout

  try {
    const res = await fetch(`${DO_API}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DO_API_TOKEN}`,
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(body.message || `DO API error: ${res.status}`);
    }

    return res;
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(`DigitalOcean API timeout on ${path}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/** Generate the cloud-init user_data script for a company's droplet */
function generateCloudInit(params: {
  companySlug: string;
  databaseUrl: string;
  interserviceSecret: string;
  platformUrl: string;
  repoUrl: string;
  repoBranch: string;
  anthropicApiKey: string;
  geminiApiKey: string;
  braveApiKey: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  slackAppToken: string;
  slackSigningSecret: string;
  employeeId?: string;
  companyId?: string;
}): string {
  // Generate secrets in JS so they're embedded as actual values
  const jwtSecret = crypto.randomBytes(32).toString("hex");
  const encryptionKey = crypto.randomBytes(32).toString("hex");

  // Escape any special chars in the database URL for shell
  const dbUrl = params.databaseUrl.replace(/'/g, "'\\''");

  return `#!/bin/bash

# === AI Employees — Auto-provisioned Droplet for ${params.companySlug} ===

exec > /var/log/ai-employees-init.log 2>&1
echo "Starting cloud-init at $(date)"

# Progress reporting function
report() {
  local step="\$1" status="\$2" error="\${3:-}"
  echo "[$(date)] STEP=\$step STATUS=\$status ERROR=\$error"
  curl -sf -X POST "${params.platformUrl}/api/companies/droplet/callback" \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Bearer ${params.interserviceSecret}" \\
    -d "{\\"step\\":\\"\$step\\",\\"status\\":\\"\$status\\",\\"error\\":\\"\$error\\"}" \\
    || true
}

report "phase1" "started"

# ============================================================
# PHASE 1: Minimal health server (fast — ~10 seconds)
# ============================================================

# Configure firewall to allow health checks and SMTP/IMAP for email
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 3001/tcp
ufw allow out 25/tcp   # SMTP (outbound)
ufw allow out 465/tcp  # SMTPS (outbound)
ufw allow out 587/tcp  # SMTP submission (outbound)
ufw allow out 993/tcp  # IMAPS (outbound)
ufw --force enable

# Start a lightweight Python health server immediately
# This allows the platform to detect the droplet as "active" right away
# It reads /opt/ai-employees/status to report actual build phase
cat > /opt/health-server.py << 'PYEOF'
import http.server, json, socketserver, os

STATUS_FILE = "/opt/ai-employees/status"
LOG_FILE = "/var/log/ai-employees-init.log"

def get_phase():
    try:
        with open(STATUS_FILE) as f:
            status = f.read().strip()
        if status == "READY":
            return "ready"
        elif status.startswith("PHASE2_FAILED"):
            return status
        else:
            return "provisioning"
    except:
        return "provisioning"

def get_logs(tail=100):
    try:
        with open(LOG_FILE) as f:
            lines = f.readlines()
        return "".join(lines[-tail:])
    except:
        return "No logs available"

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        phase = get_phase()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        if self.path == "/health" or self.path == "/api/health":
            self.wfile.write(json.dumps({"status": "ok", "phase": phase}).encode())
        elif self.path == "/logs":
            self.wfile.write(json.dumps({"phase": phase, "logs": get_logs()}).encode())
        elif self.path == "/phase":
            self.wfile.write(json.dumps({"phase": phase}).encode())
        else:
            self.wfile.write(json.dumps({"status": phase}).encode())
    def log_message(self, format, *args):
        pass

socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(("0.0.0.0", 3001), H)
httpd.serve_forever()
PYEOF

mkdir -p /opt/ai-employees

python3 /opt/health-server.py &
HEALTH_PID=\$!
echo "Placeholder health server started on :3001 (PID \$HEALTH_PID)"

# Report ready immediately so the platform marks this as active
report "ready" "ok"
echo "PHASE1_READY" > /opt/ai-employees/status

# ============================================================
# PHASE 2: Full application setup (runs in background)
# ============================================================

report "phase2-system-update" "started"

# Update system and install basics
apt-get update -qq || true
apt-get install -y -qq git ufw fail2ban redis-server curl || true

report "phase2-node-install" "started"

# Install Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - || {
  report "phase2-node-install" "error" "nodesource setup failed"
}
apt-get install -y -qq nodejs || {
  report "phase2-node-install" "error" "nodejs install failed"
}

# Install pnpm (try corepack first, fallback to npm)
corepack enable 2>/dev/null && corepack prepare pnpm@9.15.0 --activate 2>/dev/null || {
  npm install -g pnpm@9.15.0 || true
}

# Configure Redis
systemctl enable redis-server || true
systemctl start redis-server || true

report "phase2-docker" "started"

# Install Docker
curl -fsSL https://get.docker.com | sh || {
  report "phase2-docker" "error" "docker install failed"
  echo "PHASE2_FAILED_DOCKER" > /opt/ai-employees/status
  exit 0
}
systemctl enable docker
systemctl start docker

# Pull OpenClaw image
echo "Pulling OpenClaw image..."
docker pull ghcr.io/carmichgo/openclaw:latest || {
  report "phase2-docker" "error" "openclaw image pull failed"
  echo "PHASE2_FAILED_DOCKER_PULL" > /opt/ai-employees/status
  exit 0
}

# Create config directory for employee OpenClaw instances
mkdir -p /opt/ai-employees/openclaw-configs

report "phase2-download" "started"

# Create app directory and write environment file
mkdir -p /opt/ai-employees
cd /opt/ai-employees

cat > .env << 'ENVEOF'
DATABASE_URL=${dbUrl}
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=${jwtSecret}
JWT_EXPIRES_IN=7d
ENCRYPTION_KEY=${encryptionKey}
INTERSERVICE_SECRET=${params.interserviceSecret}
OPENCLAW_IMAGE=ghcr.io/carmichgo/openclaw:latest
OPENCLAW_NETWORK=ai-employees-internal
API_PORT=3001
PLATFORM_URL=${params.platformUrl}
ANTHROPIC_API_KEY=${params.anthropicApiKey}
GEMINI_API_KEY=${params.geminiApiKey}
BRAVE_API_KEY=${params.braveApiKey}
TWILIO_ACCOUNT_SID=${params.twilioAccountSid}
TWILIO_AUTH_TOKEN=${params.twilioAuthToken}
SLACK_APP_TOKEN=${params.slackAppToken}
SLACK_SIGNING_SECRET=${params.slackSigningSecret}
ENVEOF

# Download repo — try tarball first, then git clone as fallback
TARBALL_URL="https://github.com/carmichgo/ai-employees/archive/refs/heads/${params.repoBranch}.tar.gz"
echo "Downloading from: \$TARBALL_URL"

mkdir -p /opt/ai-employees/app
DOWNLOAD_OK=false

# Method 1: curl tarball (verbose error reporting)
HTTP_CODE=\$(curl -sL -w "%{http_code}" "\$TARBALL_URL" -o /tmp/repo.tar.gz 2>/dev/null)
echo "Tarball download HTTP code: \$HTTP_CODE"
if [ "\$HTTP_CODE" = "200" ] && [ -s /tmp/repo.tar.gz ]; then
  tar xzf /tmp/repo.tar.gz --strip-components=1 -C /opt/ai-employees/app && DOWNLOAD_OK=true
  rm -f /tmp/repo.tar.gz
fi

# Method 2: git clone if tarball failed
if [ "\$DOWNLOAD_OK" = "false" ]; then
  echo "Tarball failed, trying git clone..."
  rm -f /tmp/repo.tar.gz
  if git clone --depth 1 --branch "${params.repoBranch}" "https://github.com/carmichgo/ai-employees.git" /tmp/repo-clone 2>&1; then
    cp -r /tmp/repo-clone/* /opt/ai-employees/app/
    cp -r /tmp/repo-clone/.* /opt/ai-employees/app/ 2>/dev/null || true
    rm -rf /tmp/repo-clone
    DOWNLOAD_OK=true
  fi
fi

# Method 3: wget if both failed
if [ "\$DOWNLOAD_OK" = "false" ]; then
  echo "Git clone failed too, trying wget..."
  if wget -q "\$TARBALL_URL" -O /tmp/repo.tar.gz 2>&1; then
    tar xzf /tmp/repo.tar.gz --strip-components=1 -C /opt/ai-employees/app && DOWNLOAD_OK=true
    rm -f /tmp/repo.tar.gz
  fi
fi

if [ "\$DOWNLOAD_OK" = "false" ]; then
  report "phase2-download" "error" "all download methods failed (HTTP=\$HTTP_CODE)"
  echo "PHASE2_FAILED_DOWNLOAD" > /opt/ai-employees/status
  exit 0
fi

cd /opt/ai-employees/app
cp /opt/ai-employees/.env .env
echo "${params.repoBranch}" > .branch

report "phase2-build" "started"

# Install dependencies and build
pnpm install --frozen-lockfile 2>&1 || pnpm install 2>&1 || {
  report "phase2-build" "error" "pnpm install failed"
  echo "PHASE2_FAILED_INSTALL" > /opt/ai-employees/status
  exit 0
}

pnpm turbo build --filter=@ai-employees/api --filter=@ai-employees/worker 2>&1 || {
  report "phase2-build" "error" "turbo build failed"
  echo "PHASE2_FAILED_BUILD" > /opt/ai-employees/status
  exit 0
}

# Patch package.json main fields for Node.js ESM runtime
sed -i 's|"main": "src/index.ts"|"main": "dist/index.js"|g' packages/*/package.json

report "phase2-services" "started"

# Create systemd service for API
cat > /etc/systemd/system/ai-employees-api.service << 'SVCEOF'
[Unit]
Description=AI Employees API
After=network.target redis-server.service
Wants=redis-server.service

[Service]
Type=simple
WorkingDirectory=/opt/ai-employees/app
EnvironmentFile=/opt/ai-employees/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node apps/api/dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVCEOF

# Create systemd service for Worker
cat > /etc/systemd/system/ai-employees-worker.service << 'SVCEOF'
[Unit]
Description=AI Employees Worker
After=network.target redis-server.service
Wants=redis-server.service

[Service]
Type=simple
WorkingDirectory=/opt/ai-employees/app
EnvironmentFile=/opt/ai-employees/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node apps/worker/dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVCEOF

# Kill placeholder health server — force kill all python on port 3001
kill \$HEALTH_PID 2>/dev/null || true
# Also kill by port in case PID is stale
fuser -k 3001/tcp 2>/dev/null || true
sleep 2

# First, test if the API can start at all (capture errors)
echo "Testing API startup..."
cd /opt/ai-employees/app
source /opt/ai-employees/.env
export DATABASE_URL REDIS_URL JWT_SECRET JWT_EXPIRES_IN ENCRYPTION_KEY INTERSERVICE_SECRET OPENCLAW_IMAGE OPENCLAW_NETWORK API_PORT PLATFORM_URL ANTHROPIC_API_KEY GEMINI_API_KEY BRAVE_API_KEY TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN NODE_ENV=production
timeout 10 /usr/bin/node apps/api/dist/index.js > /tmp/api-test.log 2>&1 &
TEST_PID=\$!
sleep 5

if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
  echo "Direct test: API started successfully!"
  kill \$TEST_PID 2>/dev/null || true
  fuser -k 3001/tcp 2>/dev/null || true
  sleep 1
else
  echo "Direct test: API failed to start. Output:"
  kill \$TEST_PID 2>/dev/null || true
  cat /tmp/api-test.log 2>/dev/null || true
  fuser -k 3001/tcp 2>/dev/null || true
  sleep 1
fi

systemctl daemon-reload
systemctl enable ai-employees-api ai-employees-worker
systemctl start ai-employees-api ai-employees-worker

# Wait for real API to be healthy (up to 60s)
for i in \$(seq 1 12); do
  if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
    report "phase2-ready" "ok"
    echo "READY" > /opt/ai-employees/status
    echo "Cloud-init: API is ready at \$(date)"
${params.employeeId ? `
    # Auto-provision the OpenClaw container for this employee
    echo "Triggering container provisioning for employee ${params.employeeId}..."
    PROVISION_RESULT=\$(curl -sf -X POST http://localhost:3001/internal/employees/${params.employeeId}/reprovision \\
      -H "Content-Type: application/json" \\
      -H "X-INTERSERVICE-SECRET: ${params.interserviceSecret}" \\
      -d '{}' 2>&1) || true
    echo "Provision result: \$PROVISION_RESULT"
    report "ready" "ok"
` : '    report "ready" "ok"'}
    echo "Cloud-init complete at \$(date)"
    exit 0
  fi
  echo "Waiting for API... attempt \$i/12"
  sleep 5
done

# If we get here, real API didn't come up — capture detailed errors
report "phase2-ready" "error" "API failed on port 3001 after 60s"
echo "=== systemctl status ===" >> /var/log/ai-employees-init.log
systemctl status ai-employees-api --no-pager >> /var/log/ai-employees-init.log 2>&1
echo "=== journalctl ===" >> /var/log/ai-employees-init.log
journalctl -u ai-employees-api --no-pager -n 50 >> /var/log/ai-employees-init.log 2>&1
echo "=== direct test output ===" >> /var/log/ai-employees-init.log
cat /tmp/api-test.log >> /var/log/ai-employees-init.log 2>&1
python3 /opt/health-server.py &
echo "PHASE2_FAILED" > /opt/ai-employees/status
`;
}

/** Droplet size mapping based on plan tier */
const PLAN_DROPLET_SIZES: Record<string, string> = {
  starter: "s-2vcpu-4gb",
  professional: "s-4vcpu-8gb",
  enterprise: "s-8vcpu-16gb",
};

/** Create a new droplet for a company */
export async function createCompanyDroplet(companyId: string): Promise<{
  dropletId: string;
  interserviceSecret: string;
}> {
  // Get company details
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!company) throw new Error("Company not found");
  if (company.dropletStatus === "provisioning") throw new Error("Droplet is already being provisioned");

  // If there's a stale "active" droplet, verify it actually exists on DO
  if (company.dropletStatus === "active" && company.dropletId) {
    try {
      await doFetch(`/droplets/${company.dropletId}`);
      throw new Error("Company already has an active droplet");
    } catch (err: any) {
      // Droplet doesn't exist on DO — clean up and allow re-provisioning
      if (!err.message.includes("already has an active droplet")) {
        await db
          .update(companies)
          .set({ dropletId: null, dropletIp: null, dropletStatus: "destroyed", interserviceSecret: null, updatedAt: new Date() })
          .where(eq(companies.id, companyId));
      } else {
        throw err;
      }
    }
  }

  const interserviceSecret = crypto.randomBytes(32).toString("hex");
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL not set");

  const region = company.dropletRegion || "nyc3";
  const size = PLAN_DROPLET_SIZES[company.plan] || PLAN_DROPLET_SIZES.starter;

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY || "";
  const geminiApiKey = process.env.GEMINI_API_KEY || "";
  const braveApiKey = process.env.BRAVE_API_KEY || "";
  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID || "";
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN || "";
  const slackAppToken = (process.env.SLACK_APP_TOKEN || "").trim();
  const slackSigningSecret = (process.env.SLACK_SIGNING_SECRET || "").trim();

  const userData = generateCloudInit({
    companySlug: company.slug,
    databaseUrl,
    interserviceSecret,
    platformUrl: process.env.NEXT_PUBLIC_APP_URL || "https://ai-employees-ten.vercel.app",
    repoUrl: REPO_URL,
    repoBranch: REPO_BRANCH,
    anthropicApiKey,
    geminiApiKey,
    braveApiKey,
    twilioAccountSid,
    twilioAuthToken,
    slackAppToken,
    slackSigningSecret,
  });

  // Get SSH keys from DO account (if any) so the user can SSH in for debugging
  let sshKeys: number[] = [];
  try {
    const keysRes = await doFetch("/account/keys");
    const keysData = await keysRes.json();
    sshKeys = (keysData.ssh_keys || []).map((k: { id: number }) => k.id);
  } catch {
    // No SSH keys, that's ok
  }

  // Create the droplet via DO API
  const res = await doFetch("/droplets", {
    method: "POST",
    body: JSON.stringify({
      name: `ai-emp-${company.slug}`,
      region,
      size,
      image: "ubuntu-24-04-x64",
      user_data: userData,
      tags: ["ai-employees", `company:${company.slug}`],
      monitoring: true,
      ...(sshKeys.length > 0 ? { ssh_keys: sshKeys } : {}),
    }),
  });

  const data = await res.json();
  const dropletId = String(data.droplet.id);

  // Update company record
  await db
    .update(companies)
    .set({
      dropletId,
      dropletSize: size,
      dropletRegion: region,
      dropletStatus: "provisioning",
      interserviceSecret,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, companyId));

  return { dropletId, interserviceSecret };
}

function slugifyName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Create a new droplet for a specific employee */
export async function createEmployeeDroplet(employeeId: string): Promise<{
  dropletId: string;
  interserviceSecret: string;
}> {
  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!employee) throw new Error("Employee not found");
  if (employee.dropletStatus === "provisioning") throw new Error("Droplet is already being provisioned");

  // If there's a stale "active" droplet, verify it actually exists on DO
  if (employee.dropletStatus === "active" && employee.dropletId) {
    try {
      await doFetch(`/droplets/${employee.dropletId}`);
      throw new Error("Employee already has an active droplet");
    } catch (err: any) {
      if (!err.message.includes("already has an active droplet")) {
        await db
          .update(employees)
          .set({ dropletId: null, dropletIp: null, dropletStatus: "destroyed", interserviceSecret: null, updatedAt: new Date() })
          .where(eq(employees.id, employeeId));
      } else {
        throw err;
      }
    }
  }

  // Get company for slug and plan
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, employee.companyId))
    .limit(1);

  if (!company) throw new Error("Company not found");

  const interserviceSecret = crypto.randomBytes(32).toString("hex");
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL not set");

  const region = "nyc3";
  const size = PLAN_DROPLET_SIZES[company.plan] || PLAN_DROPLET_SIZES.starter;

  const userData = generateCloudInit({
    companySlug: company.slug,
    databaseUrl,
    interserviceSecret,
    platformUrl: process.env.NEXT_PUBLIC_APP_URL || "https://ai-employees-ten.vercel.app",
    repoUrl: REPO_URL,
    repoBranch: REPO_BRANCH,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    braveApiKey: process.env.BRAVE_API_KEY || "",
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || "",
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || "",
    slackAppToken: (process.env.SLACK_APP_TOKEN || "").trim(),
    slackSigningSecret: (process.env.SLACK_SIGNING_SECRET || "").trim(),
    employeeId: employee.id,
    companyId: employee.companyId,
  });

  let sshKeys: number[] = [];
  try {
    const keysRes = await doFetch("/account/keys");
    const keysData = await keysRes.json();
    sshKeys = (keysData.ssh_keys || []).map((k: { id: number }) => k.id);
  } catch {}

  const dropletName = `ai-emp-${company.slug}-${slugifyName(employee.name)}`;

  const res = await doFetch("/droplets", {
    method: "POST",
    body: JSON.stringify({
      name: dropletName,
      region,
      size,
      image: "ubuntu-24-04-x64",
      user_data: userData,
      tags: ["ai-employees", `company:${company.slug}`, `employee:${slugifyName(employee.name)}`],
      monitoring: true,
      ...(sshKeys.length > 0 ? { ssh_keys: sshKeys } : {}),
    }),
  });

  const data = await res.json();
  const dropletId = String(data.droplet.id);

  // Store on the employee record
  await db
    .update(employees)
    .set({
      dropletId,
      dropletSize: size,
      dropletRegion: region,
      dropletStatus: "provisioning",
      interserviceSecret,
      updatedAt: new Date(),
    })
    .where(eq(employees.id, employeeId));

  return { dropletId, interserviceSecret };
}

/** Poll DO API for an employee's droplet IP and readiness */
export async function pollEmployeeDropletStatus(employeeId: string): Promise<{
  status: string;
  ip: string | null;
  phase: string | null;
}> {
  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!employee || !employee.dropletId) {
    return { status: "none", ip: null, phase: null };
  }

  // If we already have an IP, just check health
  if ((employee.dropletStatus === "active" || employee.dropletStatus === "error") && employee.dropletIp) {
    const apiCheck = await checkDropletApi(employee.dropletIp, employee.interserviceSecret || "");
    if (apiCheck.ok) {
      if (employee.dropletStatus === "error") {
        await db.update(employees).set({ dropletStatus: "active", updatedAt: new Date() }).where(eq(employees.id, employeeId));
      }
      return { status: "active", ip: employee.dropletIp, phase: apiCheck.phase };
    }
    return { status: employee.dropletStatus || "error", ip: employee.dropletIp, phase: null };
  }

  // Query DO API for the droplet's IP
  try {
    const res = await doFetch(`/droplets/${employee.dropletId}`);
    const data = await res.json();
    const droplet = data.droplet;

    const publicNet = droplet.networks?.v4?.find((n: { type: string }) => n.type === "public");
    const ip = publicNet?.ip_address || null;

    if (droplet.status === "active" && ip) {
      const apiCheck = await checkDropletApi(ip, employee.interserviceSecret || "");

      if (apiCheck.ok) {
        await db.update(employees).set({ dropletIp: ip, dropletStatus: "active", updatedAt: new Date() }).where(eq(employees.id, employeeId));
        return { status: "active", ip, phase: apiCheck.phase };
      }

      // Droplet running but API not ready yet
      await db.update(employees).set({ dropletIp: ip, updatedAt: new Date() }).where(eq(employees.id, employeeId));
      return { status: "booting", ip, phase: null };
    }

    return { status: "provisioning", ip, phase: null };
  } catch {
    await db.update(employees).set({ dropletStatus: "error", updatedAt: new Date() }).where(eq(employees.id, employeeId));
    return { status: "error", ip: null, phase: null };
  }
}

/** Destroy an employee's droplet */
export async function destroyEmployeeDroplet(employeeId: string): Promise<void> {
  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!employee || !employee.dropletId) return;

  try {
    await doFetch(`/droplets/${employee.dropletId}`, { method: "DELETE" });
  } catch {
    // Droplet may already be destroyed
  }

  await db
    .update(employees)
    .set({
      dropletId: null,
      dropletIp: null,
      dropletStatus: "destroyed",
      interserviceSecret: null,
      updatedAt: new Date(),
    })
    .where(eq(employees.id, employeeId));
}

/** Poll DO API for droplet IP and readiness */
export async function pollDropletStatus(companyId: string): Promise<{
  status: string;
  ip: string | null;
  phase: string | null;
}> {
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!company || !company.dropletId) {
    return { status: "none", ip: null, phase: null };
  }

  // If active or error with an IP, check what phase the API is in
  // This also allows recovery from "error" state if the health endpoint is still responding
  if ((company.dropletStatus === "active" || company.dropletStatus === "error") && company.dropletIp) {
    const apiCheck = await checkDropletApi(company.dropletIp, company.interserviceSecret || "");
    if (apiCheck.ok) {
      // Health endpoint responding — mark as active if it was in error state
      if (company.dropletStatus === "error") {
        await db
          .update(companies)
          .set({ dropletStatus: "active", updatedAt: new Date() })
          .where(eq(companies.id, companyId));
      }
      return { status: "active", ip: company.dropletIp, phase: apiCheck.phase };
    }
    // Health endpoint not responding — keep current status
    return { status: company.dropletStatus, ip: company.dropletIp, phase: null };
  }

  try {
    const res = await doFetch(`/droplets/${company.dropletId}`);
    const data = await res.json();
    const droplet = data.droplet;

    // Get public IPv4
    const publicNet = droplet.networks?.v4?.find(
      (n: { type: string }) => n.type === "public",
    );
    const ip = publicNet?.ip_address || null;

    if (droplet.status === "active" && ip) {
      const apiCheck = await checkDropletApi(ip, company.interserviceSecret || "");

      if (apiCheck.ok) {
        await db
          .update(companies)
          .set({
            dropletIp: ip,
            dropletStatus: "active",
            updatedAt: new Date(),
          })
          .where(eq(companies.id, companyId));

        return { status: "active", ip, phase: apiCheck.phase };
      }

      // Droplet is running but API isn't ready yet
      await db
        .update(companies)
        .set({ dropletIp: ip, updatedAt: new Date() })
        .where(eq(companies.id, companyId));

      return { status: "booting", ip, phase: null };
    }

    return { status: "provisioning", ip, phase: null };
  } catch {
    // DO API failed — droplet may have been destroyed externally
    // Update DB so the user can re-provision without having to "destroy" first
    await db
      .update(companies)
      .set({ dropletStatus: "error", updatedAt: new Date() })
      .where(eq(companies.id, companyId));
    return { status: "error", ip: null, phase: null };
  }
}

/** Check if the droplet's API is responding and what phase it's in */
async function checkDropletApi(ip: string, _secret: string): Promise<{ ok: boolean; phase: string | null }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`http://${ip}:3001/health`, {
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!res.ok) return { ok: false, phase: null };

    const body = await res.json().catch(() => ({}));
    // Placeholder returns { phase: "provisioning" }, real API returns { status: "ok", timestamp: "..." }
    const phase = body.phase || (body.timestamp ? "ready" : "unknown");

    // If the phase indicates a download/setup failure, the droplet is NOT ready
    if (typeof phase === "string" && phase.startsWith("PHASE2_FAILED")) {
      return { ok: false, phase };
    }

    return { ok: true, phase };
  } catch {
    return { ok: false, phase: null };
  }
}

/** Destroy a company's droplet */
export async function destroyCompanyDroplet(companyId: string): Promise<void> {
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!company || !company.dropletId) return;

  try {
    await doFetch(`/droplets/${company.dropletId}`, { method: "DELETE" });
  } catch {
    // Droplet may already be destroyed
  }

  await db
    .update(companies)
    .set({
      dropletId: null,
      dropletIp: null,
      dropletStatus: "destroyed",
      interserviceSecret: null,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, companyId));
}

/** Power-cycle (reboot) an employee's droplet via DO API */
export async function powerCycleEmployeeDroplet(employeeId: string): Promise<boolean> {
  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!employee?.dropletId) return false;

  try {
    await doFetch(`/droplets/${employee.dropletId}/actions`, {
      method: "POST",
      body: JSON.stringify({ type: "power_cycle" }),
    });
    console.log(`[droplet] Power-cycled droplet ${employee.dropletId} for employee ${employee.name}`);
    return true;
  } catch (err: any) {
    console.error(`[droplet] Failed to power-cycle droplet ${employee.dropletId}:`, err.message);
    return false;
  }
}

/** Check if a droplet exists and is running via DO API (without DB updates) */
export async function getDropletInfo(dropletId: string): Promise<{
  exists: boolean;
  status: string | null;
  ip: string | null;
}> {
  try {
    const res = await doFetch(`/droplets/${dropletId}`);
    const data = await res.json();
    const droplet = data.droplet;
    const publicNet = droplet.networks?.v4?.find((n: { type: string }) => n.type === "public");
    return {
      exists: true,
      status: droplet.status,
      ip: publicNet?.ip_address || null,
    };
  } catch {
    return { exists: false, status: null, ip: null };
  }
}

/** Check if a droplet's API health endpoint is responding */
export async function checkDropletHealth(ip: string): Promise<{ ok: boolean; phase: string | null }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`http://${ip}:3001/health`, {
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!res.ok) return { ok: false, phase: null };

    const body = await res.json().catch(() => ({}));
    const phase = body.phase || (body.timestamp ? "ready" : "unknown");

    if (typeof phase === "string" && phase.startsWith("PHASE2_FAILED")) {
      return { ok: false, phase };
    }

    return { ok: true, phase };
  } catch {
    return { ok: false, phase: null };
  }
}

/** Get available DO regions */
export async function getRegions(): Promise<Array<{ slug: string; name: string }>> {
  const res = await doFetch("/regions");
  const data = await res.json();
  return data.regions
    .filter((r: { available: boolean }) => r.available)
    .map((r: { slug: string; name: string }) => ({ slug: r.slug, name: r.name }));
}
