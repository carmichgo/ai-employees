exports.id=123,exports.ids=[123],exports.modules={9608:(a,b,c)=>{"use strict";c.d(b,{nr:()=>h,zF:()=>g});var d=c(48126),e=c(71545);c(81242);let f=new TextEncoder().encode(process.env.JWT_SECRET||"dev-secret-change-me-in-production");async function g(a){return new d.P(a).setProtectedHeader({alg:"HS256"}).setExpirationTime("7d").sign(f)}async function h(a){try{let{payload:b}=await (0,e.V)(a,f);return b}catch{return null}}},10001:(a,b,c)=>{"use strict";c.r(b),c.d(b,{auditLogs:()=>t,channelConnections:()=>r,chatMessages:()=>s,companies:()=>n,employeeSkills:()=>q,employees:()=>p,tasks:()=>v,triggers:()=>u,usageRecords:()=>w,users:()=>o});var d=c(8320),e=c(66799),f=c(44227),g=c(63764),h=c(84482),i=c(34858),j=c(52419),k=c(86874),l=c(23787),m=c(96035);let n=(0,d.cJ)("companies",{id:(0,e.uR)("id").primaryKey().defaultRandom(),name:(0,f.yf)("name",{length:255}).notNull(),slug:(0,f.yf)("slug",{length:100}).unique().notNull(),plan:(0,f.yf)("plan",{length:50}).notNull().default("starter"),maxEmployees:(0,g.nd)("max_employees").notNull().default(50),status:(0,f.yf)("status",{length:20}).notNull().default("active"),settings:(0,h.Fx)("settings").notNull().default({}),createdAt:(0,i.vE)("created_at",{withTimezone:!0}).notNull().defaultNow(),updatedAt:(0,i.vE)("updated_at",{withTimezone:!0}).notNull().defaultNow()}),o=(0,d.cJ)("users",{id:(0,e.uR)("id").primaryKey().defaultRandom(),companyId:(0,e.uR)("company_id").notNull().references(()=>n.id),email:(0,f.yf)("email",{length:255}).unique().notNull(),name:(0,f.yf)("name",{length:255}).notNull(),passwordHash:(0,f.yf)("password_hash",{length:255}).notNull(),role:(0,f.yf)("role",{length:20}).notNull().default("member"),createdAt:(0,i.vE)("created_at",{withTimezone:!0}).notNull().defaultNow()}),p=(0,d.cJ)("employees",{id:(0,e.uR)("id").primaryKey().defaultRandom(),companyId:(0,e.uR)("company_id").notNull().references(()=>n.id),name:(0,f.yf)("name",{length:255}).notNull(),jobTitle:(0,f.yf)("job_title",{length:255}).notNull(),templateId:(0,f.yf)("template_id",{length:100}),avatar:(0,f.yf)("avatar",{length:500}),emoji:(0,f.yf)("emoji",{length:10}).default("\uD83E\uDD16"),tier:(0,f.yf)("tier",{length:20}).notNull().default("junior"),status:(0,f.yf)("status",{length:20}).notNull().default("provisioning"),dropletId:(0,f.yf)("droplet_id",{length:50}),dropletIp:(0,f.yf)("droplet_ip",{length:45}),dropletRegion:(0,f.yf)("droplet_region",{length:20}).default("nyc3"),dropletSize:(0,f.yf)("droplet_size",{length:50}),dropletStatus:(0,f.yf)("droplet_status",{length:20}).default("none"),interserviceSecret:(0,f.yf)("interservice_secret",{length:255}),containerId:(0,f.yf)("container_id",{length:100}),containerName:(0,f.yf)("container_name",{length:255}),containerHost:(0,f.yf)("container_host",{length:255}),containerPort:(0,g.nd)("container_port").default(18789),gatewayToken:(0,f.yf)("gateway_token",{length:500}),modelConfig:(0,h.Fx)("model_config").notNull().default({primary:"anthropic/claude-opus-4-6"}),persona:(0,j.Qq)("persona"),goals:(0,j.Qq)("goals"),personalityConfig:(0,h.Fx)("personality_config").notNull().default({autonomy:"high",proactivity:"proactive",communication:"concise"}),toolsConfig:(0,h.Fx)("tools_config").notNull().default({}),sandboxConfig:(0,h.Fx)("sandbox_config").notNull().default({}),emailAddress:(0,f.yf)("email_address",{length:255}),phoneNumber:(0,f.yf)("phone_number",{length:20}),provisionedAccounts:(0,h.Fx)("provisioned_accounts").notNull().default({}),credentials:(0,h.Fx)("credentials").notNull().default([]),configHash:(0,f.yf)("config_hash",{length:64}),lastHealthAt:(0,i.vE)("last_health_at",{withTimezone:!0}),errorMessage:(0,j.Qq)("error_message"),createdAt:(0,i.vE)("created_at",{withTimezone:!0}).notNull().defaultNow(),updatedAt:(0,i.vE)("updated_at",{withTimezone:!0}).notNull().defaultNow()}),q=(0,d.cJ)("employee_skills",{id:(0,e.uR)("id").primaryKey().defaultRandom(),employeeId:(0,e.uR)("employee_id").notNull().references(()=>p.id,{onDelete:"cascade"}),skillSlug:(0,f.yf)("skill_slug",{length:255}).notNull(),source:(0,f.yf)("source",{length:50}).notNull().default("clawhub"),enabled:(0,k.zM)("enabled").notNull().default(!0),config:(0,h.Fx)("config").notNull().default({}),createdAt:(0,i.vE)("created_at",{withTimezone:!0}).notNull().defaultNow()},a=>[(0,l.Am)("uq_employee_skill").on(a.employeeId,a.skillSlug)]),r=(0,d.cJ)("channel_connections",{id:(0,e.uR)("id").primaryKey().defaultRandom(),employeeId:(0,e.uR)("employee_id").notNull().references(()=>p.id,{onDelete:"cascade"}),channelType:(0,f.yf)("channel_type",{length:50}).notNull(),name:(0,f.yf)("name",{length:255}).notNull(),credentials:(0,h.Fx)("credentials").notNull().default({}),config:(0,h.Fx)("config").notNull().default({}),status:(0,f.yf)("status",{length:20}).notNull().default("pending"),createdAt:(0,i.vE)("created_at",{withTimezone:!0}).notNull().defaultNow(),updatedAt:(0,i.vE)("updated_at",{withTimezone:!0}).notNull().defaultNow()}),s=(0,d.cJ)("chat_messages",{id:(0,e.uR)("id").primaryKey().defaultRandom(),employeeId:(0,e.uR)("employee_id").notNull().references(()=>p.id,{onDelete:"cascade"}),userId:(0,e.uR)("user_id").notNull().references(()=>o.id),role:(0,f.yf)("role",{length:20}).notNull(),content:(0,j.Qq)("content").notNull(),mode:(0,f.yf)("mode",{length:20}),createdAt:(0,i.vE)("created_at",{withTimezone:!0}).notNull().defaultNow()}),t=(0,d.cJ)("audit_logs",{id:(0,e.uR)("id").primaryKey().defaultRandom(),companyId:(0,e.uR)("company_id").notNull().references(()=>n.id),userId:(0,e.uR)("user_id").references(()=>o.id),action:(0,f.yf)("action",{length:100}).notNull(),resourceType:(0,f.yf)("resource_type",{length:50}).notNull(),resourceId:(0,e.uR)("resource_id").notNull(),details:(0,h.Fx)("details").notNull().default({}),createdAt:(0,i.vE)("created_at",{withTimezone:!0}).notNull().defaultNow()}),u=(0,d.cJ)("triggers",{id:(0,e.uR)("id").primaryKey().defaultRandom(),employeeId:(0,e.uR)("employee_id").notNull().references(()=>p.id,{onDelete:"cascade"}),companyId:(0,e.uR)("company_id").notNull().references(()=>n.id),type:(0,f.yf)("type",{length:20}).notNull(),name:(0,f.yf)("name",{length:255}).notNull(),config:(0,h.Fx)("config").notNull().default({}),enabled:(0,k.zM)("enabled").notNull().default(!0),webhookToken:(0,f.yf)("webhook_token",{length:100}),lastRunAt:(0,i.vE)("last_run_at",{withTimezone:!0}),createdAt:(0,i.vE)("created_at",{withTimezone:!0}).notNull().defaultNow(),updatedAt:(0,i.vE)("updated_at",{withTimezone:!0}).notNull().defaultNow()}),v=(0,d.cJ)("tasks",{id:(0,e.uR)("id").primaryKey().defaultRandom(),employeeId:(0,e.uR)("employee_id").notNull().references(()=>p.id,{onDelete:"cascade"}),companyId:(0,e.uR)("company_id").notNull().references(()=>n.id),title:(0,f.yf)("title",{length:500}).notNull(),description:(0,j.Qq)("description"),status:(0,f.yf)("status",{length:20}).notNull().default("pending"),priority:(0,f.yf)("priority",{length:20}).notNull().default("medium"),source:(0,f.yf)("source",{length:20}).notNull().default("manager"),completedAt:(0,i.vE)("completed_at",{withTimezone:!0}),createdAt:(0,i.vE)("created_at",{withTimezone:!0}).notNull().defaultNow(),updatedAt:(0,i.vE)("updated_at",{withTimezone:!0}).notNull().defaultNow()}),w=(0,d.cJ)("usage_records",{id:(0,e.uR)("id").primaryKey().defaultRandom(),companyId:(0,e.uR)("company_id").notNull().references(()=>n.id),employeeId:(0,e.uR)("employee_id").references(()=>p.id),metric:(0,f.yf)("metric",{length:50}).notNull(),value:(0,m.o)("value",{mode:"number"}).notNull(),periodStart:(0,i.vE)("period_start",{withTimezone:!0}).notNull(),periodEnd:(0,i.vE)("period_end",{withTimezone:!0}).notNull(),createdAt:(0,i.vE)("created_at",{withTimezone:!0}).notNull().defaultNow()})},25344:(a,b,c)=>{"use strict";c.d(b,{$0:()=>r,B1:()=>q,Ne:()=>p,XT:()=>m,nh:()=>v,ue:()=>s});var d=c(77598),e=c.n(d),f=c(49175),g=c(71384),h=c(10001),i=c(66708);let j=(process.env.DO_API_TOKEN||"").trim(),k=process.env.REPO_URL||"https://github.com/carmichgo/ai-employees.git",l=(process.env.VERCEL_GIT_COMMIT_REF||"claude/fix-wizard-box-sizing-m778i").trim();function m(){return!!j}async function n(a,b={}){if(!j)throw Error("DO_API_TOKEN not configured");let c=await fetch(`https://api.digitalocean.com/v2${a}`,{...b,headers:{"Content-Type":"application/json",Authorization:`Bearer ${j}`,...b.headers}});if(!c.ok)throw Error((await c.json().catch(()=>({message:c.statusText}))).message||`DO API error: ${c.status}`);return c}let o={junior:"s-2vcpu-4gb",senior:"s-2vcpu-4gb",expert:"s-4vcpu-8gb"};async function p(a){let[b]=await g.db.select().from(h.employees).where((0,f.eq)(h.employees.id,a)).limit(1);if(!b)throw Error("Employee not found");if("provisioning"===b.dropletStatus)throw Error("Droplet is already being provisioned");if("active"===b.dropletStatus&&b.dropletId)try{throw await n(`/droplets/${b.dropletId}`),Error("Employee already has an active droplet")}catch(b){if(b.message.includes("already has an active droplet"))throw b;await g.db.update(h.employees).set({dropletId:null,dropletIp:null,dropletStatus:"destroyed",interserviceSecret:null,updatedAt:new Date}).where((0,f.eq)(h.employees.id,a))}let[c]=await g.db.select().from(h.companies).where((0,f.eq)(h.companies.id,b.companyId)).limit(1);if(!c)throw Error("Company not found");let d=e().randomBytes(32).toString("hex"),i=(process.env.DATABASE_URL||"").trim();if(!i)throw Error("DATABASE_URL not set");let j=b.dropletRegion||"nyc3",m=o[b.tier]||o.junior,p=(process.env.ANTHROPIC_API_KEY||"").trim(),q=(process.env.BRAVE_API_KEY||"").trim(),r=(process.env.SLACK_APP_TOKEN||"").trim(),s=(process.env.SLACK_SIGNING_SECRET||"").trim(),t=function(a){let b=e().randomBytes(32).toString("hex"),c=e().randomBytes(32).toString("hex"),d=a.databaseUrl.replace(/'/g,"'\\''");return`#!/bin/bash

# === AI Employees — Droplet for ${a.employeeName} (${a.companySlug}) ===

exec > /var/log/ai-employees-init.log 2>&1
echo "Starting cloud-init at $(date)"

# Progress reporting function
report() {
  local step="$1" status="$2" error="\${3:-}"
  echo "[$(date)] STEP=$step STATUS=$status ERROR=$error"
  curl -sf -X POST "${a.platformUrl}/api/companies/droplet/callback" \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Bearer ${a.interserviceSecret}" \\
    -d "{\\"step\\":\\"$step\\",\\"status\\":\\"$status\\",\\"error\\":\\"$error\\"}" \\
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
HEALTH_PID=$!
echo "Placeholder health server started on :3001 (PID $HEALTH_PID)"

# Report Phase 1 ready — marks droplet as active (employee stays provisioning until container is up)
report "ready" "ok"
echo "PHASE1_READY" > /opt/ai-employees/status

# ============================================================
# PHASE 2: Full application setup (runs in background)
# ============================================================

report "phase2-system-update" "started"

# Create 2GB swap — prevents OOM during pnpm install + turbo build
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo "/swapfile swap swap defaults 0 0" >> /etc/fstab
  echo "Swap enabled (2GB)"
fi

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
DATABASE_URL=${d}
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=${b}
JWT_EXPIRES_IN=7d
ENCRYPTION_KEY=${c}
INTERSERVICE_SECRET=${a.interserviceSecret}
OPENCLAW_IMAGE=ghcr.io/openclaw/openclaw:latest
OPENCLAW_NETWORK=ai-employees-internal
API_PORT=3001
PLATFORM_URL=${a.platformUrl}
ANTHROPIC_API_KEY=${a.anthropicApiKey}
BRAVE_API_KEY=${a.braveApiKey}
SLACK_APP_TOKEN=${a.slackAppToken}
SLACK_SIGNING_SECRET=${a.slackSigningSecret}
ENVEOF

# Download repo — try tarball first, then git clone as fallback
TARBALL_URL="https://github.com/carmichgo/ai-employees/archive/refs/heads/${a.repoBranch}.tar.gz"
echo "Downloading from: $TARBALL_URL"

mkdir -p /opt/ai-employees/app
DOWNLOAD_OK=false

# Method 1: curl tarball (verbose error reporting)
HTTP_CODE=$(curl -sL -w "%{http_code}" "$TARBALL_URL" -o /tmp/repo.tar.gz 2>/dev/null)
echo "Tarball download HTTP code: $HTTP_CODE"
if [ "$HTTP_CODE" = "200" ] && [ -s /tmp/repo.tar.gz ]; then
  tar xzf /tmp/repo.tar.gz --strip-components=1 -C /opt/ai-employees/app && DOWNLOAD_OK=true
  rm -f /tmp/repo.tar.gz
fi

# Method 2: git clone if tarball failed
if [ "$DOWNLOAD_OK" = "false" ]; then
  echo "Tarball failed, trying git clone..."
  rm -f /tmp/repo.tar.gz
  if git clone --depth 1 --branch "${a.repoBranch}" "https://github.com/carmichgo/ai-employees.git" /tmp/repo-clone 2>&1; then
    cp -r /tmp/repo-clone/* /opt/ai-employees/app/
    cp -r /tmp/repo-clone/.* /opt/ai-employees/app/ 2>/dev/null || true
    rm -rf /tmp/repo-clone
    DOWNLOAD_OK=true
  fi
fi

# Method 3: wget if both failed
if [ "$DOWNLOAD_OK" = "false" ]; then
  echo "Git clone failed too, trying wget..."
  if wget -q "$TARBALL_URL" -O /tmp/repo.tar.gz 2>&1; then
    tar xzf /tmp/repo.tar.gz --strip-components=1 -C /opt/ai-employees/app && DOWNLOAD_OK=true
    rm -f /tmp/repo.tar.gz
  fi
fi

if [ "$DOWNLOAD_OK" = "false" ]; then
  report "phase2-download" "error" "all download methods failed (HTTP=$HTTP_CODE)"
  echo "PHASE2_FAILED_DOWNLOAD" > /opt/ai-employees/status
  exit 0
fi

cd /opt/ai-employees/app
cp /opt/ai-employees/.env .env
echo "${a.repoBranch}" > .branch

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
kill $HEALTH_PID 2>/dev/null || true
# Also kill by port in case PID is stale
fuser -k 3001/tcp 2>/dev/null || true
sleep 2

# First, test if the API can start at all (capture errors)
echo "Testing API startup..."
cd /opt/ai-employees/app
source /opt/ai-employees/.env
export DATABASE_URL REDIS_URL JWT_SECRET JWT_EXPIRES_IN ENCRYPTION_KEY INTERSERVICE_SECRET OPENCLAW_IMAGE OPENCLAW_NETWORK API_PORT PLATFORM_URL ANTHROPIC_API_KEY BRAVE_API_KEY NODE_ENV=production
timeout 10 /usr/bin/node apps/api/dist/index.js > /tmp/api-test.log 2>&1 &
TEST_PID=$!
sleep 5

if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
  echo "Direct test: API started successfully!"
  kill $TEST_PID 2>/dev/null || true
  fuser -k 3001/tcp 2>/dev/null || true
  sleep 1
else
  echo "Direct test: API failed to start. Output:"
  kill $TEST_PID 2>/dev/null || true
  cat /tmp/api-test.log 2>/dev/null || true
  fuser -k 3001/tcp 2>/dev/null || true
  sleep 1
fi

systemctl daemon-reload
systemctl enable ai-employees-api ai-employees-worker
systemctl start ai-employees-api ai-employees-worker

# Wait for real API to be healthy (up to 60s)
for i in $(seq 1 12); do
  if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
    report "phase2-ready" "ok"
    echo "READY" > /opt/ai-employees/status
    echo "Cloud-init complete at $(date)"
    exit 0
  fi
  echo "Waiting for API... attempt $i/12"
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
`}({employeeName:b.name,companySlug:c.slug,databaseUrl:i,interserviceSecret:d,platformUrl:(process.env.NEXT_PUBLIC_APP_URL||"https://ai-employees-ten.vercel.app").trim(),repoUrl:k,repoBranch:l,anthropicApiKey:p,braveApiKey:q,slackAppToken:r,slackSigningSecret:s}),u=[];try{let a=await n("/account/keys");u=((await a.json()).ssh_keys||[]).map(a=>a.id)}catch{}let v=b.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""),w=await n("/droplets",{method:"POST",body:JSON.stringify({name:`ai-emp-${c.slug}-${v}`,region:j,size:m,image:"ubuntu-24-04-x64",user_data:t,tags:["ai-employees",`company:${c.slug}`,`employee:${v}`],monitoring:!0,...u.length>0?{ssh_keys:u}:{}})}),x=String((await w.json()).droplet.id);return await g.db.update(h.employees).set({dropletId:x,dropletSize:m,dropletRegion:j,dropletStatus:"provisioning",interserviceSecret:d,updatedAt:new Date}).where((0,f.eq)(h.employees.id,a)),{dropletId:x,interserviceSecret:d}}async function q(a){let[b]=await g.db.select().from(h.employees).where((0,f.eq)(h.employees.id,a)).limit(1);if(b?.dropletId){try{await n(`/droplets/${b.dropletId}/actions`,{method:"POST",body:JSON.stringify({type:"shutdown"})})}catch{try{await n(`/droplets/${b.dropletId}/actions`,{method:"POST",body:JSON.stringify({type:"power_off"})})}catch{}}await g.db.update(h.employees).set({dropletStatus:"powered_off",updatedAt:new Date}).where((0,f.eq)(h.employees.id,a))}}async function r(a){let[b]=await g.db.select().from(h.employees).where((0,f.eq)(h.employees.id,a)).limit(1);b?.dropletId&&(await n(`/droplets/${b.dropletId}/actions`,{method:"POST",body:JSON.stringify({type:"power_on"})}),await g.db.update(h.employees).set({dropletStatus:"booting",status:"provisioning",updatedAt:new Date}).where((0,f.eq)(h.employees.id,a)))}async function s(a){let[b]=await g.db.select().from(h.employees).where((0,f.eq)(h.employees.id,a)).limit(1);if(!b||!b.dropletId)return{status:"none",ip:null,phase:null};if("powered_off"===b.dropletStatus)return{status:"powered_off",ip:b.dropletIp,phase:null};if(["active","error","booting"].includes(b.dropletStatus||"")&&b.dropletIp){let c=await u(b.dropletIp);return c.ok&&"ready"===c.phase?("active"!==b.dropletStatus&&await g.db.update(h.employees).set({dropletStatus:"active",updatedAt:new Date}).where((0,f.eq)(h.employees.id,a)),t(b,a,b.dropletIp)):c.ok&&c.phase&&c.phase.startsWith("PHASE2_FAILED")?(await g.db.update(h.employees).set({dropletStatus:"error",errorMessage:c.phase,updatedAt:new Date}).where((0,f.eq)(h.employees.id,a)),{status:"error",ip:b.dropletIp,phase:c.phase}):{status:"booting",ip:b.dropletIp,phase:c.ok?c.phase:null}}try{let c=await n(`/droplets/${b.dropletId}`),d=(await c.json()).droplet,e=d.networks?.v4?.find(a=>"public"===a.type),i=e?.ip_address||null;if("off"===d.status)return{status:"powered_off",ip:i,phase:null};if("active"===d.status&&i){let c=await u(i);if(c.ok&&"ready"===c.phase)return await g.db.update(h.employees).set({dropletIp:i,dropletStatus:"active",updatedAt:new Date}).where((0,f.eq)(h.employees.id,a)),t(b,a,i);if(c.ok&&c.phase&&c.phase.startsWith("PHASE2_FAILED"))return await g.db.update(h.employees).set({dropletIp:i,dropletStatus:"error",errorMessage:c.phase,updatedAt:new Date}).where((0,f.eq)(h.employees.id,a)),{status:"error",ip:i,phase:c.phase};return await g.db.update(h.employees).set({dropletIp:i,updatedAt:new Date}).where((0,f.eq)(h.employees.id,a)),{status:"booting",ip:i,phase:c.ok?c.phase:null}}return{status:"provisioning",ip:i,phase:null}}catch{return await g.db.update(h.employees).set({dropletStatus:"error",updatedAt:new Date}).where((0,f.eq)(h.employees.id,a)),{status:"error",ip:null,phase:null}}}async function t(a,b,c){let d=!!a.containerId,e=a.interserviceSecret;if(d){if("active"===a.status)return{status:"active",ip:c,phase:"ready"};if("onboarding"===a.status)return{status:"provisioning",ip:c,phase:"container-starting"};if("provisioning"===a.status||"paused"===a.status){try{let a=(0,i.A)({url:`http://${c}:3001`,secret:e});await a.resumeEmployee(b),console.log(`[droplet-poll] Triggered container start for ${b} (resume)`)}catch(a){console.error(`[droplet-poll] Failed to start container: ${a.message}`)}return{status:"provisioning",ip:c,phase:"container-starting"}}if("error"===a.status){try{let a=(0,i.A)({url:`http://${c}:3001`,secret:e});await a.provisionContainer(b),console.log(`[droplet-poll] Triggered re-provisioning for ${b} (error recovery)`)}catch(a){console.error(`[droplet-poll] Failed to re-provision container: ${a.message}`)}return{status:"provisioning",ip:c,phase:"container-provisioning"}}return{status:a.status,ip:c,phase:"ready"}}try{let a=(0,i.A)({url:`http://${c}:3001`,secret:e});await a.provisionContainer(b),console.log(`[droplet-poll] Triggered container provisioning for ${b}`)}catch(a){console.error(`[droplet-poll] Failed to trigger container provisioning: ${a.message}`)}return{status:"provisioning",ip:c,phase:"container-provisioning"}}async function u(a){try{let b=new AbortController,c=setTimeout(()=>b.abort(),5e3),d=await fetch(`http://${a}:3001/health`,{signal:b.signal});if(clearTimeout(c),!d.ok)return{ok:!1,phase:null};let e=await d.json().catch(()=>({})),f=e.phase||(e.timestamp?"ready":"unknown");return{ok:!0,phase:f}}catch{return{ok:!1,phase:null}}}async function v(a){let[b]=await g.db.select().from(h.employees).where((0,f.eq)(h.employees.id,a)).limit(1);if(b&&b.dropletId){try{await n(`/droplets/${b.dropletId}`,{method:"DELETE"})}catch{}await g.db.update(h.employees).set({dropletId:null,dropletIp:null,dropletStatus:"destroyed",interserviceSecret:null,updatedAt:new Date}).where((0,f.eq)(h.employees.id,a))}}},53139:()=>{},66708:(a,b,c)=>{"use strict";c.d(b,{A:()=>i,t:()=>g});var d=c(49175),e=c(71384),f=c(10001);async function g(a){let[b]=await e.db.select().from(f.employees).where((0,d.eq)(f.employees.id,a)).limit(1);return b&&"active"===b.dropletStatus&&b.dropletIp&&b.interserviceSecret?{url:`http://${b.dropletIp}:3001`,secret:b.interserviceSecret}:null}async function h(a,b,c={}){let d=`${a.url}${b}`,e={"x-interservice-secret":a.secret};c.body&&(e["Content-Type"]="application/json");let f=await fetch(d,{...c,headers:{...e,...c.headers}});if(!f.ok)throw Error((await f.json().catch(()=>({error:f.statusText}))).error||`Backend error: ${f.status}`);return f}function i(a){return{provisionEmployee:async b=>(await h(a,"/internal/employees/provision",{method:"POST",body:JSON.stringify(b)})).json(),pauseEmployee:async b=>(await h(a,`/internal/employees/${b}/pause`,{method:"POST"})).json(),resumeEmployee:async b=>(await h(a,`/internal/employees/${b}/resume`,{method:"POST"})).json(),terminateEmployee:async b=>(await h(a,`/internal/employees/${b}`,{method:"DELETE"})).json(),getEmployeeStatus:async b=>(await h(a,`/internal/employees/${b}/status`)).json(),connectChannel:async(b,c)=>(await h(a,`/internal/employees/${b}/channels/connect`,{method:"POST",body:JSON.stringify(c)})).json(),provisionContainer:async b=>(await h(a,`/internal/employees/${b}/provision-container`,{method:"POST"})).json(),getWhatsAppQR:async b=>(await h(a,`/internal/employees/${b}/channels/whatsapp/qr`)).json()}}},71384:(a,b,c)=>{"use strict";c.d(b,{db:()=>h});var d=c(88634),e=c(92153),f=c(10001);let g=null,h=new Proxy({},{get:(a,b)=>(function(){if(!g){let a=(0,d.lw)(process.env.DATABASE_URL);g=(0,e.fd)(a,{schema:f})}return g})()[b]})},90091:()=>{}};