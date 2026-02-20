/**
 * Internal task routes — called by AI employee containers from the Docker network.
 *
 * Employees authenticate with their gateway token (OPENCLAW_GATEWAY_TOKEN).
 * The API looks up the employee by token and scopes all task operations to that employee.
 */
import type { FastifyInstance } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import { db, employees, tasks } from "@ai-employees/db";

/** Resolve employee from gateway token in Authorization header */
async function resolveEmployee(authHeader: string | undefined) {
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  if (!token) return null;

  const employee = await db.query.employees.findFirst({
    where: eq(employees.gatewayToken, token),
  });
  return employee || null;
}

export async function taskRoutes(fastify: FastifyInstance) {
  // GET /internal/tasks — list tasks for the authenticated employee
  fastify.get("/internal/tasks", async (request, reply) => {
    const employee = await resolveEmployee(request.headers.authorization);
    if (!employee) return reply.status(401).send({ error: "Unauthorized" });

    const result = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.employeeId, employee.id), eq(tasks.companyId, employee.companyId)))
      .orderBy(desc(tasks.createdAt));

    return { tasks: result };
  });

  // POST /internal/tasks — create a new task (self-reported by employee)
  fastify.post("/internal/tasks", async (request, reply) => {
    const employee = await resolveEmployee(request.headers.authorization);
    if (!employee) return reply.status(401).send({ error: "Unauthorized" });

    const body = request.body as {
      title: string;
      description?: string;
      priority?: string;
      status?: string;
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
        status: body.status || "in_progress",
        source: "employee",
      })
      .returning();

    return reply.status(201).send({ task });
  });

  // PATCH /internal/tasks/:taskId — update a task
  fastify.patch<{ Params: { taskId: string } }>("/internal/tasks/:taskId", async (request, reply) => {
    const employee = await resolveEmployee(request.headers.authorization);
    if (!employee) return reply.status(401).send({ error: "Unauthorized" });

    const { taskId } = request.params;
    const body = request.body as {
      title?: string;
      description?: string;
      status?: string;
      priority?: string;
    };

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.status !== undefined) {
      updates.status = body.status;
      if (body.status === "completed") updates.completedAt = new Date();
    }
    if (body.priority !== undefined) updates.priority = body.priority;

    const [task] = await db
      .update(tasks)
      .set(updates)
      .where(and(eq(tasks.id, taskId), eq(tasks.employeeId, employee.id)))
      .returning();

    if (!task) return reply.status(404).send({ error: "Task not found" });

    return { task };
  });
}
