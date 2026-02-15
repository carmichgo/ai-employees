/**
 * DigitalOcean API client — provisions per-employee droplets.
 *
 * Each employee gets their own droplet, sized by tier:
 *   junior  → s-1vcpu-2gb
 *   senior  → s-2vcpu-4gb
 *   expert  → s-4vcpu-8gb
 *
 * Requires DO_API_TOKEN env var (DigitalOcean personal access token).
 */

import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, companies } from "@/lib/schema";
import { createBackendClient } from "@/lib/backend";

const DO_API_TOKEN = process.env.DO_API_TOKEN;
const DO_API = "https://api.digitalocean.com/v2";

// The GitHub repo URL for cloning on the droplet
const REPO_URL = process.env.REPO_URL || "https://github.com/carmichgo/ai-employees.git";
const REPO_BRANCH = (process.env.REPO_BRANCH || "main").trim();

export function isDropletProvisioningEnabled(): boolean {
  return !!DO_API_TOKEN;
}

async function doFetch(path: string, options: RequestInit = {}): Promise<Response> {
  if (!DO_API_TOKEN) {
    throw new Error("DO_API_TOKEN not configured");
  }

  const res = await fetch(`${DO_API}${path}`, {
    ...options,
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
}

/** Droplet size mapping based on employee tier */
const TIER_DROPLET_SIZES: Record<string, string> = {
  junior: "s-1vcpu-2gb",
  senior: "s-2vcpu-4gb",
  expert: "s-4vcpu-8gb",
};

/** Generate the cloud-init user_data script for an employee's droplet */
function generateCloudInit(params: {
  employeeName: string;
  companySlug: string;
  databaseUrl: string;
  interserviceSecret: string;
  platformUrl: string;
  repoUrl: string;
  repoBranch: string;
  anthropicApiKey: string;
  braveApiKey: string;
  slackAppToken: string;
  slackSigningSecret: string;
}): string {
  const jwtSecret = crypto.randomBytes(32).toString("hex");
  const encryptionKey = crypto.randomBytes(32).toString("hex");
  const dbUrl = params.databaseUrl.replace(/'/g, "'\\''");

  return `#!/bin/bash

# === AI Employees — Droplet for ${params.employeeName} (${params.companySlug}) ===

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

# Configure firewall to allow health checks
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 3001/tcp
ufw --force enable

# Start a lightweight Python health server immediately
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

# Pull Blitzer image
echo "Pulling Blitzer image..."
docker pull ghcr.io/openclaw/openclaw:latest || {
  report "phase2-docker" "error" "blitzer image pull failed"
  echo "PHASE2_FAILED_DOCKER_PULL" > /opt/ai-employees/status
  exit 0
}

# Create config directory for employee Blitzer instances
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
OPENCLAW_IMAGE=ghcr.io/openclaw/openclaw:latest
OPENCLAW_NETWORK=ai-employees-internal
API_PORT=3001
PLATFORM_URL=${params.platformUrl}
ANTHROPIC_API_KEY=${params.anthropicApiKey}
BRAVE_API_KEY=${params.braveApiKey}
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
export DATABASE_URL REDIS_URL JWT_SECRET JWT_EXPIRES_IN ENCRYPTION_KEY INTERSERVICE_SECRET OPENCLAW_IMAGE OPENCLAW_NETWORK API_PORT PLATFORM_URL ANTHROPIC_API_KEY BRAVE_API_KEY NODE_ENV=production
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

/** Create a new droplet for an employee (sized by tier) */
export async function createEmployeeDroplet(employeeId: string): Promise<{
  dropletId: string;
  interserviceSecret: string;
}> {
  // Get employee + company details
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

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, employee.companyId))
    .limit(1);

  if (!company) throw new Error("Company not found");

  const interserviceSecret = crypto.randomBytes(32).toString("hex");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not set");

  const region = employee.dropletRegion || "nyc3";
  const size = TIER_DROPLET_SIZES[employee.tier] || TIER_DROPLET_SIZES.junior;

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY || "";
  const braveApiKey = process.env.BRAVE_API_KEY || "";
  const slackAppToken = (process.env.SLACK_APP_TOKEN || "").trim();
  const slackSigningSecret = (process.env.SLACK_SIGNING_SECRET || "").trim();

  const userData = generateCloudInit({
    employeeName: employee.name,
    companySlug: company.slug,
    databaseUrl,
    interserviceSecret,
    platformUrl: process.env.NEXT_PUBLIC_APP_URL || "https://ai-employees-ten.vercel.app",
    repoUrl: REPO_URL,
    repoBranch: REPO_BRANCH,
    anthropicApiKey,
    braveApiKey,
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

  const slugName = employee.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  // Create the droplet via DO API
  const res = await doFetch("/droplets", {
    method: "POST",
    body: JSON.stringify({
      name: `ai-emp-${company.slug}-${slugName}`,
      region,
      size,
      image: "ubuntu-24-04-x64",
      user_data: userData,
      tags: ["ai-employees", `company:${company.slug}`, `employee:${slugName}`],
      monitoring: true,
      ...(sshKeys.length > 0 ? { ssh_keys: sshKeys } : {}),
    }),
  });

  const data = await res.json();
  const dropletId = String(data.droplet.id);

  // Update employee record with droplet info
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

/** Power off an employee's droplet (saves billing while paused) */
export async function powerOffDroplet(employeeId: string): Promise<void> {
  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!employee?.dropletId) return;

  try {
    await doFetch(`/droplets/${employee.dropletId}/actions`, {
      method: "POST",
      body: JSON.stringify({ type: "shutdown" }),
    });
  } catch {
    // Graceful shutdown failed — try hard power off
    try {
      await doFetch(`/droplets/${employee.dropletId}/actions`, {
        method: "POST",
        body: JSON.stringify({ type: "power_off" }),
      });
    } catch {
      // Droplet may already be off
    }
  }

  await db
    .update(employees)
    .set({ dropletStatus: "powered_off", updatedAt: new Date() })
    .where(eq(employees.id, employeeId));
}

/** Power on an employee's droplet (for resume) */
export async function powerOnDroplet(employeeId: string): Promise<void> {
  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!employee?.dropletId) return;

  await doFetch(`/droplets/${employee.dropletId}/actions`, {
    method: "POST",
    body: JSON.stringify({ type: "power_on" }),
  });

  await db
    .update(employees)
    .set({
      dropletStatus: "booting",
      status: "provisioning",
      updatedAt: new Date(),
    })
    .where(eq(employees.id, employeeId));
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

  // Powered off — nothing to poll
  if (employee.dropletStatus === "powered_off") {
    return { status: "powered_off", ip: employee.dropletIp, phase: null };
  }

  // If we already have an IP and the droplet was active/error/booting, check API health directly
  if (["active", "error", "booting"].includes(employee.dropletStatus || "") && employee.dropletIp) {
    const apiCheck = await checkDropletApi(employee.dropletIp);
    if (apiCheck.ok && apiCheck.phase === "ready") {
      // Droplet API is up — update dropletStatus if needed
      if (employee.dropletStatus !== "active") {
        await db
          .update(employees)
          .set({ dropletStatus: "active", updatedAt: new Date() })
          .where(eq(employees.id, employeeId));
      }
      return handleDropletReady(employee, employeeId, employee.dropletIp);
    }
    // API not ready yet — still booting
    if (employee.dropletStatus === "booting") {
      return { status: "booting", ip: employee.dropletIp, phase: apiCheck.ok ? apiCheck.phase : null };
    }
    return { status: employee.dropletStatus || "unknown", ip: employee.dropletIp, phase: null };
  }

  // Check DO API for current droplet state
  try {
    const res = await doFetch(`/droplets/${employee.dropletId}`);
    const data = await res.json();
    const droplet = data.droplet;

    const publicNet = droplet.networks?.v4?.find(
      (n: { type: string }) => n.type === "public",
    );
    const ip = publicNet?.ip_address || null;

    if (droplet.status === "off") {
      return { status: "powered_off", ip, phase: null };
    }

    if (droplet.status === "active" && ip) {
      const apiCheck = await checkDropletApi(ip);

      if (apiCheck.ok && apiCheck.phase === "ready") {
        // Droplet API is up — save IP and update dropletStatus
        await db
          .update(employees)
          .set({ dropletIp: ip, dropletStatus: "active", updatedAt: new Date() })
          .where(eq(employees.id, employeeId));

        return handleDropletReady(employee, employeeId, ip);
      }

      // Droplet is running but API not fully ready yet
      await db
        .update(employees)
        .set({ dropletIp: ip, updatedAt: new Date() })
        .where(eq(employees.id, employeeId));

      return { status: "booting", ip, phase: apiCheck.ok ? apiCheck.phase : null };
    }

    return { status: "provisioning", ip, phase: null };
  } catch {
    await db
      .update(employees)
      .set({ dropletStatus: "error", updatedAt: new Date() })
      .where(eq(employees.id, employeeId));
    return { status: "error", ip: null, phase: null };
  }
}

/**
 * Handle the case where the droplet API is ready.
 * Decides whether to provision a new container, start a stopped one, or confirm active.
 */
async function handleDropletReady(
  employee: Record<string, unknown>,
  employeeId: string,
  ip: string,
): Promise<{ status: string; ip: string | null; phase: string | null }> {
  const hasContainer = !!employee.containerId;
  const secret = employee.interserviceSecret as string;

  if (hasContainer) {
    // Container was previously provisioned
    if (employee.status === "active") {
      return { status: "active", ip, phase: "ready" };
    }

    if (employee.status === "provisioning" || employee.status === "paused") {
      // Resuming from pause — container exists but needs to be started
      try {
        const backend = createBackendClient({ url: `http://${ip}:3001`, secret });
        await backend.resumeEmployee(employeeId);
        console.log(`[droplet-poll] Triggered container start for ${employeeId} (resume)`);
      } catch (err: any) {
        console.error(`[droplet-poll] Failed to start container: ${err.message}`);
      }
      return { status: "provisioning", ip, phase: "container-starting" };
    }

    // Other status — return as-is
    return { status: employee.status as string, ip, phase: "ready" };
  }

  // No container — need to provision one
  try {
    const backend = createBackendClient({ url: `http://${ip}:3001`, secret });
    await backend.provisionContainer(employeeId);
    console.log(`[droplet-poll] Triggered container provisioning for ${employeeId}`);
  } catch (err: any) {
    console.error(`[droplet-poll] Failed to trigger container provisioning: ${err.message}`);
  }
  return { status: "provisioning", ip, phase: "container-provisioning" };
}

/** Check if the droplet's API is responding and what phase it's in */
async function checkDropletApi(ip: string): Promise<{ ok: boolean; phase: string | null }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`http://${ip}:3001/health`, {
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!res.ok) return { ok: false, phase: null };

    const body = await res.json().catch(() => ({}));
    const phase = body.phase || (body.timestamp ? "ready" : "unknown");
    return { ok: true, phase };
  } catch {
    return { ok: false, phase: null };
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

/** Get available DO regions */
export async function getRegions(): Promise<Array<{ slug: string; name: string }>> {
  const res = await doFetch("/regions");
  const data = await res.json();
  return data.regions
    .filter((r: { available: boolean }) => r.available)
    .map((r: { slug: string; name: string }) => ({ slug: r.slug, name: r.name }));
}
