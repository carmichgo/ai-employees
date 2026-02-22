/**
 * Task Management Skill — the single source of truth for how AI employees
 * log, view, create, and update tasks in the company task board.
 *
 * Uses the BLITZ_API_URL + /employee/tasks endpoints (supports categories & comments).
 */

export function generateTaskManagementSkill(): string {
  return `# Task Management & Logging

You MUST log every piece of work you do to the company's task management system. This is not optional — your manager tracks your work through the task dashboard. If you don't log tasks, it looks like you're doing nothing.

## When to Log Tasks

**Always log a task when you:**
- Receive a new assignment or request from your manager or any channel
- Start working on something proactively (research, monitoring, maintenance, etc.)
- Pick up a recurring task (email checks, social media posting, report generation, etc.)
- Begin a significant sub-task within a larger project

**The rule is simple: if you're doing work, there should be a task for it.**

## API Reference

All requests use your gateway token for authentication:
\`\`\`bash
AUTH="Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN"
CT="Content-Type: application/json"
\`\`\`

### List Your Tasks
\`\`\`bash
curl -s "$BLITZ_API_URL/employee/tasks" -H "$AUTH" | jq .
\`\`\`

### Create a Task
\`\`\`bash
curl -s -X POST "$BLITZ_API_URL/employee/tasks" \\
  -H "$AUTH" -H "$CT" \\
  -d '{
    "title": "Brief description of what you are doing",
    "description": "More details about the task",
    "priority": "medium",
    "category": "research",
    "status": "in_progress"
  }' | jq .
\`\`\`

The response includes the task ID — save it so you can update the task later:
\`\`\`json
{ "task": { "id": "uuid-here", "title": "...", "status": "in_progress" } }
\`\`\`

**Priority values:** \`low\`, \`medium\`, \`high\`, \`urgent\`
**Category examples:** \`research\`, \`marketing\`, \`engineering\`, \`content\`, \`admin\`, \`support\`, \`outreach\`

### Update a Task
\`\`\`bash
curl -s -X PATCH "$BLITZ_API_URL/employee/tasks/TASK_ID" \\
  -H "$AUTH" -H "$CT" \\
  -d '{
    "status": "completed",
    "comment": "Summary of what was done and the result."
  }' | jq .
\`\`\`

**Status values:** \`pending\`, \`in_progress\`, \`completed\`, \`blocked\`

## Standard Task Lifecycle

1. **Receive work** — your manager asks you to do something, or you identify work to do
2. **Create task immediately** — log it with status \`in_progress\` and appropriate priority
3. **Do the work** — complete the task using your tools and capabilities
4. **Mark complete** — update the task status to \`completed\` with a comment summarizing the result
5. **Report back** — tell your manager what you did (the task is also visible in the dashboard)

### Example: Manager Asks You to Research Competitors

\`\`\`bash
# Step 1: Create the task immediately
TASK=$(curl -s -X POST "$BLITZ_API_URL/employee/tasks" \\
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"title": "Research top 5 competitors", "description": "Analyze competitor pricing, features, and positioning", "priority": "high", "category": "research"}')

TASK_ID=$(echo "$TASK" | jq -r '.task.id')

# Step 2: Do the research...
# (web search, browse competitor sites, compile findings)

# Step 3: Mark complete when done
curl -s -X PATCH "$BLITZ_API_URL/employee/tasks/$TASK_ID" \\
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"status": "completed", "comment": "Completed analysis of 5 competitors with pricing comparison."}'
\`\`\`

### Blocked Tasks

If you can't complete a task because you need something:

\`\`\`bash
curl -s -X PATCH "$BLITZ_API_URL/employee/tasks/$TASK_ID" \\
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"status": "blocked", "comment": "Need API credentials for the analytics platform to proceed"}'
\`\`\`

Then tell your manager what you need.

## Periodic Task Checking

Check your task board proactively between tasks or when you finish something. When you receive a task board check:

1. Review the listed tasks — understand what's been assigned
2. Pick up tasks you can start — change their status to \`in_progress\`
3. Add a comment explaining your approach for each task you start
4. Don't drop current work — finish what you're doing first if it's urgent

## Best Practices

- **Log tasks immediately** — don't wait until you're done. Create the task as soon as you start working.
- **Use clear, descriptive titles** — "Research competitors" is better than "Research". "Draft Q4 blog post on AI trends" is better than "Write blog post".
- **Update status in real time** — if you get blocked, mark it blocked. When you finish, mark it complete.
- **One task per logical unit of work** — don't create one mega-task for everything. If you're doing three different things, create three tasks.
- **Add meaningful comments** — "Done" is less useful than "Published blog post to /blog/q1-results, 1,200 words"
- **Always mark tasks complete** — don't leave tasks hanging. If you finished the work, close the task.
- **Use categories** to help organize work on the dashboard
- If the API is temporarily unreachable, retry after a few seconds. Don't skip logging the task.
`;
}
