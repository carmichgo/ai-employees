/**
 * Periodic task checker — nudges employees to keep their task board
 * accurate and up to date. The task board is the source of truth for
 * all work — employees must keep it current.
 *
 * Checks for:
 * 1. Pending tasks they haven't started
 * 2. Stale in_progress tasks (no update in 30+ min)
 * 3. Overall task board health — prompts a full review periodically
 *
 * Runs every 5 minutes from the worker process. Throttled to max one nudge
 * per employee per 15 minutes to avoid interrupting ongoing work.
 */

import { eq, and, not, sql, desc } from "drizzle-orm";
import { db, employees, tasks, taskComments } from "@ai-employees/db";
import { networkInterfaces } from "os";

/** Get all local IPv4 addresses for this machine */
function getLocalIps(): string[] {
  const ips: string[] = [];
  const nets = networkInterfaces();
  for (const iface of Object.values(nets)) {
    if (!iface) continue;
    for (const net of iface) {
      if (net.family === "IPv4" && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

/** Track last nudge time per employee to avoid spamming. Resets on worker restart. */
const lastNudge = new Map<string, number>();

const NUDGE_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes — doubled to avoid overlapping with 15-min heartbeat
const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes — tasks not updated in this long are stale

export async function checkPendingTasks(): Promise<void> {
  // Only nudge employees on this droplet — each droplet runs its own worker
  // and can only reach local containers via containerHost.
  const localIps = getLocalIps();

  const activeEmployees = await db.query.employees.findMany({
    where: and(
      eq(employees.status, "active"),
      not(eq(employees.status, "terminated")),
    ),
    columns: {
      id: true,
      name: true,
      dropletIp: true,
      containerHost: true,
      containerPort: true,
      gatewayToken: true,
      modelConfig: true,
      lastRequestSentAt: true,
      lastResponseAt: true,
    },
  });

  const localEmployees = activeEmployees.filter(
    (e) => e.dropletIp && localIps.includes(e.dropletIp),
  );

  for (const employee of localEmployees) {
    try {
      await checkEmployeeTasks(employee);
    } catch (error) {
      console.error(`[task-check] Error checking tasks for ${employee.name} (${employee.id}):`, error);
    }
  }
}

async function checkEmployeeTasks(employee: {
  id: string;
  name: string;
  containerHost: string | null;
  containerPort: number | null;
  gatewayToken: string | null;
  modelConfig: unknown;
  lastRequestSentAt: Date | null;
  lastResponseAt: Date | null;
}) {
  if (!employee.containerHost || !employee.containerPort || !employee.gatewayToken) {
    return; // No container to talk to
  }

  // Check cooldown — don't nudge more than once per 30 minutes
  const lastTime = lastNudge.get(employee.id) || 0;
  if (Date.now() - lastTime < NUDGE_COOLDOWN_MS) {
    return;
  }

  // Skip if the employee was recently prompted by ANY source (heartbeat, chat, trigger)
  // to avoid overlapping with the 15-min heartbeat and causing duplicate work
  if (employee.lastRequestSentAt) {
    const sinceLastRequest = Date.now() - new Date(employee.lastRequestSentAt).getTime();
    if (sinceLastRequest < NUDGE_COOLDOWN_MS) {
      return;
    }
  }

  // Skip if the employee is currently busy (request sent but no response yet)
  if (employee.lastRequestSentAt && employee.lastResponseAt) {
    if (new Date(employee.lastRequestSentAt) > new Date(employee.lastResponseAt)) {
      return; // Still processing a previous request
    }
  }

  // Find pending tasks (any source) for this employee
  const pendingTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      priority: tasks.priority,
      category: tasks.category,
      dueDate: tasks.dueDate,
      source: tasks.source,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.employeeId, employee.id),
        eq(tasks.status, "pending"),
      ),
    );

  // Find stale in_progress tasks (not updated in 30+ min)
  const staleThresholdIso = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();
  const staleTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      priority: tasks.priority,
      category: tasks.category,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.employeeId, employee.id),
        eq(tasks.status, "in_progress"),
        sql`${tasks.updatedAt} < ${staleThresholdIso}::timestamptz`,
      ),
    );

  // Find active in_progress tasks that are NOT stale (recently updated)
  const activeTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      priority: tasks.priority,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.employeeId, employee.id),
        eq(tasks.status, "in_progress"),
        sql`${tasks.updatedAt} >= ${staleThresholdIso}::timestamptz`,
      ),
    );

  // Find blocked tasks
  const blockedTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.employeeId, employee.id),
        eq(tasks.status, "blocked"),
      ),
    );

  if (pendingTasks.length === 0 && staleTasks.length === 0 && blockedTasks.length === 0 && activeTasks.length === 0) {
    return; // Nothing to nudge about
  }

  // Fetch recent comments for all active tasks so the employee has full context.
  // This prevents the #1 context loss issue: employee forgets what the manager told
  // them in comments (e.g. credentials, unblock instructions) after a heartbeat.
  const allTaskIds = [
    ...pendingTasks.map((t) => t.id),
    ...staleTasks.map((t) => t.id),
    ...blockedTasks.map((t) => t.id),
    ...activeTasks.map((t) => t.id),
  ];
  const commentsByTask: Record<string, Array<{ authorType: string; authorName: string; content: string; createdAt: Date | null }>> = {};
  if (allTaskIds.length > 0) {
    const recentComments = await db
      .select({
        taskId: taskComments.taskId,
        authorType: taskComments.authorType,
        authorName: taskComments.authorName,
        content: taskComments.content,
        createdAt: taskComments.createdAt,
      })
      .from(taskComments)
      .where(
        sql`${taskComments.taskId} IN (${sql.join(allTaskIds.map((id) => sql`${id}::uuid`), sql`, `)})`,
      )
      .orderBy(desc(taskComments.createdAt));

    for (const c of recentComments) {
      const arr = commentsByTask[c.taskId] || (commentsByTask[c.taskId] = []);
      if (arr.length < 5) arr.push(c); // last 5 comments per task
    }
    // Reverse to chronological order
    for (const arr of Object.values(commentsByTask)) arr.reverse();
  }

  /** Format recent comments for a task as indented text */
  function formatTaskComments(taskId: string): string {
    const comments = commentsByTask[taskId];
    if (!comments?.length) return "";
    const lines: string[] = ["  **Recent comments:**"];
    for (const c of comments) {
      const who = c.authorType === "manager" ? `🔵 ${c.authorName} (manager)` : `${c.authorName}`;
      // Truncate very long comments to keep the nudge manageable
      const content = c.content.length > 300 ? c.content.slice(0, 300) + "..." : c.content;
      lines.push(`  > **${who}:** ${content}`);
    }
    return lines.join("\n");
  }

  // Build the message
  const parts: string[] = ["[Task Board Check]", ""];
  parts.push("Review your task board and make sure every task reflects reality. Your task board is the **source of truth** for your work — it must always be accurate and up to date.");
  parts.push("");

  if (pendingTasks.length > 0) {
    parts.push(`### ${pendingTasks.length} pending task${pendingTasks.length > 1 ? "s" : ""} waiting for you:`);
    parts.push("");
    for (const t of pendingTasks) {
      let line = `- **${t.title}** (ID: \`${t.id}\`, ${t.priority} priority)`;
      if (t.category) line += ` [${t.category}]`;
      if (t.dueDate) line += ` — due ${new Date(t.dueDate).toLocaleDateString()}`;
      parts.push(line);
      const comments = formatTaskComments(t.id);
      if (comments) parts.push(comments);
    }
    parts.push("");
    parts.push(`Pick up these tasks — update their status to \`in_progress\` and start working on them.`);
    parts.push("");
  }

  if (staleTasks.length > 0) {
    parts.push(`### ${staleTasks.length} stale task${staleTasks.length > 1 ? "s" : ""} (no updates for 30+ minutes):`);
    parts.push("");
    for (const t of staleTasks) {
      const mins = Math.floor((Date.now() - new Date(t.updatedAt).getTime()) / 60_000);
      parts.push(`- **${t.title}** (ID: \`${t.id}\`) — last updated ${mins} min ago`);
      const comments = formatTaskComments(t.id);
      if (comments) parts.push(comments);
    }
    parts.push("");
    parts.push(`For each stale task: add a **progress comment** describing what you've done and what's next, or mark it \`completed\`/\`blocked\` if appropriate.`);
    parts.push("");
  }

  if (blockedTasks.length > 0) {
    parts.push(`### ${blockedTasks.length} blocked task${blockedTasks.length > 1 ? "s" : ""} — check if blockers are resolved:`);
    parts.push("");
    for (const t of blockedTasks) {
      const mins = Math.floor((Date.now() - new Date(t.updatedAt).getTime()) / 60_000);
      parts.push(`- **${t.title}** (ID: \`${t.id}\`) — blocked since ${mins} min ago`);
      const comments = formatTaskComments(t.id);
      if (comments) parts.push(comments);
    }
    parts.push("");
    parts.push(`Check if the blocker has been resolved — **read the comments above carefully**, your manager may have already provided what you need. If resolved, move to \`in_progress\` and continue. If still blocked, add a comment with current status.`);
    parts.push("");
  }

  if (activeTasks.length > 0) {
    parts.push(`### ${activeTasks.length} active task${activeTasks.length > 1 ? "s" : ""} in progress:`);
    parts.push("");
    for (const t of activeTasks) {
      parts.push(`- **${t.title}** (ID: \`${t.id}\`)`);
      const comments = formatTaskComments(t.id);
      if (comments) parts.push(comments);
    }
    parts.push("");
    parts.push(`Make sure these still reflect what you're working on. Add a progress comment if you haven't recently, or mark \`completed\` if done.`);
    parts.push("");
  }

  parts.push("---");
  parts.push("Do NOT create new tasks for this notification. **Review and update your existing tasks:**");
  parts.push("```bash");
  parts.push("# Add a progress comment to a task");
  parts.push(`curl -s -X PATCH "$BLITZ_API_URL/employee/tasks/<TASK_ID>" -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" -H "Content-Type: application/json" -d '{"comment": "Progress update..."}'`);
  parts.push("");
  parts.push("# Mark a task completed");
  parts.push(`curl -s -X PATCH "$BLITZ_API_URL/employee/tasks/<TASK_ID>" -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" -H "Content-Type: application/json" -d '{"status": "completed", "comment": "Summary of result."}'`);
  parts.push("```");

  const message = parts.join("\n");

  try {
    // Mark request sent
    try {
      await db.update(employees).set({ lastRequestSentAt: new Date() } as any).where(eq(employees.id, employee.id));
    } catch { /* column may not exist yet */ }

    const model = (employee.modelConfig as { primary?: string })?.primary || "anthropic/claude-sonnet-4-5-20250929";
    const url = `http://${employee.containerHost}:${employee.containerPort}/v1/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${employee.gatewayToken}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: message }],
        stream: true,
      }),
      signal: AbortSignal.timeout(300_000), // 5 min timeout — employee may need to run commands
    });

    // Drain the stream so the request completes
    if (res.body) {
      const reader = res.body.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    }

    // Mark response received
    try {
      await db.update(employees).set({ lastResponseAt: new Date() } as any).where(eq(employees.id, employee.id));
    } catch { /* column may not exist yet */ }

    if (res.ok) {
      lastNudge.set(employee.id, Date.now());
      const total = pendingTasks.length + staleTasks.length + blockedTasks.length + activeTasks.length;
      console.log(`[task-check] Nudged ${employee.name} about ${total} task(s) (${pendingTasks.length} pending, ${staleTasks.length} stale, ${blockedTasks.length} blocked, ${activeTasks.length} active)`);
    } else {
      console.log(`[task-check] Failed to nudge ${employee.name}: HTTP ${res.status}`);
    }
  } catch (err: unknown) {
    const detail = err instanceof Error
      ? `${err.message}${(err as any).code ? ` (${(err as any).code})` : ""}${(err as any).cause?.message ? ` cause: ${(err as any).cause.message}` : ""}`
      : String(err);
    console.error(`[task-check] Could not reach ${employee.name}'s container at ${employee.containerHost}:${employee.containerPort}: ${detail}`);
  }
}
