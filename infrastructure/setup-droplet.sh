#!/bin/bash
#
# DigitalOcean Droplet Setup Script
# Sets up a fresh Ubuntu 22.04+ droplet for running AI Employees backend
#
# Usage:
#   1. Create a droplet (recommended: 4GB RAM / 2 vCPU minimum)
#   2. SSH in: ssh root@<droplet-ip>
#   3. Run: curl -sSL https://raw.githubusercontent.com/<repo>/main/infrastructure/setup-droplet.sh | bash
#   OR: copy this script and run it
#
set -euo pipefail

echo "=== AI Employees — DigitalOcean Droplet Setup ==="
echo ""

# Update system
echo "[1/6] Updating system..."
apt-get update -qq
apt-get upgrade -y -qq

# Install Docker
echo "[2/6] Installing Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

# Install Docker Compose plugin
echo "[3/6] Installing Docker Compose..."
if ! docker compose version &> /dev/null; then
  apt-get install -y -qq docker-compose-plugin
fi

# Install other tools
echo "[4/6] Installing utilities..."
apt-get install -y -qq git ufw fail2ban

# Configure firewall
echo "[5/6] Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp    # HTTP (Traefik)
ufw allow 443/tcp   # HTTPS (Traefik)
ufw allow 3001/tcp  # API server (WebSocket relay for browser extension)
ufw allow out 25/tcp   # SMTP (outbound)
ufw allow out 465/tcp  # SMTPS (outbound)
ufw allow out 587/tcp  # SMTP submission (outbound)
ufw allow out 993/tcp  # IMAPS (outbound)
ufw --force enable

# Create app directory
echo "[6/6] Setting up app directory..."
mkdir -p /opt/ai-employees
cd /opt/ai-employees

# Create .env template if it doesn't exist
if [ ! -f .env ]; then
  GENERATED_JWT_SECRET=$(openssl rand -hex 32)
  GENERATED_ENCRYPTION_KEY=$(openssl rand -hex 32)
  GENERATED_INTERSERVICE_SECRET=$(openssl rand -hex 32)

  cat > .env << ENVEOF
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

# OpenClaw
OPENCLAW_IMAGE=ghcr.io/carmichgo/openclaw:latest
OPENCLAW_NETWORK=ai-employees-internal

# Google Gemini API (for Nano Banana image gen + Veo 3 video gen)
# Get from: https://aistudio.google.com/apikey
GEMINI_API_KEY=

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

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "  1. Edit /opt/ai-employees/.env with your values"
echo "  2. Clone your repo:  git clone <repo-url> /opt/ai-employees/app"
echo "  3. Start:  cd /opt/ai-employees/app && docker compose up -d"
echo "  4. Set BACKEND_URL and BACKEND_SECRET in Vercel env vars"
echo "  5. Point your API_DOMAIN DNS to this droplet's IP"
echo ""
