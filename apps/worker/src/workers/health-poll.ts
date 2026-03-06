import { eq, not } from "drizzle-orm";
import { db, employees } from "@ai-employees/db";
import { docker } from "../docker/client.js";

/** How long an employee can stay in "provisioning" before being marked as stuck */
const PROVISION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export async function pollAllEmployeeHealth(): Promise<void> {
  // Get all non-terminated employees (including provisioning — to detect stuck ones)
  const allEmployees = await db.query.employees.findMany({
    where: not(eq(employees.status, "terminated")),
  });

  for (const employee of allEmployees) {
    try {
      if (employee.status === "provisioning") {
        await checkStuckProvisioning(employee);
      } else {
        await pollEmployeeHealth(employee);
      }
    } catch (error) {
      console.error(`[health] Error polling employee ${employee.id}:`, error);
    }
  }
}

/** Detect employees stuck in provisioning for too long and mark them as error */
async function checkStuckProvisioning(employee: {
  id: string;
  name: string;
  updatedAt: Date | null;
  createdAt: Date;
}) {
  const lastUpdate = employee.updatedAt || employee.createdAt;
  const elapsed = Date.now() - new Date(lastUpdate).getTime();

  if (elapsed > PROVISION_TIMEOUT_MS) {
    console.log(
      `[health] Employee ${employee.name} (${employee.id}) stuck in provisioning for ${Math.round(elapsed / 1000)}s — marking as error`,
    );
    await db
      .update(employees)
      .set({
        status: "error",
        errorMessage: "Provisioning timed out — please retry or contact support",
        updatedAt: new Date(),
      })
      .where(eq(employees.id, employee.id));
  }
}

async function pollEmployeeHealth(employee: {
  id: string;
  containerId: string | null;
  containerHost: string | null;
  containerPort: number | null;
  status: string;
}) {
  if (!employee.containerId) {
    return;
  }

  try {
    // Check Docker container status
    const container = docker.getContainer(employee.containerId);
    const info = await container.inspect();

    if (info.State.Status !== "running") {
      await db
        .update(employees)
        .set({
          status: "error",
          errorMessage: `Container stopped: ${info.State.Error || "unknown reason"}`,
          updatedAt: new Date(),
        })
        .where(eq(employees.id, employee.id));
      return;
    }

    // Check OpenClaw gateway health via HTTP
    if (employee.containerHost && employee.containerPort) {
      const healthUrl = `http://${employee.containerHost}:${employee.containerPort}/api/health`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const res = await fetch(healthUrl, { signal: controller.signal });
        clearTimeout(timeout);

        if (res.ok) {
          await db
            .update(employees)
            .set({
              status: "active",
              lastHealthAt: new Date(),
              errorMessage: null,
              updatedAt: new Date(),
            })
            .where(eq(employees.id, employee.id));
        }
      } catch {
        // Gateway not responding but container is running - might still be starting
        clearTimeout(timeout);
      }
    }
  } catch {
    // Container not found
    await db
      .update(employees)
      .set({
        status: "error",
        errorMessage: "Container not found",
        updatedAt: new Date(),
      })
      .where(eq(employees.id, employee.id));
  }
}
