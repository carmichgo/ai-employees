/**
 * Backend client — routes requests to an employee's dedicated droplet.
 *
 * Each employee has their own DigitalOcean droplet.
 * The droplet runs the API + Worker that manages the Blitzer container.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";

interface EmployeeBackendConfig {
  url: string;
  secret: string;
}

/**
 * Resolve the backend for a specific employee.
 * Returns the employee's droplet URL + secret, or null if not ready.
 */
export async function getEmployeeBackend(
  employeeId: string,
): Promise<EmployeeBackendConfig | null> {
  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!employee) return null;

  if (
    employee.dropletStatus === "active" &&
    employee.dropletIp &&
    employee.interserviceSecret
  ) {
    return {
      url: `http://${employee.dropletIp}:3001`,
      secret: employee.interserviceSecret,
    };
  }

  return null;
}

/** Make an authenticated request to a backend API */
async function backendFetch(
  config: EmployeeBackendConfig,
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `${config.url}${path}`;

  const headers: Record<string, string> = {
    "x-interservice-secret": config.secret,
  };
  // Only set Content-Type for requests that have a body — Fastify rejects
  // empty bodies when Content-Type is application/json.
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Backend error: ${res.status}`);
  }

  return res;
}

/** Create a backend client bound to a specific backend */
export function createBackendClient(config: EmployeeBackendConfig) {
  return {
    async provisionEmployee(data: {
      companyId: string;
      name: string;
      jobTitle: string;
      tier?: string;
      templateId?: string;
      persona?: string;
      goals?: string;
      personalityConfig?: { autonomy?: string; proactivity?: string; communication?: string };
      channels?: string[];
      channelCredentials?: Record<string, Record<string, unknown>>;
      modelConfig?: { primary: string };
      toolsAllow?: string[];
      skills?: string[];
    }) {
      const res = await backendFetch(config, "/internal/employees/provision", {
        method: "POST",
        body: JSON.stringify(data),
      });
      return res.json();
    },

    async pauseEmployee(id: string) {
      const res = await backendFetch(config, `/internal/employees/${id}/pause`, {
        method: "POST",
      });
      return res.json();
    },

    async resumeEmployee(id: string) {
      const res = await backendFetch(config, `/internal/employees/${id}/resume`, {
        method: "POST",
      });
      return res.json();
    },

    async terminateEmployee(id: string) {
      const res = await backendFetch(config, `/internal/employees/${id}`, {
        method: "DELETE",
      });
      return res.json();
    },

    async getEmployeeStatus(id: string) {
      const res = await backendFetch(config, `/internal/employees/${id}/status`);
      return res.json();
    },

    async connectChannel(employeeId: string, data: {
      agentId: string;
      allChannels: Array<{ type: string; credentials: Record<string, unknown>; config: Record<string, unknown> }>;
    }) {
      const res = await backendFetch(config, `/internal/employees/${employeeId}/channels/connect`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      return res.json();
    },

    async provisionContainer(employeeId: string) {
      const res = await backendFetch(config, `/internal/employees/${employeeId}/provision-container`, {
        method: "POST",
      });
      return res.json() as Promise<{ message: string; status: string }>;
    },

    async getWhatsAppQR(employeeId: string) {
      const res = await backendFetch(config, `/internal/employees/${employeeId}/channels/whatsapp/qr`);
      return res.json() as Promise<{ status: string; qr: string | null; message?: string }>;
    },
  };
}
