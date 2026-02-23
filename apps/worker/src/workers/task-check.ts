/**
 * Periodic task checker — nudges employees about:
 * 1. Pending manager-assigned tasks they haven't started
 * 2. Stale in_progress tasks that haven't been updated in 30+ min
 *
 * Runs every 5 minutes from the worker process. Throttled to max one nudge
 * per employee per 15 minutes to avoid interrupting ongoing work.
 */

import { eq, and, not, sql } from "drizzle-orm";
import { db, employees, tasks } from "@ai-employees/db";

/** Track last nudge time per employee to avoid spamming. Resets on worker restart. */
const lastNudge = new Map<string, number>();

const NUDGE_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes — tasks not updated in this long are stale

export async function checkPendingTasks(): Promise<void> {
  // Get all active employees
  const activeEmployees = await db.query.employees.findMany({
    where: and(
      eq(employees.status, "active"),
      not(eq(employees.status, "terminated")),
    ),
    columns: {
      id: true,
      name: true,
      containerHost: true,
      containerPort: true,
      gatewayToken: true,
      modelConfig: true,
    },
  });

  for (const employee of activeEmployees) {
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
}) {
  if (!employee.containerHost || !employee.containerPort || !employee.gatewayToken) {
    return; // No container to talk to
  }

  // Check cooldown — don't nudge more than once per 15 minutes
  const lastTime = lastNudge.get(employee.id) || 0;
  if (Date.now() - lastTime < NUDGE_COOLDOWN_MS) {
    return;
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
  const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);
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
        sql`${tasks.updatedAt} < ${staleThreshold}`,
      ),
    );

  if (pendingTasks.length === 0 && staleTasks.length === 0) {
    return; // Nothing to nudge about
  }

  // Build the message
  const parts: string[] = ["[Task Board Check]", ""];

  if (pendingTasks.length > 0) {
    parts.push(`**${pendingTasks.length} pending task${pendingTasks.length > 1 ? "s" : ""}** waiting for you:`);
    parts.push("");
    for (const t of pendingTasks) {
      let line = `- **${t.title}** (ID: ${t.id}, ${t.priority} priority)`;
      if (t.category) line += ` [${t.category}]`;
      if (t.dueDate) line += ` — due ${new Date(t.dueDate).toLocaleDateString()}`;
      parts.push(line);
    }
    parts.push("");
    parts.push(`Pick up these tasks — update their status to "in_progress" and start working on them.`);
    parts.push("");
  }

  if (staleTasks.length > 0) {
    parts.push(`**${staleTasks.length} in-progress task${staleTasks.length > 1 ? "s" : ""}** with no updates for 30+ minutes:`);
    parts.push("");
    for (const t of staleTasks) {
      const mins = Math.floor((Date.now() - new Date(t.updatedAt).getTime()) / 60_000);
      parts.push(`- **${t.title}** (ID: ${t.id}) — last updated ${mins} min ago`);
    }
    parts.push("");
    parts.push(`For each stale task: either continue working on it (add a progress comment), or mark it completed/blocked if it's done or stuck.`);
    parts.push("");
  }

  parts.push(`Do NOT create new tasks for this notification. Update the existing ones:`);
  parts.push(`curl -s -X PATCH "$BLITZ_API_URL/employee/tasks/<TASK_ID>" -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" -H "Content-Type: application/json" -d '{"status": "in_progress", "comment": "Progress update..."}'`);

  const message = parts.join("\n");

  try {
    // Mark request sent
    try {
      await db.update(employees).set({ lastRequestSentAt: new Date() } as any).where(eq(employees.id, employee.id));
    } catch { /* column may not exist yet */ }

    const url = `http://${employee.containerHost}:${employee.containerPort}/v1/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${employee.gatewayToken}`,
      },
      body: JSON.stringify({
        model: (employee.modelConfig as { primary: string }).primary,
        messages: [{ role: "user", content: message }],
      }),
      signal: AbortSignal.timeout(120_000), // 2 min timeout — employee may need to run commands
    });

    // Mark response received
    try {
      await db.update(employees).set({ lastResponseAt: new Date() } as any).where(eq(employees.id, employee.id));
    } catch { /* column may not exist yet */ }

    if (res.ok) {
      lastNudge.set(employee.id, Date.now());
      const total = pendingTasks.length + staleTasks.length;
      console.log(`[task-check] Nudged ${employee.name} about ${total} task(s) (${pendingTasks.length} pending, ${staleTasks.length} stale)`);
    } else {
      console.log(`[task-check] Failed to nudge ${employee.name}: HTTP ${res.status}`);
    }
  } catch {
    console.log(`[task-check] Could not reach ${employee.name}'s container`);
  }
}
