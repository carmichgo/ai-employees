#!/bin/bash
#
# DigitalOcean Droplet Setup Script
# Sets up a fresh Ubuntu 22.04+ droplet for running AI Employees backend.
#
# Every droplet created with this script automatically picks up code updates
# within 2 minutes of a push to main. No SSH keys, no webhooks, no manual steps.
#
# Usage:
#   1. Create a droplet (recommended: 4GB RAM / 2 vCPU minimum)
#   2. SSH in: ssh root@<droplet-ip>
#   3. Run: curl -sSL https://raw.githubusercontent.com/carmichgo/ai-employees/main/infrastructure/setup-droplet.sh | bash
#
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/carmichgo/ai-employees.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="/opt/ai-employees/app"

echo "=== AI Employees — DigitalOcean Droplet Setup ==="
echo ""

# ─── 1. System packages ──────────────────────────────────────────────
echo "[1/7] Updating system..."
apt-get update -qq
apt-get upgrade -y -qq

# ─── 2. Docker ────────────────────────────────────────────────────────
echo "[2/7] Installing Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

# ─── 3. Docker Compose plugin ─────────────────────────────────────────
echo "[3/7] Installing Docker Compose..."
if ! docker compose version &> /dev/null; then
  apt-get install -y -qq docker-compose-plugin
fi

# ─── 4. Utilities ─────────────────────────────────────────────────────
echo "[4/7] Installing utilities..."
apt-get install -y -qq git ufw fail2ban

# ─── 5. Firewall ──────────────────────────────────────────────────────
echo "[5/7] Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp    # HTTP (Traefik)
ufw allow 443/tcp   # HTTPS (Traefik)
ufw --force enable

# ─── 6. App directory + env + clone ───────────────────────────────────
echo "[6/7] Setting up application..."
mkdir -p /opt/ai-employees

# Create .env template if it doesn't exist
if [ ! -f /opt/ai-employees/.env ]; then
  GENERATED_JWT_SECRET=$(openssl rand -hex 32)
  GENERATED_ENCRYPTION_KEY=$(openssl rand -hex 32)
  GENERATED_INTERSERVICE_SECRET=$(openssl rand -hex 32)

  cat > /opt/ai-employees/.env << ENVEOF
# === AI Employees Backend — Environment Variables ===

# Database — your Neon Postgres URL (same as Vercel)
DATABASE_URL=

# Redis — internal, set automatically by docker-compose
REDIS_URL=redis://redis:6379

# Auth
JWT_SECRET=${GENERATED_JWT_SECRET}
JWT_EXPIRES_IN=7d
ENCRYPTION_KEY=${GENERATED_ENCRYPTION_KEY}

# Inter-service auth — MUST match the BACKEND_SECRET env var in Vercel
INTERSERVICE_SECRET=${GENERATED_INTERSERVICE_SECRET}

# Blitzer
OPENCLAW_IMAGE=openclaw:latest
OPENCLAW_NETWORK=ai-employees-internal

# API
API_PORT=3001
PLATFORM_URL=https://ai-employees-ten.vercel.app

# Domain for the API (point this DNS A record to this droplet's IP)
API_DOMAIN=api.yourdomain.com

# Let's Encrypt email for SSL certificates
ACME_EMAIL=admin@yourdomain.com
ENVEOF

  echo ""
  echo "=========================================="
  echo " .env file created at /opt/ai-employees/.env"
  echo " IMPORTANT: Edit it now to fill in:"
  echo "   - DATABASE_URL (your Neon Postgres URL)"
  echo "   - API_DOMAIN (your domain)"
  echo "   - ACME_EMAIL (your email)"
  echo ""
  echo " Then copy the INTERSERVICE_SECRET value and"
  echo " add it as BACKEND_SECRET in your Vercel dashboard."
  echo ""
  echo " The generated INTERSERVICE_SECRET is:"
  echo "   ${GENERATED_INTERSERVICE_SECRET}"
  echo "=========================================="
fi

# Clone repo if not already present
if [ ! -d "$APP_DIR" ]; then
  echo "Cloning repository..."
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

# Symlink .env into app dir so docker-compose picks it up
ln -sf /opt/ai-employees/.env "$APP_DIR/.env"

# Write branch file so auto-update knows which branch to track
echo "$BRANCH" > "$APP_DIR/.branch"

# ─── 7. Auto-update timer ─────────────────────────────────────────────
echo "[7/7] Installing auto-update timer..."

# systemd service — checks for new commits and deploys
cat > /etc/systemd/system/ai-employees-update.service << 'EOF'
[Unit]
Description=AI Employees Auto-Update Check
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/opt/ai-employees/app/infrastructure/auto-update.sh
WorkingDirectory=/opt/ai-employees/app
Environment=DEPLOY_BRANCH=main
EOF

# systemd timer — runs every 2 minutes
cat > /etc/systemd/system/ai-employees-update.timer << 'EOF'
[Unit]
Description=AI Employees Auto-Update Timer (every 2 min)

[Timer]
OnBootSec=30s
OnUnitActiveSec=2min
RandomizedDelaySec=30s

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable ai-employees-update.timer
systemctl start ai-employees-update.timer

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Auto-update is ENABLED — this droplet will automatically pick up"
echo "new code within 2 minutes of a push to '$BRANCH'."
echo ""
echo "Next steps:"
echo "  1. Edit /opt/ai-employees/.env with your values"
echo "  2. Start:  cd $APP_DIR && docker compose up -d"
echo "  3. Set BACKEND_URL and BACKEND_SECRET in Vercel env vars"
echo "  4. Point your API_DOMAIN DNS to this droplet's IP"
echo ""
echo "Useful commands:"
echo "  Check update status:  systemctl status ai-employees-update.timer"
echo "  View update logs:     tail -f /var/log/ai-employees-update.log"
echo "  Force update now:     systemctl start ai-employees-update.service"
echo "  Manual deploy:        cd $APP_DIR && bash infrastructure/deploy.sh"
echo ""
