/**
 * Schedule trigger executor — fires cron-based triggers and creates recurring tasks.
 *
 * Runs every 60 seconds from the worker process. For each active schedule trigger,
 * evaluates its cron expression against the current time. When a trigger fires:
 *   1. Creates a task record (source: "system", linked via triggerId)
 *   2. Sends the trigger message to the employee's container
 *   3. Updates the trigger's lastRunAt timestamp
 */

import { eq, and } from "drizzle-orm";
import { db, employees, triggers, tasks } from "@ai-employees/db";
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

/**
 * Minimal cron expression matcher.
 * Supports: minute hour day-of-month month day-of-week
 * Supports: numbers, *, ranges (1-5), steps (*​/5), lists (1,3,5)
 */
function cronMatches(cronExpr: string, date: Date): boolean {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 5) return false;

  const fields = [
    { value: date.getMinutes(), max: 59 },    // minute
    { value: date.getHours(), max: 23 },       // hour
    { value: date.getDate(), max: 31 },        // day of month
    { value: date.getMonth() + 1, max: 12 },   // month (1-12)
    { value: date.getDay(), max: 7 },          // day of week (0=Sun, 7=Sun)
  ];

  for (let i = 0; i < 5; i++) {
    if (!fieldMatches(parts[i], fields[i].value, fields[i].max, i === 4)) {
      return false;
    }
  }
  return true;
}

function fieldMatches(pattern: string, value: number, _max: number, isDow: boolean): boolean {
  // Handle lists: "1,3,5"
  if (pattern.includes(",")) {
    return pattern.split(",").some((p) => fieldMatches(p.trim(), value, _max, isDow));
  }

  // Handle steps: "*/5" or "1-10/2"
  if (pattern.includes("/")) {
    const [rangeStr, stepStr] = pattern.split("/");
    const step = parseInt(stepStr, 10);
    if (isNaN(step) || step <= 0) return false;

    if (rangeStr === "*") {
      return value % step === 0;
    }

    if (rangeStr.includes("-")) {
      const [lo, hi] = rangeStr.split("-").map(Number);
      return value >= lo && value <= hi && (value - lo) % step === 0;
    }

    return false;
  }

  // Handle ranges: "1-5"
  if (pattern.includes("-")) {
    const [lo, hi] = pattern.split("-").map(Number);
    if (isDow) {
      // Day of week: handle 0=Sun and 7=Sun
      const v = value === 0 ? 7 : value;
      const l = lo === 0 ? 7 : lo;
      const h = hi === 0 ? 7 : hi;
      return v >= l && v <= h;
    }
    return value >= lo && value <= hi;
  }

  // Wildcard
  if (pattern === "*") return true;

  // Exact match
  const num = parseInt(pattern, 10);
  if (isDow) {
    // 0 and 7 both mean Sunday
    return value === num || (num === 7 && value === 0) || (num === 0 && value === 7);
  }
  return value === num;
}

export async function checkScheduleTriggers(): Promise<void> {
  const now = new Date();

  // Get all enabled schedule triggers
  const scheduleTriggers = await db.query.triggers.findMany({
    where: and(eq(triggers.type, "schedule"), eq(triggers.enabled, true)),
  });

  for (const trigger of scheduleTriggers) {
    try {
      const config = trigger.config as { cron?: string; message?: string };
      if (!config.cron) continue;

      // Check if the cron matches the current minute
      if (!cronMatches(config.cron, now)) continue;

      // Prevent double-firing: skip if lastRunAt is within this same minute
      if (trigger.lastRunAt) {
        const lastRun = new Date(trigger.lastRunAt);
        const diffMs = now.getTime() - lastRun.getTime();
        if (diffMs < 55_000) continue; // Already fired this minute
      }

      // Get the employee — only process if on this droplet
      const employee = await db.query.employees.findFirst({
        where: eq(employees.id, trigger.employeeId),
      });

      if (!employee || employee.status !== "active" || !employee.containerHost) {
        continue;
      }

      // Only fire triggers for employees on this droplet
      const localIps = getLocalIps();
      if (!employee.dropletIp || !localIps.includes(employee.dropletIp)) {
        continue;
      }

      const message = config.message || "Recurring task triggered.";

      // 1. Create a task record linked to this trigger
      const [createdTask] = await db.insert(tasks).values({
        employeeId: trigger.employeeId,
        companyId: trigger.companyId,
        title: trigger.name,
        description: message,
        status: "in_progress",
        priority: "medium",
        source: "system",
        category: "recurring",
        triggerId: trigger.id,
      }).returning({ id: tasks.id });

      const taskId = createdTask?.id || "unknown";

      // 2. Send the message to the employee's container
      try {
        // Mark request sent
        try {
          await db.update(employees).set({ lastRequestSentAt: new Date() } as any).where(eq(employees.id, trigger.employeeId));
        } catch { /* column may not exist yet */ }

        const containerUrl = `http://${employee.containerHost}:${employee.containerPort}/v1/chat/completions`;
        const res = await fetch(containerUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${employee.gatewayToken}`,
          },
          body: JSON.stringify({
            model: (employee.modelConfig as { primary: string }).primary,
            messages: [
              {
                role: "user",
                content: `[Recurring Task: ${trigger.name}]\nTask ID: ${taskId}\n\n${message}\n\nA task has already been created for this in your task board (ID: ${taskId}). Do NOT create a new task. When you finish, update this task to completed using:\ncurl -s -X PATCH "$BLITZ_API_URL/employee/tasks/${taskId}" -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" -H "Content-Type: application/json" -d '{"status": "completed", "comment": "Summary of what was done."}'`,
              },
            ],
          }),
          signal: AbortSignal.timeout(120_000),
        });

        // Mark response received
        try {
          await db.update(employees).set({ lastResponseAt: new Date() } as any).where(eq(employees.id, trigger.employeeId));
        } catch { /* column may not exist yet */ }

        if (!res.ok) {
          console.log(`[schedule] Trigger "${trigger.name}" delivery failed: HTTP ${res.status}`);
        } else {
          console.log(`[schedule] Fired trigger "${trigger.name}" for ${employee.name}`);
        }
      } catch (err) {
        console.log(`[schedule] Could not reach ${employee.name}'s container for trigger "${trigger.name}"`);
      }

      // 3. Update lastRunAt
      await db
        .update(triggers)
        .set({ lastRunAt: now, updatedAt: now })
        .where(eq(triggers.id, trigger.id));
    } catch (error) {
      console.error(`[schedule] Error processing trigger ${trigger.id}:`, error);
    }
  }
}
