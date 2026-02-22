/**
 * Task Management Skill — lets AI employees view, create, and update their tasks.
 *
 * Employees can see their assigned tasks, update progress, create self-reported tasks,
 * and add comments — all visible on the company's centralized task board.
 */

export function generateTaskManagementSkill(): string {
  return `# Task Management

You have a centralized task board that your managers use to track your work. You should keep it updated so they always know what you're doing.

## View Your Tasks

List all tasks assigned to you:
\`\`\`bash
curl -s "$BLITZ_API_URL/employee/tasks" \\
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" | jq .
\`\`\`

Returns:
\`\`\`json
{
  "tasks": [
    {
      "id": "uuid",
      "title": "Write blog post about Q1 results",
      "description": "Include revenue numbers and customer growth",
      "status": "in_progress",
      "priority": "high",
      "source": "manager",
      "category": "content",
      "dueDate": "2026-02-20T00:00:00.000Z",
      "createdAt": "2026-02-17T10:00:00.000Z"
    }
  ]
}
\`\`\`

## Create a Task (Self-Reported)

When you start working on something significant, log it as a task so your managers can see it:
\`\`\`bash
curl -s -X POST "$BLITZ_API_URL/employee/tasks" \\
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Researching competitor pricing pages",
    "description": "Analyzing top 5 competitors for pricing strategy",
    "priority": "medium",
    "category": "research",
    "status": "in_progress"
  }' | jq .
\`\`\`

## Update a Task

Update status or add a progress comment:
\`\`\`bash
curl -s -X PATCH "$BLITZ_API_URL/employee/tasks/TASK_ID" \\
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "status": "completed",
    "comment": "Finished the blog post — 1,200 words covering all Q1 metrics."
  }' | jq .
\`\`\`

**Status values:** \`pending\`, \`in_progress\`, \`completed\`, \`blocked\`

**Priority values:** \`low\`, \`medium\`, \`high\`, \`urgent\`

## When to Update Tasks

- **Starting work:** Change status from \`pending\` to \`in_progress\` and add a comment about your approach
- **Making progress:** Add comments with updates (e.g., "Draft completed, reviewing now")
- **Hitting a blocker:** Change status to \`blocked\` and add a comment explaining the issue
- **Finishing:** Change status to \`completed\` and add a summary of what was done
- **Starting something new:** Create a self-reported task so your manager sees it on the board

## Periodic Task Checking

Your system will periodically remind you to check your task board. When you receive a task board check message:

1. **Review the listed tasks** — understand what's been assigned
2. **Pick up tasks** you can start — change their status to \`in_progress\`
3. **Add a comment** explaining your approach for each task you start
4. **Don't drop current work** — finish what you're doing first if it's urgent, then pick up new tasks

You should also check your task board proactively between tasks or when you finish something.

## Best Practices

- **Always check your tasks** when you start working — see if there's anything assigned to you
- **Keep tasks current** — don't leave stale "in progress" tasks hanging around
- **Add meaningful comments** — "Done" is less useful than "Published blog post to /blog/q1-results, 1,200 words"
- **Self-report substantial work** — if you're doing something that takes more than a few minutes, create a task for it
- **Use categories** to help organize work (e.g., "marketing", "research", "engineering", "admin")
- **Prioritize wisely** — if you have multiple pending tasks, start with the highest priority or earliest due date
`;
}
