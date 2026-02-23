/**
 * Periodic task checker — nudges employees who have pending manager-assigned tasks.
 *
 * Runs every 5 minutes from the worker process. For each active employee with
 * unstarted tasks, sends a gentle "check your task board" message to their
 * container. Throttled to max one nudge per employee per 30 minutes to avoid
 * interrupting ongoing work.
 */

import { eq, and, not } from "drizzle-orm";
import { db, employees, tasks } from "@ai-employees/db";

/** Track last nudge time per employee to avoid spamming. Resets on worker restart. */
const lastNudge = new Map<string, number>();

const NUDGE_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

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

  // Check cooldown — don't nudge more than once per 30 minutes
  const lastTime = lastNudge.get(employee.id) || 0;
  if (Date.now() - lastTime < NUDGE_COOLDOWN_MS) {
    return;
  }

  // Find pending manager-assigned tasks for this employee
  const pendingTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      priority: tasks.priority,
      category: tasks.category,
      dueDate: tasks.dueDate,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.employeeId, employee.id),
        eq(tasks.status, "pending"),
        eq(tasks.source, "manager"),
      ),
    );

  if (pendingTasks.length === 0) {
    return; // No pending tasks — nothing to do
  }

  // Build a summary message with task IDs so the employee can update them directly
  const taskLines = pendingTasks.map((t) => {
    let line = `- **${t.title}** (ID: ${t.id}, ${t.priority} priority)`;
    if (t.category) line += ` [${t.category}]`;
    if (t.dueDate) line += ` — due ${new Date(t.dueDate).toLocaleDateString()}`;
    return line;
  });

  const message = [
    `[Task Board Check]`,
    ``,
    `You have ${pendingTasks.length} pending task${pendingTasks.length > 1 ? "s" : ""} assigned to you:`,
    ``,
    ...taskLines,
    ``,
    `Pick up these existing tasks — update their status to "in_progress" and start working on them.`,
    `Do NOT create new tasks for this notification. These tasks already exist in your task board.`,
    ``,
    `Update a task:`,
    `curl -s -X PATCH "$BLITZ_API_URL/employee/tasks/<TASK_ID>" -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" -H "Content-Type: application/json" -d '{"status": "in_progress", "comment": "Starting work on this."}'`,
  ].join("\n");

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
      console.log(`[task-check] Nudged ${employee.name} about ${pendingTasks.length} pending task(s)`);
    } else {
      console.log(`[task-check] Failed to nudge ${employee.name}: HTTP ${res.status}`);
    }
  } catch {
    console.log(`[task-check] Could not reach ${employee.name}'s container`);
  }
}
