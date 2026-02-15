#!/bin/bash
#
# Auto-Update Check — runs on a timer, checks for new commits, deploys if needed.
# Installed automatically by setup-droplet.sh on every droplet.
#
# This is the mechanism that lets you push code and have ALL droplets
# pick up the update automatically — no SSH, no webhooks, no per-droplet config.
#
set -euo pipefail

APP_DIR="/opt/ai-employees/app"
LOCK_FILE="/tmp/ai-employees-deploy.lock"
LOG_FILE="/var/log/ai-employees-update.log"
BRANCH="${DEPLOY_BRANCH:-main}"

log() {
  echo "[$(date -Iseconds)] $1" >> "$LOG_FILE"
}

# Skip if app not cloned yet
if [ ! -d "$APP_DIR/.git" ]; then
  exit 0
fi

# Skip if another deploy is already running (lock file with PID check)
if [ -f "$LOCK_FILE" ]; then
  LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
  if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
    exit 0
  fi
  # Stale lock — remove it
  rm -f "$LOCK_FILE"
fi

cd "$APP_DIR"

# Read branch from .branch file if it exists
if [ -f ".branch" ]; then
  BRANCH=$(cat .branch)
fi

# Fetch latest from remote
git fetch origin "$BRANCH" >> "$LOG_FILE" 2>&1 || {
  log "git fetch failed (network issue?) — will retry next cycle"
  exit 0
}

# Compare local HEAD with remote
LOCAL=$(git rev-parse HEAD 2>/dev/null)
REMOTE=$(git rev-parse "origin/$BRANCH" 2>/dev/null)

if [ "$LOCAL" = "$REMOTE" ]; then
  # Already up to date — nothing to do
  exit 0
fi

# New commits detected — deploy!
log "Update detected: $LOCAL -> $REMOTE"
log "Deploying $BRANCH..."

# Write lock file with our PID
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

# Run the deploy script
if [ -f "$APP_DIR/infrastructure/deploy.sh" ]; then
  bash "$APP_DIR/infrastructure/deploy.sh" "$BRANCH" >> "$LOG_FILE" 2>&1
  log "Deploy complete"
else
  log "deploy.sh not found — skipping"
fi
