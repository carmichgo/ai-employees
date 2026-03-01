/**
 * Employee-facing gateway routes — called FROM inside employee containers.
 * Authenticated via the employee's own OPENCLAW_GATEWAY_TOKEN (not interservice secret).
 *
 * These routes let employees manage their own runtime (restart gateway, etc.)
 * and communicate with teammates — without needing Docker socket or interservice creds.
 */
import type { FastifyInstance } from "fastify";
import { execSync } from "node:child_process";
import { eq, and, ne, desc, sql } from "drizzle-orm";
import { db, employees, tasks, taskComments, chatMessages, users, companies, spreadsheetBases, spreadsheetTables, spreadsheetColumns, spreadsheetRows } from "@ai-employees/db";

/** Authenticate an employee by their gateway token. Returns the employee or sends an error. */
async function authenticateEmployee(request: { headers: { authorization?: string } }, reply: { status: (code: number) => { send: (body: unknown) => unknown } }) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: reply.status(401).send({ error: "Missing Authorization header" }) };
  }
  const token = authHeader.slice(7);

  const employee = await db.query.employees.findFirst({
    where: eq(employees.gatewayToken, token),
  });
  if (!employee) {
    return { error: reply.status(403).send({ error: "Invalid token" }) };
  }

  return { employee };
}

export async function employeeGatewayRoutes(fastify: FastifyInstance) {

  // ─── Gateway Management ──────────────────────────────────────────────

  // POST /employee/restart-gateway — restart the employee's own container
  fastify.post("/employee/restart-gateway", async (request, reply) => {
    const auth = await authenticateEmployee(request, reply);
    if ("error" in auth) return auth.error;
    const { employee } = auth;

    if (!employee.containerName) {
      return reply.status(400).send({ error: "No container provisioned" });
    }

    fastify.log.info(`[restart-gateway] Employee ${employee.name} (${employee.id}) requested gateway restart`);

    try {
      execSync(`docker restart ${employee.containerName}`, { timeout: 30000 });

      await new Promise((r) => setTimeout(r, 3000));
      try {
        const newIp = execSync(
          `docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${employee.containerName}`,
          { timeout: 5000 },
        ).toString().trim();

        if (newIp) {
          await db.update(employees).set({ containerHost: newIp, updatedAt: new Date() }).where(eq(employees.id, employee.id));
        }
      } catch {
        // Non-fatal — IP lookup can fail briefly during restart
      }

      return { success: true, message: "Gateway restarting — you'll be back online in a few seconds." };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      fastify.log.error(`[restart-gateway] Failed for ${employee.id}: ${message}`);
      return reply.status(500).send({ error: `Restart failed: ${message}` });
    }
  });

  // ─── Team Discovery & Communication ──────────────────────────────────

  // GET /employee/team — list teammates (same company, excluding self)
  fastify.get("/employee/team", async (request, reply) => {
    const auth = await authenticateEmployee(request, reply);
    if ("error" in auth) return auth.error;
    const { employee } = auth;

    const teammates = await db.query.employees.findMany({
      where: and(
        eq(employees.companyId, employee.companyId),
        ne(employees.id, employee.id),
        eq(employees.status, "active"),
      ),
      columns: {
        id: true,
        name: true,
        jobTitle: true,
        emoji: true,
        tier: true,
        emailAddress: true,
      },
    });

    return {
      team: teammates.map((t) => ({
        id: t.id,
        name: t.name,
        jobTitle: t.jobTitle,
        emoji: t.emoji || "🤖",
        tier: t.tier,
        email: t.emailAddress,
      })),
    };
  });

  // POST /employee/team/message — send a message to a teammate and get their response
  fastify.post("/employee/team/message", async (request, reply) => {
    const auth = await authenticateEmployee(request, reply);
    if ("error" in auth) return auth.error;
    const sender = auth.employee;

    const body = request.body as {
      to: string; // teammate name or ID
      message: string;
    };

    if (!body.to || !body.message) {
      return reply.status(400).send({ error: "Missing 'to' (teammate name or ID) and 'message' fields" });
    }

    // Find the target teammate — match by name (case-insensitive) or ID, same company
    const allTeammates = await db.query.employees.findMany({
      where: and(
        eq(employees.companyId, sender.companyId),
        ne(employees.id, sender.id),
      ),
    });

    const target = allTeammates.find(
      (t) => t.id === body.to || t.name.toLowerCase() === body.to.toLowerCase(),
    );

    if (!target) {
      return reply.status(404).send({ error: `Teammate "${body.to}" not found` });
    }
    if (target.status !== "active") {
      return reply.status(400).send({ error: `${target.name} is currently ${target.status}` });
    }
    if (!target.containerHost || !target.containerPort) {
      return reply.status(400).send({ error: `${target.name} is not online` });
    }

    // Prefix the message so the recipient knows it's from a teammate, not a human
    const framedMessage = `[Inter-team message from ${sender.name}, ${sender.jobTitle}]\n\n${body.message}`;

    // Send to the target's OpenClaw container via chat completions
    const sendToTarget = async (host: string) => {
      const url = `http://${host}:${target.containerPort}/v1/chat/completions`;
      return fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${target.gatewayToken}`,
        },
        body: JSON.stringify({
          model: (target.modelConfig as { primary: string }).primary,
          messages: [{ role: "user", content: framedMessage }],
        }),
      });
    };

    try {
      // Track request sent to target
      try { await db.update(employees).set({ lastRequestSentAt: new Date() } as any).where(eq(employees.id, target.id)); } catch {}

      let res = await sendToTarget(target.containerHost);

      // If unreachable, try refreshing IP (container may have restarted)
      if (!res.ok && target.containerName) {
        try {
          const newIp = execSync(
            `docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${target.containerName}`,
            { timeout: 5000 },
          ).toString().trim();

          if (newIp && newIp !== target.containerHost) {
            await db.update(employees).set({ containerHost: newIp, updatedAt: new Date() }).where(eq(employees.id, target.id));
            res = await sendToTarget(newIp);
          }
        } catch {
          // IP refresh failed
        }
      }

      // Track response received
      try { await db.update(employees).set({ lastResponseAt: new Date() } as any).where(eq(employees.id, target.id)); } catch {}

      if (!res.ok) {
        const err = await res.text();
        return reply.status(502).send({ error: `${target.name} returned an error: ${err}` });
      }

      const data = await res.json() as { choices?: { message?: { content?: string } }[]; usage?: unknown };
      const responseText = data.choices?.[0]?.message?.content || "No response";

      fastify.log.info(`[team-msg] ${sender.name} → ${target.name}: ${body.message.slice(0, 80)}...`);

      return {
        from: { name: target.name, jobTitle: target.jobTitle, emoji: target.emoji },
        reply: responseText,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: `Could not reach ${target.name}: ${message}` });
    }
  });

  // ─── Task Management ───────────────────────────────────────────────

  // GET /employee/tasks — list this employee's tasks (includes recent comments)
  fastify.get("/employee/tasks", async (request, reply) => {
    const auth = await authenticateEmployee(request, reply);
    if ("error" in auth) return auth.error;
    const { employee } = auth;

    const myTasks = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        status: tasks.status,
        priority: tasks.priority,
        source: tasks.source,
        category: tasks.category,
        dueDate: tasks.dueDate,
        completedAt: tasks.completedAt,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .where(eq(tasks.employeeId, employee.id))
      .orderBy(desc(tasks.createdAt));

    // Fetch recent comments for non-completed tasks so the employee has full
    // context (e.g. manager replies, credentials shared, unblock instructions).
    // This prevents context loss across heartbeats / session resets.
    const activeTaskIds = myTasks
      .filter((t) => t.status !== "completed")
      .map((t) => t.id);

    const commentsByTask: Record<string, Array<{ authorType: string; authorName: string; content: string; createdAt: Date | null }>> = {};
    if (activeTaskIds.length > 0) {
      const allComments = await db
        .select({
          taskId: taskComments.taskId,
          authorType: taskComments.authorType,
          authorName: taskComments.authorName,
          content: taskComments.content,
          createdAt: taskComments.createdAt,
        })
        .from(taskComments)
        .where(
          sql`${taskComments.taskId} IN (${sql.join(activeTaskIds.map((id) => sql`${id}::uuid`), sql`, `)})`,
        )
        .orderBy(desc(taskComments.createdAt));

      // Group by task, keep last 10 comments per task
      for (const c of allComments) {
        const arr = commentsByTask[c.taskId] || (commentsByTask[c.taskId] = []);
        if (arr.length < 10) arr.push(c);
      }
    }

    const tasksWithComments = myTasks.map((t) => ({
      ...t,
      recentComments: (commentsByTask[t.id] || []).reverse(), // chronological
    }));

    return { tasks: tasksWithComments };
  });

  // POST /employee/tasks — create a self-reported task
  fastify.post("/employee/tasks", async (request, reply) => {
    const auth = await authenticateEmployee(request, reply);
    if ("error" in auth) return auth.error;
    const { employee } = auth;

    const body = request.body as {
      title: string;
      description?: string;
      priority?: string;
      category?: string;
      status?: string;
      dueDate?: string;
    };

    if (!body.title) {
      return reply.status(400).send({ error: "title is required" });
    }

    const [task] = await db
      .insert(tasks)
      .values({
        employeeId: employee.id,
        companyId: employee.companyId,
        title: body.title,
        description: body.description || null,
        priority: body.priority || "medium",
        category: body.category || null,
        status: body.status || "in_progress",
        source: "employee",
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
      })
      .returning();

    return { task };
  });

  // PATCH /employee/tasks/:taskId — update own task (status, progress comment)
  fastify.patch<{ Params: { taskId: string } }>("/employee/tasks/:taskId", async (request, reply) => {
    const auth = await authenticateEmployee(request, reply);
    if ("error" in auth) return auth.error;
    const { employee } = auth;

    const { taskId } = request.params;
    const body = request.body as {
      status?: string;
      title?: string;
      description?: string;
      category?: string;
      dueDate?: string;
      comment?: string; // optional progress note
    };

    // Verify this task belongs to the employee
    const [existing] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.employeeId, employee.id)))
      .limit(1);

    if (!existing) {
      return reply.status(404).send({ error: "Task not found" });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status) {
      updates.status = body.status;
      if (body.status === "completed") updates.completedAt = new Date();
    }
    if (body.title) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.category !== undefined) updates.category = body.category;
    if (body.dueDate !== undefined) updates.dueDate = body.dueDate ? new Date(body.dueDate) : null;

    const [task] = await db
      .update(tasks)
      .set(updates)
      .where(eq(tasks.id, taskId))
      .returning();

    // Add progress comment if provided
    if (body.comment) {
      await db.insert(taskComments).values({
        taskId,
        authorType: "employee",
        authorName: employee.name,
        content: body.comment,
      });
    }

    return { task };
  });

  // GET /employee/tasks/:taskId/comments — full comment history for a task
  fastify.get<{ Params: { taskId: string } }>("/employee/tasks/:taskId/comments", async (request, reply) => {
    const auth = await authenticateEmployee(request, reply);
    if ("error" in auth) return auth.error;
    const { employee } = auth;

    const { taskId } = request.params;

    // Verify task belongs to this employee
    const [existing] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.employeeId, employee.id)))
      .limit(1);

    if (!existing) {
      return reply.status(404).send({ error: "Task not found" });
    }

    const comments = await db
      .select({
        id: taskComments.id,
        authorType: taskComments.authorType,
        authorName: taskComments.authorName,
        content: taskComments.content,
        createdAt: taskComments.createdAt,
      })
      .from(taskComments)
      .where(eq(taskComments.taskId, taskId))
      .orderBy(taskComments.createdAt);

    return { comments };
  });

  // ─── Spreadsheet Bases ─────────────────────────────────────────────

  // GET /employee/bases — list all bases for this company
  fastify.get("/employee/bases", async (request, reply) => {
    const auth = await authenticateEmployee(request, reply);
    if ("error" in auth) return auth.error;
    const { employee } = auth;

    const bases = await db
      .select()
      .from(spreadsheetBases)
      .where(eq(spreadsheetBases.companyId, employee.companyId))
      .orderBy(desc(spreadsheetBases.createdAt));

    return { bases };
  });

  // POST /employee/bases — create a new base
  fastify.post("/employee/bases", async (request, reply) => {
    const auth = await authenticateEmployee(request, reply);
    if ("error" in auth) return auth.error;
    const { employee } = auth;

    const body = request.body as { name: string; description?: string; color?: string; icon?: string };
    if (!body.name) {
      return reply.status(400).send({ error: "name is required" });
    }

    const [base] = await db
      .insert(spreadsheetBases)
      .values({
        companyId: employee.companyId,
        name: body.name,
        description: body.description || null,
        color: body.color || "#3b82f6",
        icon: body.icon || "📊",
      })
      .returning();

    return { base };
  });

  // GET /employee/bases/:baseId — get a base with its tables
  fastify.get<{ Params: { baseId: string } }>("/employee/bases/:baseId", async (request, reply) => {
    const auth = await authenticateEmployee(request, reply);
    if ("error" in auth) return auth.error;
    const { employee } = auth;

    const { baseId } = request.params;

    const [base] = await db
      .select()
      .from(spreadsheetBases)
      .where(and(eq(spreadsheetBases.id, baseId), eq(spreadsheetBases.companyId, employee.companyId)))
      .limit(1);

    if (!base) {
      return reply.status(404).send({ error: "Base not found" });
    }

    const tables = await db
      .select({
        id: spreadsheetTables.id,
        name: spreadsheetTables.name,
        description: spreadsheetTables.description,
        baseId: spreadsheetTables.baseId,
        createdAt: spreadsheetTables.createdAt,
        updatedAt: spreadsheetTables.updatedAt,
      })
      .from(spreadsheetTables)
      .where(eq(spreadsheetTables.baseId, baseId))
      .orderBy(desc(spreadsheetTables.createdAt));

    return { base, tables };
  });

  // ─── Spreadsheet Tables ────────────────────────────────────────────

  // GET /employee/tables — list all tables for this company
  fastify.get("/employee/tables", async (request, reply) => {
    const auth = await authenticateEmployee(request, reply);
    if ("error" in auth) return auth.error;
    const { employee } = auth;

    const tables = await db
      .select({
        id: spreadsheetTables.id,
        name: spreadsheetTables.name,
        description: spreadsheetTables.description,
        createdAt: spreadsheetTables.createdAt,
        updatedAt: spreadsheetTables.updatedAt,
      })
      .from(spreadsheetTables)
      .where(eq(spreadsheetTables.companyId, employee.companyId))
      .orderBy(desc(spreadsheetTables.createdAt));

    return { tables };
  });

  // GET /employee/tables/:tableId — get a single table with columns and rows
  fastify.get<{ Params: { tableId: string } }>("/employee/tables/:tableId", async (request, reply) => {
    const auth = await authenticateEmployee(request, reply);
    if ("error" in auth) return auth.error;
    const { employee } = auth;

    const { tableId } = request.params;

    const [table] = await db
      .select()
      .from(spreadsheetTables)
      .where(and(eq(spreadsheetTables.id, tableId), eq(spreadsheetTables.companyId, employee.companyId)))
      .limit(1);

    if (!table) {
      return reply.status(404).send({ error: "Table not found" });
    }

    const cols = await db
      .select()
      .from(spreadsheetColumns)
      .where(eq(spreadsheetColumns.tableId, tableId))
      .orderBy(spreadsheetColumns.position);

    const rows = await db
      .select()
      .from(spreadsheetRows)
      .where(eq(spreadsheetRows.tableId, tableId))
      .orderBy(spreadsheetRows.position);

    return { table, columns: cols, rows };
  });

  // POST /employee/tables — create a new table
  fastify.post("/employee/tables", async (request, reply) => {
    const auth = await authenticateEmployee(request, reply);
    if ("error" in auth) return auth.error;
    const { employee } = auth;

    const body = request.body as {
      name: string;
      description?: string;
      baseId?: string;
      columns?: Array<{ name: string; type?: string; options?: Record<string, unknown> }>;
    };

    if (!body.name) {
      return reply.status(400).send({ error: "name is required" });
    }

    const [table] = await db
      .insert(spreadsheetTables)
      .values({
        companyId: employee.companyId,
        name: body.name,
        description: body.description || null,
        baseId: body.baseId || null,
      })
      .returning();

    // Create initial columns if provided, otherwise create a default "Name" column
    const colDefs = body.columns?.length
      ? body.columns
      : [{ name: "Name", type: "text" }];

    const cols = [];
    for (let i = 0; i < colDefs.length; i++) {
      const [col] = await db
        .insert(spreadsheetColumns)
        .values({
          tableId: table.id,
          name: colDefs[i].name,
          type: colDefs[i].type || "text",
          options: colDefs[i].options || {},
          position: i,
        })
        .returning();
      cols.push(col);
    }

    return { table, columns: cols };
  });

  // PATCH /employee/tables/:tableId — update table name/description
  fastify.patch<{ Params: { tableId: string } }>("/employee/tables/:tableId", async (request, reply) => {
    const auth = await authenticateEmployee(request, reply);
    if ("error" in auth) return auth.error;
    const { employee } = auth;

    const { tableId } = request.params;
    const body = request.body as { name?: string; description?: string };

    const [existing] = await db
      .select({ id: spreadsheetTables.id })
      .from(spreadsheetTables)
      .where(and(eq(spreadsheetTables.id, tableId), eq(spreadsheetTables.companyId, employee.companyId)))
      .limit(1);

    if (!existing) {
      return reply.status(404).send({ error: "Table not found" });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;

    const [table] = await db
      .update(spreadsheetTables)
      .set(updates)
      .where(eq(spreadsheetTables.id, tableId))
      .returning();

    return { table };
  });

  // DELETE /employee/tables/:tableId — delete a table (cascades columns and rows)
  fastify.delete<{ Params: { tableId: string } }>("/employee/tables/:tableId", async (request, reply) => {
    const auth = await authenticateEmployee(request, reply);
    if ("error" in auth) return auth.error;
    const { employee } = auth;

    const { tableId } = request.params;

    const [existing] = await db
      .select({ id: spreadsheetTables.id })
      .from(spreadsheetTables)
      .where(and(eq(spreadsheetTables.id, tableId), eq(spreadsheetTables.companyId, employee.companyId)))
      .limit(1);

    if (!existing) {
      return reply.status(404).send({ error: "Table not found" });
    }

    await db.delete(spreadsheetRows).where(eq(spreadsheetRows.tableId, tableId));
    await db.delete(spreadsheetColumns).where(eq(spreadsheetColumns.tableId, tableId));
    await db.delete(spreadsheetTables).where(eq(spreadsheetTables.id, tableId));

    return { success: true };
  });

  // POST /employee/tables/:tableId/columns — add a column to a table
  fastify.post<{ Params: { tableId: string } }>("/employee/tables/:tableId/columns", async (request, reply) => {
    const auth = await authenticateEmployee(request, reply);
    if ("error" in auth) return auth.error;
    const { employee } = auth;

    const { tableId } = request.params;
    const body = request.body as {
      name: string;
      type?: string;
      options?: Record<string, unknown>;
    };

    if (!body.name) {
      return reply.status(400).send({ error: "name is required" });
    }

    const [table] = await db
      .select({ id: spreadsheetTables.id })
      .from(spreadsheetTables)
      .where(and(eq(spreadsheetTables.id, tableId), eq(spreadsheetTables.companyId, employee.companyId)))
      .limit(1);

    if (!table) {
      return reply.status(404).send({ error: "Table not found" });
    }

    // Get max position
    const existingCols = await db
      .select({ position: spreadsheetColumns.position })
      .from(spreadsheetColumns)
      .where(eq(spreadsheetColumns.tableId, tableId))
      .orderBy(desc(spreadsheetColumns.position))
      .limit(1);

    const nextPos = existingCols.length > 0 ? existingCols[0].position + 1 : 0;

    const [column] = await db
      .insert(spreadsheetColumns)
      .values({
        tableId,
        name: body.name,
        type: body.type || "text",
        options: body.options || {},
        position: nextPos,
      })
      .returning();

    return { column };
  });

  // DELETE /employee/tables/:tableId/columns/:columnId — delete a column
  fastify.delete<{ Params: { tableId: string; columnId: string } }>("/employee/tables/:tableId/columns/:columnId", async (request, reply) => {
    const auth = await authenticateEmployee(request, reply);
    if ("error" in auth) return auth.error;
    const { employee } = auth;

    const { tableId, columnId } = request.params;

    const [table] = await db
      .select({ id: spreadsheetTables.id })
      .from(spreadsheetTables)
      .where(and(eq(spreadsheetTables.id, tableId), eq(spreadsheetTables.companyId, employee.companyId)))
      .limit(1);

    if (!table) {
      return reply.status(404).send({ error: "Table not found" });
    }

    await db.delete(spreadsheetColumns).where(and(eq(spreadsheetColumns.id, columnId), eq(spreadsheetColumns.tableId, tableId)));

    return { success: true };
  });

  // POST /employee/tables/:tableId/rows — add a row
  fastify.post<{ Params: { tableId: string } }>("/employee/tables/:tableId/rows", async (request, reply) => {
    const auth = await authenticateEmployee(request, reply);
    if ("error" in auth) return auth.error;
    const { employee } = auth;

    const { tableId } = request.params;
    const body = request.body as {
      cells?: Record<string, unknown>;
    };

    const [table] = await db
      .select({ id: spreadsheetTables.id })
      .from(spreadsheetTables)
      .where(and(eq(spreadsheetTables.id, tableId), eq(spreadsheetTables.companyId, employee.companyId)))
      .limit(1);

    if (!table) {
      return reply.status(404).send({ error: "Table not found" });
    }

    // Get max position
    const existingRows = await db
      .select({ position: spreadsheetRows.position })
      .from(spreadsheetRows)
      .where(eq(spreadsheetRows.tableId, tableId))
      .orderBy(desc(spreadsheetRows.position))
      .limit(1);

    const nextPos = existingRows.length > 0 ? existingRows[0].position + 1 : 0;

    const [row] = await db
      .insert(spreadsheetRows)
      .values({
        tableId,
        cells: body.cells || {},
        position: nextPos,
      })
      .returning();

    return { row };
  });

  // PATCH /employee/tables/:tableId/rows/:rowId — update row cells
  fastify.patch<{ Params: { tableId: string; rowId: string } }>("/employee/tables/:tableId/rows/:rowId", async (request, reply) => {
    const auth = await authenticateEmployee(request, reply);
    if ("error" in auth) return auth.error;
    const { employee } = auth;

    const { tableId, rowId } = request.params;
    const body = request.body as { cells: Record<string, unknown> };

    if (!body.cells) {
      return reply.status(400).send({ error: "cells is required" });
    }

    const [table] = await db
      .select({ id: spreadsheetTables.id })
      .from(spreadsheetTables)
      .where(and(eq(spreadsheetTables.id, tableId), eq(spreadsheetTables.companyId, employee.companyId)))
      .limit(1);

    if (!table) {
      return reply.status(404).send({ error: "Table not found" });
    }

    // Merge new cells with existing
    const [existing] = await db
      .select({ cells: spreadsheetRows.cells })
      .from(spreadsheetRows)
      .where(and(eq(spreadsheetRows.id, rowId), eq(spreadsheetRows.tableId, tableId)))
      .limit(1);

    if (!existing) {
      return reply.status(404).send({ error: "Row not found" });
    }

    const mergedCells = { ...(existing.cells as Record<string, unknown>), ...body.cells };

    const [row] = await db
      .update(spreadsheetRows)
      .set({ cells: mergedCells, updatedAt: new Date() })
      .where(eq(spreadsheetRows.id, rowId))
      .returning();

    return { row };
  });

  // DELETE /employee/tables/:tableId/rows/:rowId — delete a row
  fastify.delete<{ Params: { tableId: string; rowId: string } }>("/employee/tables/:tableId/rows/:rowId", async (request, reply) => {
    const auth = await authenticateEmployee(request, reply);
    if ("error" in auth) return auth.error;
    const { employee } = auth;

    const { tableId, rowId } = request.params;

    const [table] = await db
      .select({ id: spreadsheetTables.id })
      .from(spreadsheetTables)
      .where(and(eq(spreadsheetTables.id, tableId), eq(spreadsheetTables.companyId, employee.companyId)))
      .limit(1);

    if (!table) {
      return reply.status(404).send({ error: "Table not found" });
    }

    await db.delete(spreadsheetRows).where(and(eq(spreadsheetRows.id, rowId), eq(spreadsheetRows.tableId, tableId)));

    return { success: true };
  });

  // ─── Manager Notification ──────────────────────────────────────────

  // POST /employee/notify-manager — send a proactive message to the manager
  // Creates a chat message visible in the dashboard and posts to Slack if connected
  fastify.post("/employee/notify-manager", async (request, reply) => {
    const auth = await authenticateEmployee(request, reply);
    if ("error" in auth) return auth.error;
    const { employee } = auth;

    const body = request.body as {
      message: string;
      type?: "blocker" | "update" | "question" | "fyi"; // optional categorization
    };

    if (!body.message) {
      return reply.status(400).send({ error: "Missing 'message' field" });
    }

    const msgType = body.type || "update";
    const prefix = msgType === "blocker" ? "[Blocked] "
      : msgType === "question" ? "[Question] "
      : msgType === "fyi" ? "[FYI] "
      : "";

    const fullMessage = `${prefix}${body.message}`;

    // Find the company owner (primary manager) to target the chat message
    const owner = await db.query.users.findFirst({
      where: eq(users.companyId, employee.companyId),
    });

    // 1. Save as a chat message in the dashboard (visible when manager opens employee chat)
    await db.insert(chatMessages).values({
      employeeId: employee.id,
      userId: owner?.id ?? "",
      role: "assistant",
      content: fullMessage,
      mode: "live",
    });

    // 2. Post to Slack if the employee has a dedicated channel
    let slackSent = false;
    try {
      const { getSlackProxy } = await import("../slack/proxy.js");
      const proxy = getSlackProxy();
      if (proxy?.isRunning()) {
        await proxy.postNotification(employee.id, fullMessage);
        slackSent = true;
      }
    } catch {
      // Slack not available — dashboard message is still saved
    }

    fastify.log.info(`[notify-manager] ${employee.name}: ${fullMessage.slice(0, 100)}`);

    return {
      success: true,
      delivered: { dashboard: true, slack: slackSent },
      message: "Manager has been notified.",
    };
  });
}
