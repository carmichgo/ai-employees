/**
 * Restart Gateway Skill — lets the AI employee restart their own OpenClaw gateway.
 *
 * When an employee updates their config (SOUL.md, skills, settings, openclaw.json),
 * they need to restart the gateway for changes to take effect. This skill wraps
 * the internal API call so the employee can do it themselves.
 */

export function generateRestartGatewaySkill(): string {
  return `# Restart Gateway

You can restart your own gateway to apply configuration changes. This is useful after you've modified your SOUL.md, skills, openclaw.json, or other configuration files.

## When to Restart

Restart your gateway when you've made changes to:
- \`~/.openclaw/openclaw.json\` — agent configuration, model settings, tools
- \`~/.openclaw/SOUL.md\` — your identity and behavioral instructions
- \`~/.openclaw/skills/\` — any skill files (SKILL.md)
- Any configuration that only takes effect on startup

**You do NOT need to restart for:**
- Regular workspace file changes (documents, code, data)
- Credential updates via \`cred store\` (takes effect immediately)
- Browser sessions or running tasks

## How to Restart

Run this command:
\`\`\`bash
curl -s -X POST "$BLITZ_API_URL/employee/restart-gateway" \\
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \\
  -H "Content-Type: application/json"
\`\`\`

## What Happens

1. Your container restarts (takes 5-10 seconds)
2. The gateway re-reads all config files from disk
3. You come back online with the updated configuration
4. Your workspace files and credentials are preserved (they're on persistent storage)

## Important Notes

- **You will briefly go offline** during the restart (a few seconds)
- **In-flight conversations will be lost** — finish any active tasks first
- **Workspace data is safe** — all files in your workspace are persisted
- Only restart when you actually need config changes to take effect
- If the restart fails, your container will auto-recover (restart policy is "unless-stopped")
`;
}
