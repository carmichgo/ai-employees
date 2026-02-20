/**
 * Task Logging Skill — generates SKILL.md content for the OpenClaw container.
 *
 * Teaches AI employees how to log, update, and track their tasks in the company's
 * internal task management system via the platform API.
 *
 * Employees call the droplet API (reachable on the internal Docker network)
 * using their gateway token for authentication.
 */

export function generateTaskLoggingSkill(): string {
  return `# Task Logging

You MUST log every piece of work you do to the company's internal task management system. This is not optional — your manager tracks your work through the task dashboard. If you don't log tasks, it looks like you're doing nothing.

## When to Log Tasks

**Always log a task when you:**
- Receive a new assignment or request from your manager or any channel
- Start working on something proactively (research, monitoring, maintenance, etc.)
- Pick up a recurring task (email checks, social media posting, report generation, etc.)
- Begin a significant sub-task within a larger project

**The rule is simple: if you're doing work, there should be a task for it.**

## Environment Variables

Your task API credentials are available as environment variables:
- \`TASK_API_URL\` — the base URL of the internal API (e.g., \`http://172.18.0.2:3001\`)
- \`EMPLOYEE_ID\` — your unique employee ID
- \`COMPANY_ID\` — your company's ID
- \`OPENCLAW_GATEWAY_TOKEN\` — your auth token for API calls

## API Reference

All requests use your gateway token for authentication:
\`\`\`bash
AUTH_HEADER="Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN"
CONTENT_TYPE="Content-Type: application/json"
\`\`\`

### Create a Task
\`\`\`bash
curl -s -X POST "$TASK_API_URL/internal/tasks" \\
  -H "$AUTH_HEADER" \\
  -H "$CONTENT_TYPE" \\
  -d "{
    \\"title\\": \\"Brief description of what you are doing\\",
    \\"description\\": \\"More details about the task (optional)\\",
    \\"priority\\": \\"medium\\"
  }"
\`\`\`

**Priority values:** \`low\`, \`medium\`, \`high\`, \`urgent\`

The response includes the task ID — save it so you can update the task later:
\`\`\`json
{ "task": { "id": "uuid-here", "title": "...", "status": "in_progress", ... } }
\`\`\`

### Update a Task
\`\`\`bash
curl -s -X PATCH "$TASK_API_URL/internal/tasks/<task-id>" \\
  -H "$AUTH_HEADER" \\
  -H "$CONTENT_TYPE" \\
  -d "{
    \\"status\\": \\"completed\\"
  }"
\`\`\`

**Status values:** \`pending\`, \`in_progress\`, \`completed\`, \`blocked\`

### List Your Tasks
\`\`\`bash
curl -s "$TASK_API_URL/internal/tasks" \\
  -H "$AUTH_HEADER"
\`\`\`

## Workflow

### Standard Task Lifecycle

1. **Receive work** — your manager asks you to do something, or you identify work to do
2. **Create task** — immediately log it with status \`in_progress\` and appropriate priority
3. **Do the work** — complete the task using your tools and capabilities
4. **Mark complete** — update the task status to \`completed\` when done
5. **Report back** — tell your manager what you did (the task is also visible in the dashboard)

### Example: Manager Asks You to Research Competitors

\`\`\`bash
# Step 1: Create the task immediately
TASK=$(curl -s -X POST "$TASK_API_URL/internal/tasks" \\
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"title": "Research top 5 competitors", "description": "Analyze competitor pricing, features, and positioning", "priority": "high"}')

TASK_ID=$(echo "$TASK" | jq -r '.task.id')

# Step 2: Do the research...
# (web search, browse competitor sites, compile findings)

# Step 3: Mark complete when done
curl -s -X PATCH "$TASK_API_URL/internal/tasks/$TASK_ID" \\
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"status": "completed"}'
\`\`\`

### Example: Proactive Work (You Noticed Something to Do)

\`\`\`bash
# You noticed the website has a broken link — fix it and log it
TASK=$(curl -s -X POST "$TASK_API_URL/internal/tasks" \\
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"title": "Fix broken link on homepage", "description": "Found broken link to /pricing during routine check, fixing it", "priority": "medium"}')

TASK_ID=$(echo "$TASK" | jq -r '.task.id')

# ... fix the issue ...

curl -s -X PATCH "$TASK_API_URL/internal/tasks/$TASK_ID" \\
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"status": "completed"}'
\`\`\`

### Blocked Tasks

If you can't complete a task because you need something from your manager or another person:

\`\`\`bash
curl -s -X PATCH "$TASK_API_URL/internal/tasks/$TASK_ID" \\
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"status": "blocked", "description": "Need API credentials for the analytics platform to proceed"}'
\`\`\`

Then tell your manager what you need.

## Best Practices

- **Log tasks immediately** — don't wait until you're done. Create the task as soon as you start working.
- **Use clear, descriptive titles** — "Research competitors" is better than "Research". "Draft Q4 blog post on AI trends" is better than "Write blog post".
- **Update status in real time** — if you get blocked, mark it blocked. When you finish, mark it complete.
- **One task per logical unit of work** — don't create one mega-task for everything. If you're doing three different things, create three tasks.
- **Include helpful descriptions** — add enough context that your manager can understand what the task involves without asking.
- **Always mark tasks complete** — don't leave tasks hanging. If you finished the work, close the task.

## Important Notes

- Tasks you create show as \`source: "employee"\` in the dashboard — this is how your manager knows it was self-reported work
- Your manager can also create tasks for you from the dashboard — those show as \`source: "manager"\`
- The task API is available on the internal network — no internet access needed
- If the API is temporarily unreachable, retry after a few seconds. Don't skip logging the task.
`;
}
