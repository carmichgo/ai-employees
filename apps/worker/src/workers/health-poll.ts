import { eq, and, not } from "drizzle-orm";
import { db, employees } from "@ai-employees/db";
import { docker } from "../docker/client.js";
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

export async function pollAllEmployeeHealth(): Promise<void> {
  // Only poll employees whose droplet IP matches this machine.
  // Each droplet runs its own worker, and can only inspect containers
  // on the local Docker daemon. Checking other droplets' employees
  // would incorrectly mark them as "error" (container not found).
  const localIps = getLocalIps();

  const activeEmployees = await db.query.employees.findMany({
    where: and(
      not(eq(employees.status, "terminated")),
      not(eq(employees.status, "provisioning")),
    ),
  });

  // Filter to only employees on this droplet
  const localEmployees = activeEmployees.filter(
    (e) => e.dropletIp && localIps.includes(e.dropletIp),
  );

  for (const employee of localEmployees) {
    try {
      await pollEmployeeHealth(employee);
    } catch (error) {
      console.error(`[health] Error polling employee ${employee.id}:`, error);
    }
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
