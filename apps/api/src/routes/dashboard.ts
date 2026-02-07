import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, employees, companies } from "@ai-employees/db";

export async function dashboardRoutes(fastify: FastifyInstance) {
  // Company overview dashboard
  fastify.get(
    "/api/dashboard/overview",
    { onRequest: [fastify.authenticate] },
    async (request) => {
      const { companyId } = request.user;

      const company = await db.query.companies.findFirst({
        where: eq(companies.id, companyId),
      });

      const allEmployees = await db.query.employees.findMany({
        where: eq(employees.companyId, companyId),
      });

      const statusCounts = {
        active: 0,
        paused: 0,
        provisioning: 0,
        onboarding: 0,
        error: 0,
        terminated: 0,
      };

      for (const emp of allEmployees) {
        const status = emp.status as keyof typeof statusCounts;
        if (status in statusCounts) {
          statusCounts[status]++;
        }
      }

      return {
        company: company
          ? {
              name: company.name,
              plan: company.plan,
              maxEmployees: company.maxEmployees,
            }
          : null,
        employees: {
          total: allEmployees.length,
          ...statusCounts,
        },
      };
    },
  );
}
