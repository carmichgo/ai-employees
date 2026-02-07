import { eq } from "drizzle-orm";
import { db, employees } from "@ai-employees/db";
import { CONTAINER_RESOURCES, type PlanTier } from "@ai-employees/shared";
import {
  generateOpenClawConfig,
  generateSoulMd,
  type EmployeeInput,
} from "@ai-employees/openclaw-config";
import { docker, ensureNetwork, ensureImage } from "../docker/client.js";

const OPENCLAW_IMAGE = process.env.OPENCLAW_IMAGE || "openclaw:latest";
const OPENCLAW_NETWORK = process.env.OPENCLAW_NETWORK || "ai-employees-internal";

export interface ProvisionJobData {
  employeeId: string;
  companyId: string;
  channels: string[];
}

export async function provisionEmployee(data: ProvisionJobData): Promise<void> {
  const { employeeId } = data;

  console.log(`[provision] Starting provisioning for employee ${employeeId}`);

  // Get employee from DB
  const employee = await db.query.employees.findFirst({
    where: eq(employees.id, employeeId),
  });
  if (!employee) throw new Error(`Employee ${employeeId} not found`);

  try {
    // Update status
    await db
      .update(employees)
      .set({ status: "provisioning", updatedAt: new Date() })
      .where(eq(employees.id, employeeId));

    // Ensure Docker network exists
    await ensureNetwork(OPENCLAW_NETWORK);

    // Ensure OpenClaw image is available
    await ensureImage(OPENCLAW_IMAGE);

    // Create Docker volume for this employee's data
    const volumeName = `ai-emp-data-${employeeId}`;
    await docker.createVolume({ Name: volumeName });

    // Generate OpenClaw config
    const employeeInput: EmployeeInput = {
      id: employee.id,
      name: employee.name,
      jobTitle: employee.jobTitle,
      emoji: employee.emoji || undefined,
      persona: employee.persona,
      goals: employee.goals,
      modelConfig: employee.modelConfig as { primary: string; fallbacks?: string[] },
      toolsConfig: employee.toolsConfig as Record<string, unknown>,
      sandboxConfig: employee.sandboxConfig as Record<string, unknown>,
      channels: [], // Channels configured separately
    };

    const config = generateOpenClawConfig(employeeInput, employee.gatewayToken!);
    const soulMd = generateSoulMd(employeeInput);

    // Determine resource limits based on company plan
    const company = await db.query.companies.findFirst({
      where: eq(employees.companyId, data.companyId),
    });
    const plan = (company?.plan as PlanTier) || "starter";
    const resources = CONTAINER_RESOURCES[plan] || CONTAINER_RESOURCES.starter;

    // Create the container
    const container = await docker.createContainer({
      Image: OPENCLAW_IMAGE,
      name: employee.containerName!,
      Env: [
        `OPENCLAW_GATEWAY_TOKEN=${employee.gatewayToken}`,
        `OPENCLAW_CONFIG=${JSON.stringify(config)}`,
        `OPENCLAW_SOUL_MD=${soulMd}`,
      ],
      HostConfig: {
        Binds: [`${volumeName}:/home/node/.openclaw`],
        NetworkMode: OPENCLAW_NETWORK,
        Memory: parseMemory(resources.memory),
        NanoCpus: parseCpus(resources.cpus),
        RestartPolicy: { Name: "unless-stopped" },
      },
      Labels: {
        "ai-employees.employee-id": employeeId,
        "ai-employees.company-id": data.companyId,
        "traefik.enable": "true",
        [`traefik.http.routers.${employee.containerName}.rule`]:
          `Host(\`${employee.containerName}.localhost\`)`,
        [`traefik.http.services.${employee.containerName}.loadbalancer.server.port`]:
          "18789",
      },
    });

    // Start the container
    await container.start();

    // Get container info for host/port
    const info = await container.inspect();

    // Update DB with container details
    await db
      .update(employees)
      .set({
        containerId: info.Id,
        containerHost: info.NetworkSettings.Networks?.[OPENCLAW_NETWORK]?.IPAddress || null,
        containerPort: 18789,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(employees.id, employeeId));

    console.log(
      `[provision] Employee ${employee.name} (${employeeId}) is now active at ${info.NetworkSettings.Networks?.[OPENCLAW_NETWORK]?.IPAddress}:18789`,
    );
  } catch (error) {
    console.error(`[provision] Failed to provision employee ${employeeId}:`, error);

    await db
      .update(employees)
      .set({
        status: "error",
        errorMessage: error instanceof Error ? error.message : String(error),
        updatedAt: new Date(),
      })
      .where(eq(employees.id, employeeId));

    throw error;
  }
}

export async function stopEmployee(employeeId: string): Promise<void> {
  const employee = await db.query.employees.findFirst({
    where: eq(employees.id, employeeId),
  });
  if (!employee?.containerId) return;

  const container = docker.getContainer(employee.containerId);
  await container.stop();
}

export async function startEmployee(employeeId: string): Promise<void> {
  const employee = await db.query.employees.findFirst({
    where: eq(employees.id, employeeId),
  });
  if (!employee?.containerId) return;

  const container = docker.getContainer(employee.containerId);
  await container.start();

  await db
    .update(employees)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(employees.id, employeeId));
}

export async function teardownEmployee(employeeId: string): Promise<void> {
  const employee = await db.query.employees.findFirst({
    where: eq(employees.id, employeeId),
  });
  if (!employee) return;

  if (employee.containerId) {
    try {
      const container = docker.getContainer(employee.containerId);
      await container.stop().catch(() => {}); // May already be stopped
      await container.remove({ force: true });
    } catch {
      // Container may already be removed
    }
  }

  // Remove volume
  try {
    const volume = docker.getVolume(`ai-emp-data-${employeeId}`);
    await volume.remove();
  } catch {
    // Volume may not exist
  }

  console.log(`[teardown] Employee ${employee.name} (${employeeId}) fully terminated`);
}

function parseMemory(mem: string): number {
  const match = mem.match(/^(\d+)([gmk]?)$/i);
  if (!match) return 1024 * 1024 * 1024; // 1GB default
  const [, num, unit] = match;
  const multipliers: Record<string, number> = {
    g: 1024 * 1024 * 1024,
    m: 1024 * 1024,
    k: 1024,
    "": 1,
  };
  return parseInt(num) * (multipliers[unit.toLowerCase()] || 1);
}

function parseCpus(cpus: string): number {
  return Math.floor(parseFloat(cpus) * 1e9);
}
