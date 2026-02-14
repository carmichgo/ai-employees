import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db, employees, companies } from "@ai-employees/db";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  getJobTemplate,
  getModelForTier,
  type EmployeeTier,
} from "@ai-employees/shared";
import { getProvisionQueue } from "../queues.js";

export async function employeeRoutes(fastify: FastifyInstance) {
  // List all employees for company
  fastify.get(
    "/api/employees",
    { onRequest: [fastify.authenticate] },
    async (request) => {
      const { companyId } = request.user;

      const result = await db.query.employees.findMany({
        where: eq(employees.companyId, companyId),
        orderBy: (e, { desc }) => [desc(e.createdAt)],
      });

      return {
        employees: result.map(sanitizeEmployee),
      };
    },
  );

  // Get employee details
  fastify.get<{ Params: { id: string } }>(
    "/api/employees/:id",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { companyId } = request.user;
      const { id } = request.params;

      const employee = await db.query.employees.findFirst({
        where: and(eq(employees.id, id), eq(employees.companyId, companyId)),
      });

      if (!employee) {
        return reply.status(404).send({ error: "Employee not found" });
      }

      return { employee: sanitizeEmployee(employee) };
    },
  );

  // Hire a new employee
  fastify.post(
    "/api/employees",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { companyId } = request.user;
      const input = createEmployeeSchema.parse(request.body);

      const company = await db.query.companies.findFirst({
        where: eq(companies.id, companyId),
      });
      if (!company) {
        return reply.status(404).send({ error: "Company not found" });
      }

      // If using a template, merge template defaults
      let persona = input.persona;
      let goals = input.goals;
      let emoji = "🤖";

      if (input.templateId) {
        const template = getJobTemplate(input.templateId);
        if (template) {
          persona = persona || template.persona;
          goals = goals || template.goals;
          emoji = template.emoji;
        }
      }

      // Generate gateway token for this employee's OpenClaw instance
      const gatewayToken = crypto.randomBytes(32).toString("hex");

      // Determine model from tier
      const tier = (input.tier || "junior") as EmployeeTier;
      const tierModel = getModelForTier(tier);

      // Create employee record
      const [employee] = await db
        .insert(employees)
        .values({
          companyId,
          name: input.name,
          jobTitle: input.jobTitle,
          templateId: input.templateId,
          tier,
          emoji,
          persona,
          goals,
          modelConfig: input.modelConfig || { primary: tierModel },
          gatewayToken,
          status: "provisioning",
          containerName: `ai-emp-${company.slug}-${slugify(input.name)}-${crypto.randomBytes(3).toString("hex")}`,
        })
        .returning();

      // Queue container provisioning
      const queue = getProvisionQueue();
      await queue.add("provision-employee", {
        employeeId: employee.id,
        companyId,
        channels: input.channels || [],
      });

      return reply.status(201).send({
        employee: sanitizeEmployee(employee),
        message: `${input.name} is being onboarded! They'll be ready in a few moments.`,
      });
    },
  );

  // Update employee
  fastify.patch<{ Params: { id: string } }>(
    "/api/employees/:id",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { companyId } = request.user;
      const { id } = request.params;
      const input = updateEmployeeSchema.parse(request.body);

      const employee = await db.query.employees.findFirst({
        where: and(eq(employees.id, id), eq(employees.companyId, companyId)),
      });
      if (!employee) {
        return reply.status(404).send({ error: "Employee not found" });
      }

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name) updateData.name = input.name;
      if (input.jobTitle) updateData.jobTitle = input.jobTitle;
      if (input.persona !== undefined) updateData.persona = input.persona;
      if (input.goals !== undefined) updateData.goals = input.goals;
      if (input.modelConfig) updateData.modelConfig = input.modelConfig;

      const [updated] = await db
        .update(employees)
        .set(updateData)
        .where(eq(employees.id, id))
        .returning();

      return { employee: sanitizeEmployee(updated) };
    },
  );

  // Pause employee
  fastify.post<{ Params: { id: string } }>(
    "/api/employees/:id/pause",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { companyId } = request.user;
      const { id } = request.params;

      const employee = await db.query.employees.findFirst({
        where: and(eq(employees.id, id), eq(employees.companyId, companyId)),
      });
      if (!employee) {
        return reply.status(404).send({ error: "Employee not found" });
      }

      if (employee.status !== "active") {
        return reply.status(400).send({ error: "Employee is not active" });
      }

      // Queue container stop
      const queue = getProvisionQueue();
      await queue.add("stop-employee", { employeeId: id });

      const [updated] = await db
        .update(employees)
        .set({ status: "paused", updatedAt: new Date() })
        .where(eq(employees.id, id))
        .returning();

      return { employee: sanitizeEmployee(updated) };
    },
  );

  // Resume employee
  fastify.post<{ Params: { id: string } }>(
    "/api/employees/:id/resume",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { companyId } = request.user;
      const { id } = request.params;

      const employee = await db.query.employees.findFirst({
        where: and(eq(employees.id, id), eq(employees.companyId, companyId)),
      });
      if (!employee) {
        return reply.status(404).send({ error: "Employee not found" });
      }

      if (employee.status !== "paused") {
        return reply.status(400).send({ error: "Employee is not paused" });
      }

      // Queue container start
      const queue = getProvisionQueue();
      await queue.add("start-employee", { employeeId: id });

      const [updated] = await db
        .update(employees)
        .set({ status: "provisioning", updatedAt: new Date() })
        .where(eq(employees.id, id))
        .returning();

      return { employee: sanitizeEmployee(updated) };
    },
  );

  // Terminate employee
  fastify.delete<{ Params: { id: string } }>(
    "/api/employees/:id",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { companyId } = request.user;
      const { id } = request.params;

      const employee = await db.query.employees.findFirst({
        where: and(eq(employees.id, id), eq(employees.companyId, companyId)),
      });
      if (!employee) {
        return reply.status(404).send({ error: "Employee not found" });
      }

      // Queue container teardown
      const queue = getProvisionQueue();
      await queue.add("teardown-employee", { employeeId: id });

      const [updated] = await db
        .update(employees)
        .set({ status: "terminated", updatedAt: new Date() })
        .where(eq(employees.id, id))
        .returning();

      return {
        employee: sanitizeEmployee(updated),
        message: `${employee.name} has been terminated.`,
      };
    },
  );

  // Get job templates
  fastify.get("/api/employees/templates", async () => {
    const { JOB_TEMPLATES, getJobTemplateCategories } = await import(
      "@ai-employees/shared"
    );
    return {
      templates: JOB_TEMPLATES.map((t) => ({
        id: t.id,
        title: t.title,
        emoji: t.emoji,
        category: t.category,
        description: t.description,
        suggestedChannels: t.suggestedChannels,
      })),
      categories: getJobTemplateCategories(),
    };
  });
}

function sanitizeEmployee(e: Record<string, unknown>) {
  // Remove sensitive fields from API responses
  const { gatewayToken, ...safe } = e as { gatewayToken?: string } & Record<
    string,
    unknown
  >;
  return safe;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
