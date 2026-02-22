/**
 * Task Logging Skill — redirects to the Task Management skill.
 *
 * This is kept for backward compatibility. The full task API reference
 * and workflow instructions are in the task-management skill.
 */

export function generateTaskLoggingSkill(): string {
  return `# Task Logging

You MUST log every piece of work you do. See your **Task Management** skill (\`~/.openclaw/skills/task-management/SKILL.md\`) for the full API reference and workflow.

**Quick reference:**
\`\`\`bash
# Create a task
curl -s -X POST "$BLITZ_API_URL/employee/tasks" \\
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"title": "What you are doing", "priority": "medium", "status": "in_progress"}'

# Update a task
curl -s -X PATCH "$BLITZ_API_URL/employee/tasks/TASK_ID" \\
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"status": "completed", "comment": "Summary of what was done."}'
\`\`\`
`;
}
