/**
 * Task Logging Skill — teaches AI employees how to log, track, and update
 * their work through the company task board API.
 *
 * This is the essential task logging skill. It covers the core workflow and
 * API reference needed to keep the task board accurate. For advanced features
 * (due dates, recurring tasks, categories), see the Task Management skill.
 */

export function generateTaskLoggingSkill(): string {
  return `# Task Logging

You MUST log every piece of work you do to the company task board. This is non-negotiable — your manager tracks your work through the task dashboard. **If a task is not logged, it did not happen.**

## Why Task Logging Matters

Your task board is the **single source of truth** for all your work. Your manager relies on it to understand your workload, progress, and results. At any moment, someone looking at your task board should have a completely accurate picture of what you're doing, what you've done, and what's left.

## API Authentication

All task API requests use your gateway token:
\`\`\`bash
AUTH="Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN"
CT="Content-Type: application/json"
\`\`\`

## Core Workflow

**Every time you receive work, follow this exact sequence:**

1. **Create a task** immediately (status: \`in_progress\`)
2. **Do the work** — add progress comments on longer tasks
3. **Mark completed** with a summary comment describing the result

### Step 1: Create a Task

\`\`\`bash
TASK=$(curl -s -X POST "$BLITZ_API_URL/employee/tasks" \\
  -H "$AUTH" -H "$CT" \\
  -d '{
    "title": "Brief description of the work",
    "description": "More details about what needs to be done",
    "priority": "medium",
    "category": "research",
    "status": "in_progress"
  }')

TASK_ID=$(echo "$TASK" | jq -r '.task.id')
\`\`\`

**Priority values:** \`low\`, \`medium\`, \`high\`, \`urgent\`
**Status values:** \`pending\`, \`in_progress\`, \`completed\`, \`blocked\`
**Category examples:** \`research\`, \`marketing\`, \`engineering\`, \`content\`, \`admin\`, \`support\`, \`outreach\`

### Step 2: Add Progress Comments

For tasks taking more than a few minutes, add comments describing what you've done and what's next:
\`\`\`bash
curl -s -X PATCH "$BLITZ_API_URL/employee/tasks/$TASK_ID" \\
  -H "$AUTH" -H "$CT" \\
  -d '{"comment": "Found 3 competitors so far, researching pricing pages now"}'
\`\`\`

Progress comments should describe **concrete progress**, not just "still working on it". Do NOT add duplicate comments — only comment when you have genuinely new information.

### Step 3: Mark Completed

\`\`\`bash
curl -s -X PATCH "$BLITZ_API_URL/employee/tasks/$TASK_ID" \\
  -H "$AUTH" -H "$CT" \\
  -d '{"status": "completed", "comment": "Summary of what was done and the result."}'
\`\`\`

Use meaningful completion summaries — "Published blog post to /blog/q1-results, 1,200 words" is better than "Done".

## Listing Your Tasks

Check your current tasks before creating new ones (to avoid duplicates).
**IMPORTANT:** Always include \`recentComments\` — they contain your work history and what was already done:
\`\`\`bash
curl -s "$BLITZ_API_URL/employee/tasks" -H "$AUTH" | jq '.tasks[] | {id, title, status, recentComments}'
\`\`\`

**Read the comments on every task before acting on it.** Comments are your memory across sessions — they tell you what you already did, what your manager told you, and what results were delivered. Never start work on a task without reading its comments first.

## Handling Blocked Tasks

If you can't proceed on a task:

\`\`\`bash
# 1. Mark the task as blocked with an explanation
curl -s -X PATCH "$BLITZ_API_URL/employee/tasks/$TASK_ID" \\
  -H "$AUTH" -H "$CT" \\
  -d '{"status": "blocked", "comment": "Need API credentials for the analytics platform to proceed"}'

# 2. ALWAYS notify your manager immediately — don't just mark it blocked and wait silently
curl -s -X POST "$BLITZ_API_URL/employee/notify-manager" \\
  -H "$AUTH" -H "$CT" \\
  -d '{"message": "I am blocked on [task name]: I need API credentials for the analytics platform. Can you provide these?", "type": "blocker"}'
\`\`\`

**CRITICAL: Never mark a task blocked without also notifying your manager.** They may not check the dashboard frequently.

## When NOT to Create a New Task

- Message starts with \`[Task Board Check]\` — work on your EXISTING pending tasks instead
- Message starts with \`[Recurring Task: ...]\` and includes a \`Task ID:\` — the system already created a task for you, use that ID
- An \`[Inter-team message from ...]\` that is purely informational — only create a task if a colleague is requesting actual work
- You already have an open task for the same request — update it instead of creating a duplicate

## Task Board Checks

When you receive a \`[Task Board Check]\` message, do a full review:

1. List ALL your tasks
2. Update stale \`in_progress\` tasks with a progress comment
3. Pick up \`pending\` tasks you can start
4. Mark any finished tasks as \`completed\`
5. Check if \`blocked\` tasks have been unblocked

## Best Practices

- **Log immediately** — create the task before you start working, not after
- **Use clear titles** — "Research top 5 competitors" not "Research"
- **One task per unit of work** — don't create a mega-task for everything
- **Update in real time** — if you finish, mark it completed right away
- **Never leave tasks hanging** — close completed work, explain abandoned work
- If the API is temporarily unreachable, retry after a few seconds — don't skip logging

For advanced features like due dates, recurring task patterns, and detailed category usage, see the **Task Management** skill (\`~/.openclaw/skills/task-management/SKILL.md\`).
`;
}
