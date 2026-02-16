import { eq, and, not } from "drizzle-orm";
import { db, employees } from "@ai-employees/db";
import { docker } from "../docker/client.js";
export async function pollAllEmployeeHealth() {
    // Get all non-terminated employees
    const activeEmployees = await db.query.employees.findMany({
        where: and(not(eq(employees.status, "terminated")), not(eq(employees.status, "provisioning"))),
    });
    for (const employee of activeEmployees) {
        try {
            await pollEmployeeHealth(employee);
        }
        catch (error) {
            console.error(`[health] Error polling employee ${employee.id}:`, error);
        }
    }
}
async function pollEmployeeHealth(employee) {
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
        // Check Blitzer gateway health via HTTP
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
            }
            catch {
                // Gateway not responding but container is running - might still be starting
                clearTimeout(timeout);
            }
        }
    }
    catch {
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
//# sourceMappingURL=health-poll.js.map