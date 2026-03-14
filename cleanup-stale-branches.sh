#!/usr/bin/env bash
# Branch Cleanup Script
# Generated: 2026-03-13
#
# This script deletes stale remote branches that are either:
# 1. Already merged into master
# 2. Stale and superseded by newer work on master
#
# Run this script from a machine with push access to the repository.

set -euo pipefail

echo "=== Deleting merged branches ==="

# These branches are fully merged into master
MERGED_BRANCHES=(
  "claude/add-task-logging-skill-9ODc4"     # Last commit: 2026-03-01 — merged
  "claude/build-new-system-L0OOg"           # Last commit: 2026-02-16 — merged
  "claude/fix-gog-dependency-oKwkv"         # Last commit: 2026-03-04 — merged
  "claude/update-ai-employee-identity-wkasT" # Last commit: 2026-02-20 — merged
)

for branch in "${MERGED_BRANCHES[@]}"; do
  echo "Deleting merged branch: $branch"
  git push origin --delete "$branch" || echo "  WARNING: Failed to delete $branch"
done

echo ""
echo "=== Deleting stale unmerged branches ==="

# These branches have diverged significantly from master and their changes
# have been superseded by newer work landed directly on master.
#
# claude/fix-wizard-box-sizing-m778i:
#   - 4 weeks old, 692 files diverged from master
#   - Contains old WhatsApp QR, provisioning, voice-chat, and infrastructure work
#   - All meaningful changes have been superseded by newer commits on master
#
# claude/update-codebase-Jvs1U:
#   - 8 days old, 167 files diverged from master
#   - Contains mobile responsive design and provisioning retry fixes
#   - Changes not merged but heavily diverged; would need full rebase
#
STALE_BRANCHES=(
  "claude/fix-wizard-box-sizing-m778i"
  "claude/update-codebase-Jvs1U"
)

for branch in "${STALE_BRANCHES[@]}"; do
  echo "Deleting stale branch: $branch"
  git push origin --delete "$branch" || echo "  WARNING: Failed to delete $branch"
done

echo ""
echo "=== Cleanup complete ==="
echo "Deleted ${#MERGED_BRANCHES[@]} merged branches and ${#STALE_BRANCHES[@]} stale branches."
