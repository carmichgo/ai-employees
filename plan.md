# Plan: Fix Duplicate Task Creation in Employee Containers

## Problem Summary

AI employees create duplicate tasks because deduplication is purely instructional (RULE #0, AGENTS.md). There is no server-side enforcement. All 3 task creation endpoints (`POST /employee/tasks`, `POST /internal/tasks`, `POST /api/tasks`) blindly insert into the DB with no uniqueness checks. The DB schema has no unique constraint on tasks.

Duplicate task sources:
1. **Heartbeat** (every 30m) — agent context resets, re-creates tasks it already has
2. **Schedule triggers** — create a task server-side, but agent may create a second one anyway
3. **Team messages** — zero task context injected, agent has no idea what tasks already exist
4. **Chat messages** — inject task context, but agent can still ignore it
5. **Task-check nudges** (every 5m, throttled to 45m) — send task list but agent may still create duplicates
6. **Slack messages** — inject memory.md but no task board context

## Fix Strategy

**Server-side deduplication on the task creation endpoints** — this is the only reliable approach since instructional guardrails are unreliable. The fix catches duplicates at the API layer regardless of which message source triggered the creation.

---

## Changes

### 1. Add deduplication logic to `POST /employee/tasks` (employee-gateway.ts:291)

**File**: `apps/api/src/routes/employee-gateway.ts`

Before inserting a new task, query existing non-completed tasks for the same employee and check for title similarity. If a similar active task exists, return the existing task instead of creating a new one (with a flag indicating it was deduplicated).

```typescript
// Before the insert, check for similar active tasks
const existingTasks = await db
  .select({ id: tasks.id, title: tasks.title, status: tasks.status })
  .from(tasks)
  .where(
    and(
      eq(tasks.employeeId, employee.id),
      inArray(tasks.status, ["pending", "in_progress", "blocked"]),
    ),
  );

const normalizedTitle = body.title.trim().toLowerCase();
const duplicate = existingTasks.find((t) => {
  const existingNormalized = t.title.trim().toLowerCase();
  // Exact match or high similarity
  return existingNormalized === normalizedTitle
    || jaroWinkler(existingNormalized, normalizedTitle) > 0.85;
});

if (duplicate) {
  return { task: duplicate, deduplicated: true };
}
```

### 2. Add same deduplication logic to `POST /internal/tasks` (tasks.ts:39)

**File**: `apps/api/src/routes/tasks.ts`

Same logic as above — check for similar active tasks before insert.

### 3. Add a string similarity utility

**File**: `apps/api/src/lib/string-similarity.ts` (new file)

Implement a lightweight Jaro-Winkler similarity function (no external dependency). This handles cases where the AI creates tasks with slightly different titles for the same work (e.g., "Research competitors" vs "Research top competitors").

The function:
- Returns 1.0 for identical strings
- Returns 0.0 for completely different strings
- Threshold of 0.85 catches near-duplicates while allowing genuinely different tasks

### 4. Add recurring task dedup for schedule triggers

**File**: `apps/worker/src/workers/schedule-triggers.ts`

Before creating a new recurring task, check if an active task already exists for the same trigger ID. This prevents the case where a trigger fires, creates a task, the message fails to deliver, and the next trigger fire creates another task.

```typescript
// Check if an active task already exists for this trigger
const existingTriggerTask = await db
  .select({ id: tasks.id, status: tasks.status })
  .from(tasks)
  .where(
    and(
      eq(tasks.employeeId, trigger.employeeId),
      eq(tasks.triggerId, trigger.id),
      inArray(tasks.status, ["pending", "in_progress", "blocked"]),
    ),
  )
  .limit(1);

if (existingTriggerTask.length > 0) {
  // Reuse existing task instead of creating a duplicate
  taskId = existingTriggerTask[0].id;
} else {
  // Create new task as before
}
```

### 5. Inject task context into team messages

**File**: `apps/api/src/routes/employee-gateway.ts` (team/message handler, line 110)

Currently, inter-team messages send a bare `[Inter-team message from ...]` with zero task context. The receiving employee has no idea what tasks they already have. Add a lightweight task summary to the framed message, similar to what the chat endpoint does.

```typescript
// Fetch target's active tasks to inject as context
const targetTasks = await db
  .select({ id: tasks.id, title: tasks.title, status: tasks.status })
  .from(tasks)
  .where(
    and(
      eq(tasks.employeeId, target.id),
      inArray(tasks.status, ["pending", "in_progress", "blocked"]),
    ),
  )
  .limit(10);

let taskBoardContext = "";
if (targetTasks.length > 0) {
  const lines = targetTasks.map((t) => `- [${t.status}] "${t.title}" (id:${t.id.slice(0, 8)})`);
  taskBoardContext = `\n\n[Your current task board — do NOT create duplicate tasks for work already listed here]\n${lines.join("\n")}`;
}

const framedMessage = `[Inter-team message from ${sender.name}, ${sender.jobTitle}]\n\n${body.message}${taskBoardContext}`;
```

### 6. Inject task context into Slack proxy messages

**File**: `apps/api/src/slack/proxy.ts`

Same pattern as above — before sending a Slack message to the container, fetch the employee's active tasks and append as context. This prevents the agent from creating duplicate tasks when receiving Slack messages.

---

## What This Does NOT Change

- **Manager-facing endpoint** (`POST /api/tasks`) — managers should be able to create tasks freely. No dedup here.
- **DB schema** — no unique constraint added (recurring tasks legitimately have the same trigger-based title). Dedup is at the application layer.
- **AGENTS.md / RULE #0** — keep instructional guardrails as defense-in-depth. They still help reduce unnecessary API calls.
- **Task-management skill** — no changes needed. The anti-duplication instructions remain.

## Testing

- Create an employee-sourced task, then try to create another with the same title → should return existing task with `deduplicated: true`
- Create a task, then try a slightly different title (e.g., "Research competitors" → "Research top competitors") → should deduplicate
- Create a genuinely different task → should succeed normally
- Schedule trigger fires twice → second fire should reuse existing task
- Team message to employee with existing tasks → message should include task board context
