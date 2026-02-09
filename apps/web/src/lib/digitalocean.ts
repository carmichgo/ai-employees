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
import { companies } from "@/lib/schema";

const DO_API_TOKEN = process.env.DO_API_TOKEN;
const DO_API = "https://api.digitalocean.com/v2";

// The GitHub repo URL for cloning on the droplet
const REPO_URL = process.env.REPO_URL || "https://github.com/carmichgo/ai-employees.git";
const REPO_BRANCH = process.env.REPO_BRANCH || "main";

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

/** Generate the cloud-init user_data script for a company's droplet */
function generateCloudInit(params: {
  companySlug: string;
  databaseUrl: string;
  interserviceSecret: string;
  platformUrl: string;
  repoUrl: string;
  repoBranch: string;
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

# Configure firewall to allow health checks
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 3001/tcp
ufw --force enable

# Start a lightweight Python health server immediately
# This allows the platform to detect the droplet as "active" right away
cat > /opt/health-server.py << 'PYEOF'
import http.server, json, socketserver

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health" or self.path == "/api/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "phase": "provisioning"}).encode())
        else:
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "provisioning"}).encode())
    def log_message(self, format, *args):
        pass  # silence logs

socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(("0.0.0.0", 3001), H)
httpd.serve_forever()
PYEOF

python3 /opt/health-server.py &
HEALTH_PID=$!
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
  report "node-install" "error" "nodesource setup failed"
}
apt-get install -y -qq nodejs || {
  report "node-install" "error" "nodejs install failed"
}

# Install pnpm
corepack enable || true
corepack prepare pnpm@9.15.0 --activate || true

# Configure Redis
systemctl enable redis-server || true
systemctl start redis-server || true

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
OPENCLAW_IMAGE=openclaw:latest
OPENCLAW_NETWORK=ai-employees-internal
API_PORT=3001
PLATFORM_URL=${params.platformUrl}
ENVEOF

# Download repo as tarball
TARBALL_URL="https://github.com/carmichgo/ai-employees/archive/refs/heads/${params.repoBranch}.tar.gz"
echo "Downloading from: \$TARBALL_URL"
if ! curl -sfL "\$TARBALL_URL" -o /tmp/repo.tar.gz; then
  report "phase2-download" "error" "tarball download failed"
  echo "PHASE2_FAILED_DOWNLOAD" > /opt/ai-employees/status
  exit 0  # Don't exit 1 — health server should keep running
fi

mkdir -p /opt/ai-employees/app
tar xzf /tmp/repo.tar.gz --strip-components=1 -C /opt/ai-employees/app
rm /tmp/repo.tar.gz

cd /opt/ai-employees/app
cp /opt/ai-employees/.env .env

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
ExecStart=/usr/bin/node apps/worker/dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVCEOF

# Kill placeholder health server and start real services
kill \$HEALTH_PID 2>/dev/null || true
sleep 1

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

# If we get here, real API didn't come up — restart placeholder
report "phase2-ready" "error" "API failed on port 3001 after 60s"
echo "API service logs:" >> /var/log/ai-employees-init.log
journalctl -u ai-employees-api --no-pager -n 50 >> /var/log/ai-employees-init.log 2>&1
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
  if (company.dropletStatus === "active") throw new Error("Company already has an active droplet");
  if (company.dropletStatus === "provisioning") throw new Error("Droplet is already being provisioned");

  const interserviceSecret = crypto.randomBytes(32).toString("hex");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not set");

  const region = company.dropletRegion || "nyc3";
  const size = PLAN_DROPLET_SIZES[company.plan] || PLAN_DROPLET_SIZES.starter;

  const userData = generateCloudInit({
    companySlug: company.slug,
    databaseUrl,
    interserviceSecret,
    platformUrl: process.env.NEXT_PUBLIC_APP_URL || "https://ai-employees-ten.vercel.app",
    repoUrl: REPO_URL,
    repoBranch: REPO_BRANCH,
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

  // Even if already "active", check what phase the API is in
  if (company.dropletStatus === "active" && company.dropletIp) {
    const apiCheck = await checkDropletApi(company.dropletIp, company.interserviceSecret || "");
    return { status: "active", ip: company.dropletIp, phase: apiCheck.phase };
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

/** Get available DO regions */
export async function getRegions(): Promise<Array<{ slug: string; name: string }>> {
  const res = await doFetch("/regions");
  const data = await res.json();
  return data.regions
    .filter((r: { available: boolean }) => r.available)
    .map((r: { slug: string; name: string }) => ({ slug: r.slug, name: r.name }));
}
