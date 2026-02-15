#!/bin/bash
#
# Rolling Deployment Script for AI Employees Droplets
#
# Rebuilds and restarts ONLY the api and worker containers via Docker Compose.
# Employee (Blitzer) containers, Redis, and Traefik are NOT touched.
#
# Usage:
#   ./infrastructure/deploy.sh              # Deploy from current branch
#   ./infrastructure/deploy.sh main         # Deploy from specific branch
#   DEPLOY_LOG=/tmp/deploy.log ./infrastructure/deploy.sh  # Custom log path
#
set -euo pipefail

BRANCH="${1:-}"
APP_DIR="${APP_DIR:-/opt/ai-employees/app}"
LOG_FILE="${DEPLOY_LOG:-/tmp/ai-employees-deploy.log}"

log() {
  local msg="[$(date -Iseconds)] $1"
  echo "$msg" | tee -a "$LOG_FILE"
}

die() {
  log "DEPLOY FAILED: $1"
  exit 1
}

# Determine branch
if [ -z "$BRANCH" ]; then
  if [ -f "$APP_DIR/.branch" ]; then
    BRANCH=$(cat "$APP_DIR/.branch")
  else
    BRANCH=$(cd "$APP_DIR" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
  fi
fi

echo "" >> "$LOG_FILE"
log "========== DEPLOYMENT STARTED =========="
log "Branch: $BRANCH"
log "App dir: $APP_DIR"

# Step 1: Pull latest code
log "[1/5] Pulling latest code..."
cd "$APP_DIR"

if [ -d ".git" ]; then
  git fetch origin "$BRANCH" >> "$LOG_FILE" 2>&1 || die "git fetch failed"
  git reset --hard "origin/$BRANCH" >> "$LOG_FILE" 2>&1 || die "git reset failed"
  COMMIT=$(git rev-parse --short HEAD)
  log "Checked out $BRANCH at $COMMIT"
else
  log "Not a git repo — downloading tarball..."
  curl -sL "https://github.com/carmichgo/ai-employees/archive/refs/heads/${BRANCH}.tar.gz" -o /tmp/repo-update.tar.gz \
    || die "tarball download failed"
  tar xzf /tmp/repo-update.tar.gz --strip-components=1 -C "$APP_DIR" || die "tarball extract failed"
  rm -f /tmp/repo-update.tar.gz
  echo "$BRANCH" > "$APP_DIR/.branch"
  COMMIT="tarball"
  log "Extracted tarball for $BRANCH"
fi

# Step 2: Rebuild Docker images for api and worker
log "[2/5] Building Docker images (api + worker)..."
docker compose build --no-cache api worker >> "$LOG_FILE" 2>&1 || die "docker compose build failed"
log "Docker images rebuilt"

# Step 3: Rolling restart — worker first (processes finish current jobs), then api
log "[3/5] Restarting worker..."
docker compose up -d --no-deps worker >> "$LOG_FILE" 2>&1 || die "worker restart failed"

# Wait for worker to be running
for i in $(seq 1 30); do
  STATUS=$(docker compose ps worker --format '{{.Status}}' 2>/dev/null | head -1)
  if echo "$STATUS" | grep -qi "up"; then
    log "Worker is running"
    break
  fi
  if [ "$i" -eq 30 ]; then
    die "Worker failed to start within 30s"
  fi
  sleep 1
done

log "[4/5] Restarting api..."
docker compose up -d --no-deps api >> "$LOG_FILE" 2>&1 || die "api restart failed"

# Wait for api health check
for i in $(seq 1 30); do
  if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
    log "API is healthy"
    break
  fi
  if [ "$i" -eq 30 ]; then
    log "WARNING: API health check timed out (may still be starting)"
  fi
  sleep 1
done

# Step 5: Cleanup old Docker images
log "[5/5] Cleaning up old images..."
docker image prune -f >> "$LOG_FILE" 2>&1 || true

log "========== DEPLOY COMPLETE ($COMMIT) =========="
log "Employee containers were NOT affected."
log ""

# Print summary of running containers
docker compose ps >> "$LOG_FILE" 2>&1 || true
