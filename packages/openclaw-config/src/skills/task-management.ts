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
- Pick up a recurring task (email checks, social media posting, report generation, etc.)
- Begin a significant sub-task within a larger project

**The rule is simple: if someone asked you to do work, there should be a task for it.**

**Before creating any task, you MUST run the anti-duplication check:**
1. List ALL existing tasks (all statuses including completed)
2. Read \`recentComments\` on each task to understand what work was actually done
3. Search for similar titles, topics, or overlapping scope
4. If a similar non-completed task exists → PATCH it with updates, don't create new
5. If similar work was already COMPLETED → don't redo it, find genuinely different work
6. Only create a new task if it passes ALL checks above

## API Reference

All requests use your gateway token for authentication:
\`\`\`bash
AUTH="Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN"
CT="Content-Type: application/json"
\`\`\`

### List Your Tasks
\`\`\`bash
curl -s "$BLITZ_API_URL/employee/tasks" -H "$AUTH" | jq '.tasks[] | {id, title, status, priority, recentComments}'
\`\`\`

**CRITICAL: Always read \`recentComments\` on each task before acting.** Comments are your memory — they contain what you already did, what your manager told you, credentials they shared, and results you delivered. If you skip reading comments, you WILL redo work that was already finished.

### Create a Task
\`\`\`bash
curl -s -X POST "$BLITZ_API_URL/employee/tasks" \\
  -H "$AUTH" -H "$CT" \\
  -d '{
    "title": "Brief description of what you are doing",
    "description": "More details about the task",
    "priority": "medium",
    "category": "research",
    "status": "in_progress",
    "dueDate": "2025-03-15T17:00:00Z"
  }' | jq .
\`\`\`

The response includes the task ID — save it so you can update the task later:
\`\`\`json
{ "task": { "id": "uuid-here", "title": "...", "status": "in_progress" } }
\`\`\`

**Priority values:** \`low\`, \`medium\`, \`high\`, \`urgent\`
**Category examples:** \`research\`, \`marketing\`, \`engineering\`, \`content\`, \`admin\`, \`support\`, \`outreach\`
**Due date:** Optional ISO 8601 timestamp. Set when a task has a deadline. Can be updated later via PATCH.

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
2. **Run anti-duplication check** — fetch ALL tasks (all statuses), read their \`recentComments\`, search for similar titles/topics/scope
3. **Decide: create or update?**
   - Similar non-completed task exists → PATCH it (add comment, update description/status)
   - Similar work was already COMPLETED → DON'T create, find genuinely different work
   - Genuinely new work → Create task with status \`in_progress\`
4. **Do the work** — complete the task using your tools and capabilities
5. **Mark complete** — update the task status to \`completed\` with a comment summarizing the result
6. **Report back** — tell your manager what you did (the task is also visible in the dashboard)

**CRITICAL: The anti-duplication check in step 2 is NOT optional.** Every duplicate task you create wastes your manager's time and makes the task board unreliable. When in doubt, update an existing task rather than creating a new one.

### Example: Manager Asks You to Research Competitors

\`\`\`bash
# Create the task and capture the ID — all in ONE exec call
TASK=$(curl -s -X POST "$BLITZ_API_URL/employee/tasks" \\
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"title": "Research top 5 competitors", "description": "Analyze competitor pricing, features, and positioning", "priority": "high", "category": "research"}') && \\
TASK_ID=$(echo "$TASK" | jq -r '.task.id') && echo "Created task: $TASK_ID"
\`\`\`

Do the research (web search, browse competitor sites, compile findings), then:

\`\`\`bash
# Mark complete when done
curl -s -X PATCH "$BLITZ_API_URL/employee/tasks/$TASK_ID" \\
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"status": "completed", "comment": "Completed analysis of 5 competitors with pricing comparison."}'
\`\`\`

### Token Efficiency — Batch Your Commands

**Every tool call costs tokens.** Combine multiple shell commands into a single \`exec\` call using \`&&\`:

\`\`\`bash
# BAD: 3 separate tool calls
exec: curl -s "$BLITZ_API_URL/employee/tasks" -H "$AUTH" | jq ...
exec: cat memory.md
exec: ls workspace/

# GOOD: 1 tool call with separators
exec: echo '=== TASKS ===' && curl -s "$BLITZ_API_URL/employee/tasks" -H "$AUTH" | jq '.tasks[] | {id, title, status}' && echo '=== MEMORY ===' && cat /home/node/.openclaw/workspace/memory.md 2>/dev/null || true
\`\`\`

**Rules:**
- Gather ALL context (tasks + memory + workspace) in one call before deciding what to do
- Use \`echo '=== LABEL ==='\` separators to keep output readable
- Use \`2>/dev/null\` and \`|| true\` so one failure doesn't kill the chain
- Combine task creation + work setup when possible

### Blocked Tasks

If you can't complete a task because you need something:

\`\`\`bash
# 1. Mark the task as blocked
curl -s -X PATCH "$BLITZ_API_URL/employee/tasks/$TASK_ID" \\
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"status": "blocked", "comment": "Need API credentials for the analytics platform to proceed"}'

# 2. ALWAYS notify your manager immediately — don't just mark it blocked and wait silently
curl -s -X POST "$BLITZ_API_URL/employee/notify-manager" \\
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "I am blocked on [task name]: I need API credentials for the analytics platform to proceed. Can you provide these?", "type": "blocker"}'
\`\`\`

**CRITICAL: Never mark a task blocked without also notifying your manager.** Your manager may not check the task board frequently. Sending a notification ensures they see your blocker right away and can unblock you faster.

## Notifying Your Manager

You can send messages to your manager at any time — not just when blocked. Use this to keep them in the loop:

\`\`\`bash
curl -s -X POST "$BLITZ_API_URL/employee/notify-manager" \\
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Your message here", "type": "blocker"}' | jq .
\`\`\`

**Type values:**
- \`blocker\` — You're stuck and need help to proceed
- \`question\` — You have a question that needs a human answer
- \`update\` — Proactive status update on significant progress
- \`fyi\` — Something your manager should know about

**When to notify your manager:**
- **Blocked on a task** — always, immediately
- **Need a decision** that's beyond your authority level
- **Completed a major deliverable** — share the result
- **Found a problem** that your manager should know about
- **Need credentials, access, or permissions** you don't have

## Your Task Board Is Your Source of Truth

Your task board is the **single source of truth** for everything you've done and everything you need to do. Your manager relies on it to understand your workload, progress, and results. A task that's out of date is as bad as a task that doesn't exist.

**Your tasks must ALWAYS reflect reality.** If you finished something, it must be marked \`completed\`. If you're stuck, it must be \`blocked\`. If you're actively working on it, it should have a recent progress comment. At any given moment, someone looking at your task board should have a completely accurate picture of your work.

## Keeping Tasks Up to Date

### Add Progress Comments on Long-Running Tasks
For any task that takes more than a few minutes, add progress comments as you work:
\`\`\`bash
curl -s -X PATCH "$BLITZ_API_URL/employee/tasks/$TASK_ID" \\
  -H "$AUTH" -H "$CT" \\
  -d '{"comment": "Found 3 competitors so far, researching pricing pages now"}'
\`\`\`

Progress comments should describe **what you've done and what's next**, not just "still working on it".

**IMPORTANT: Do NOT add duplicate comments.** If nothing has changed since your last comment, do not add another one. This wastes resources. Only comment when you have genuinely new information — new progress, a new finding, a status change, or a resolved blocker. Repeating "still blocked on X" every heartbeat is wasteful.

### Review Your Tasks Regularly
Every time you finish a task or receive a \`[Task Board Check]\` message:
1. **List all your tasks** — \`curl -s "$BLITZ_API_URL/employee/tasks" -H "$AUTH" | jq '.tasks[] | {id, title, status}'\`
2. **For each in_progress task** — Is it still in progress? Add a progress comment, or mark it \`completed\`/\`blocked\`.
3. **For each pending task** — Can you pick it up now? If yes, start it. If not, leave it pending.
4. **For each blocked task** — Is it still blocked? Has the blocker been resolved? Update accordingly.
5. **Look for missing tasks** — Did you do work that doesn't have a task? Create one retroactively.

### When to Update Tasks
- **Starting work** → Create task with status \`in_progress\`
- **Making progress** → Add a comment describing what you've accomplished
- **Hitting a blocker** → Mark \`blocked\` with a comment explaining what you need, then **notify your manager** via \`/employee/notify-manager\`
- **Finishing work** → Mark \`completed\` with a summary of the result
- **Scope changed** → Update the title/description to reflect reality
- **Between tasks** → Review your entire board and clean up stale entries

## Periodic Task Checking

When you receive a \`[Task Board Check]\` message, treat it as a prompt to do a **full review** of your task board:

1. Review ALL listed tasks — not just the ones mentioned in the message
2. Update any stale tasks with current status and a progress comment
3. Pick up pending tasks you can start — change their status to \`in_progress\` with a comment
4. Mark completed tasks that you forgot to close
5. Don't drop current work — finish what you're doing first if it's urgent

## Best Practices

- **Log tasks immediately** — don't wait until you're done. Create the task as soon as you start working.
- **Use clear, descriptive titles** — "Research competitors" is better than "Research". "Draft Q4 blog post on AI trends" is better than "Write blog post".
- **Update status in real time** — if you get blocked, mark it blocked. When you finish, mark it complete.
- **Add progress comments frequently** — for anything taking more than a few minutes, comment on what you've done and what's next. Think of it as a mini-report.
- **One task per logical unit of work** — don't create one mega-task for everything. If you're doing three different things, create three tasks.
- **Add meaningful completion comments** — "Done" is less useful than "Published blog post to /blog/q1-results, 1,200 words, shared link in Slack"
- **Never leave tasks hanging** — if you finished the work, close the task. If it's been abandoned, mark it complete or blocked with an explanation.
- **Use categories** to help organize work on the dashboard
- If the API is temporarily unreachable, retry after a few seconds. Don't skip logging the task.

## Due Dates

Set a due date when a task has a deadline — either one given by your manager or one you determine is appropriate:

\`\`\`bash
# Set due date when creating a task
curl -s -X POST "$BLITZ_API_URL/employee/tasks" \\
  -H "$AUTH" -H "$CT" \\
  -d '{"title": "Prepare weekly report", "status": "in_progress", "dueDate": "2025-03-15T17:00:00Z"}'

# Update due date on an existing task
curl -s -X PATCH "$BLITZ_API_URL/employee/tasks/$TASK_ID" \\
  -H "$AUTH" -H "$CT" \\
  -d '{"dueDate": "2025-03-16T09:00:00Z"}'

# Clear a due date
curl -s -X PATCH "$BLITZ_API_URL/employee/tasks/$TASK_ID" \\
  -H "$AUTH" -H "$CT" \\
  -d '{"dueDate": null}'
\`\`\`

**When to set due dates:**
- Manager specifies a deadline → use that exact deadline
- Recurring tasks → set the due date for the next occurrence
- Self-initiated tasks with a natural deadline → set one proactively
- If no deadline is mentioned, you can skip the due date — it's optional

## Planning — Stay Proactive, Avoid Repetition

You should always be moving forward — finishing work, picking up the next thing, finding new opportunities. Being proactive is good — but repeating the same work or creating vague busywork is not.

**The #1 rule for avoiding duplicates: ALWAYS review your completed tasks and memory.md before creating anything new.** Your completed tasks tell you what you already did. If something is similar to a completed task, do NOT create it again.

**Plan full scope upfront, then batch:**
- Multi-platform content → handle all platforms together (LinkedIn + X in one pass), not one platform at a time
- Multi-step pipelines → prepare all data/payloads first, then execute in sequence
- API operations → batch creates/updates, don't create a record and then patch it 5 times separately

Self-initiated work is encouraged, but it must:
1. Be **genuinely different** from anything you already completed or have in progress
2. Add **real value** — a clear deliverable, not vague activities like "review things" or "organize workspace"
3. Be **specific and concrete** — "Draft a competitive pricing comparison for X, Y, Z" not "Do some research"

### Break Big Requests Into a Plan

When you receive a large or multi-step request, don't create a single vague task. Break it down into concrete, actionable subtasks:

\`\`\`bash
# Manager says: "Set up our social media presence"
# DON'T: Create one task "Set up social media"
# DO: Create a plan with multiple tasks

curl -s -X POST "$BLITZ_API_URL/employee/tasks" \\
  -H "$AUTH" -H "$CT" \\
  -d '{"title": "Research best social platforms for our industry", "priority": "high", "category": "research", "status": "in_progress"}'

curl -s -X POST "$BLITZ_API_URL/employee/tasks" \\
  -H "$AUTH" -H "$CT" \\
  -d '{"title": "Create Twitter/X account and set up profile", "priority": "high", "category": "marketing", "status": "pending"}'

curl -s -X POST "$BLITZ_API_URL/employee/tasks" \\
  -H "$AUTH" -H "$CT" \\
  -d '{"title": "Create LinkedIn company page", "priority": "high", "category": "marketing", "status": "pending"}'

curl -s -X POST "$BLITZ_API_URL/employee/tasks" \\
  -H "$AUTH" -H "$CT" \\
  -d '{"title": "Draft first week of social media content", "priority": "medium", "category": "content", "status": "pending"}'
\`\`\`

Work on them in order — pick up the next \`pending\` task as soon as you finish the current one.

### Create Follow-Up Tasks

When you complete a task and it naturally leads to a clear next step, you can create a follow-up task — but **always check your existing tasks first** to make sure the follow-up doesn't already exist.

- Finished research? Create a task to write the report (if one doesn't exist).
- Set up an account? Create a task to configure it.
- Hit a milestone? Create tasks for the next phase.

Only create follow-ups for **concrete, actionable work** — not vague ideas. If you're unsure whether a follow-up is needed, check with your manager instead of creating a task.

### When Your Task Board Is Empty

Follow these steps IN ORDER:

**Step 1 — Review what you already did (PREVENT DUPLICATES):**
Look at your COMPLETED tasks. Read your memory.md. Understand what you've already done so you don't create something similar.

**Step 2 — Check for pending work:**
1. **Review memory.md** — did you commit to something you haven't started?
2. **Check email/Slack** — any unread messages requesting work?
3. **Look at completed tasks** — is there a clear, concrete follow-up you haven't done yet?

If you find real work from one of these sources, verify it's not a repeat of something already completed, then create a task and start working.

**Step 3 — Self-initiate valuable work:**
If Step 2 found nothing, think about what you could do to advance your role or company goals. You CAN create a task — but only if it meets all 3 criteria above (genuinely different, adds real value, specific and concrete). If you can't think of something that meets all 3, that's fine — reply HEARTBEAT_OK. Being idle when there's genuinely nothing valuable to do is better than cluttering the board.

### Keep Your Board Clean and Accurate

At any given moment, your task board should show:
- **1-3 \`in_progress\` tasks** — what you are actively working on right now
- **0-5+ \`pending\` tasks** — your upcoming work queue (your plan)
- **\`completed\` tasks** — your track record of delivered work
- **\`blocked\` tasks** — only if you are genuinely waiting on something external

**Always keep moving forward.** If you finish a task and have pending tasks queued, pick up the next one immediately — don't wait for the next heartbeat. If no pending tasks remain, follow the "When Your Task Board Is Empty" steps above. Your manager should see a productive, organized board — not an empty one with no plan and not an overflowing one full of duplicate or vague self-created tasks.

## Large / Multi-Step Tasks (Video Production, Pipelines, etc.)

Some tasks are too large to complete in a single heartbeat cycle. For any task that involves many sequential steps, API calls, or file generation — you MUST use the checkpoint pattern to avoid restarting from scratch:

### 1. Break it into sub-tasks
Instead of one monolithic task, create separate tasks for each phase:
\`\`\`bash
# DON'T: One mega-task "Produce 8-minute video"
# DO: Break into phases
curl -s -X POST "$BLITZ_API_URL/employee/tasks" -H "$AUTH" -H "$CT" \\
  -d '{"title": "Video #1 — Generate static frames (batch 1/3)", "priority": "high", "category": "content", "status": "in_progress"}'
curl -s -X POST "$BLITZ_API_URL/employee/tasks" -H "$AUTH" -H "$CT" \\
  -d '{"title": "Video #1 — Generate video clips via Veo 3", "priority": "high", "category": "content", "status": "pending"}'
curl -s -X POST "$BLITZ_API_URL/employee/tasks" -H "$AUTH" -H "$CT" \\
  -d '{"title": "Video #1 — Generate voiceover audio", "priority": "high", "category": "content", "status": "pending"}'
curl -s -X POST "$BLITZ_API_URL/employee/tasks" -H "$AUTH" -H "$CT" \\
  -d '{"title": "Video #1 — Stitch final video", "priority": "high", "category": "content", "status": "pending"}'
\`\`\`

Each sub-task is small enough to complete within one heartbeat cycle.

### 2. Save per-task checkpoint files
After each meaningful step, write progress to a checkpoint file so you can resume. One JSON file per task — isolated, machine-readable, no risk of one task clobbering another:

\`\`\`bash
mkdir -p /home/node/.openclaw/workspace/checkpoints

# Write/update checkpoint after each step
cat > /home/node/.openclaw/workspace/checkpoints/TASK_ID.json << 'CHECKPOINT'
{
  "taskId": "abc-123",
  "title": "Video #1 — Generate static frames",
  "phase": "frame-generation",
  "totalSteps": 24,
  "completedSteps": ["frame-01", "frame-02", "frame-03", "frame-08"],
  "nextStep": "frame-09",
  "nextStepDetails": "Scene: product demo, prompt: wide shot of dashboard",
  "outputDir": "/home/node/video1/frames/",
  "outputFiles": [
    "/home/node/video1/frames/frame-01.png",
    "/home/node/video1/frames/frame-02.png",
    "/home/node/video1/frames/frame-08.png"
  ],
  "lastUpdated": "2025-03-15T10:00:00Z"
}
CHECKPOINT
\`\`\`

**Update the checkpoint after EVERY meaningful step** — generating a frame, completing an API call, finishing a batch. Delete the checkpoint file when the task is completed.

### 3. ALWAYS check before regenerating
Before generating ANY artifact (frame, clip, audio, file):
1. **Read the checkpoint** — \`cat /home/node/.openclaw/workspace/checkpoints/TASK_ID.json 2>/dev/null\`
2. **Check the output directory** — \`ls /path/to/output/\` to verify files exist on disk
3. **Skip anything that's already done** — move to the next uncompleted step

\`\`\`bash
# Check for checkpoint — tells you exactly where you left off
cat /home/node/.openclaw/workspace/checkpoints/TASK_ID.json 2>/dev/null | jq .
# Verify files exist on disk
ls /home/node/video1/frames/
\`\`\`

If outputs exist, skip regeneration and move to the next step. Never re-generate files that are already on disk.

### 4. Mark sub-tasks complete as you go
Complete each sub-task as you finish it. This gives your manager real-time visibility and prevents you from redoing completed phases.

**The cardinal rule: NEVER restart a pipeline from zero.** Always check what exists, resume from there.

## Recurring Tasks

For work that repeats on a schedule (daily email checks, weekly reports, regular monitoring, etc.):

1. **Create a task for each occurrence** — don't reuse the same task. Each run should be a separate task so the manager can see the history.
2. **Set the due date** to when the recurring task should be completed by.
3. **Use clear titles** that distinguish occurrences — include the date or period: "Weekly Report — Mar 10-14", "Morning Email Check — Mar 15"
4. **Mark completed promptly** — recurring tasks should be quick. Log it, do it, complete it.

**Example: Daily email check**
\`\`\`bash
TASK=$(curl -s -X POST "$BLITZ_API_URL/employee/tasks" \\
  -H "$AUTH" -H "$CT" \\
  -d '{"title": "Morning email check — Mar 15", "priority": "medium", "category": "admin", "status": "in_progress", "dueDate": "2025-03-15T10:00:00Z"}')
TASK_ID=$(echo "$TASK" | jq -r '.task.id')

# ... check emails, respond, etc. ...

curl -s -X PATCH "$BLITZ_API_URL/employee/tasks/$TASK_ID" \\
  -H "$AUTH" -H "$CT" \\
  -d '{"status": "completed", "comment": "Processed 12 emails, replied to 4, flagged 2 for manager review."}'
\`\`\`
`;
}
