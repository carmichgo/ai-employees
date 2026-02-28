/**
 * Per-employee backend client — routes requests to the
 * employee's dedicated DigitalOcean droplet.
 *
 * Architecture: one droplet per employee. Each droplet runs
 * Redis + Fastify API + BullMQ Worker + one OpenClaw container.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, employees } from "@/lib/schema";

interface BackendConfig {
  url: string;
  secret: string;
}

/** Look up an employee's droplet backend from the DB */
export async function getEmployeeBackend(
  employeeId: string,
): Promise<BackendConfig | null> {
  // Use explicit column selects to avoid SELECT * breakage when
  // the Drizzle schema defines columns not yet migrated to the DB.
  const [employee] = await db
    .select({
      dropletStatus: employees.dropletStatus,
      dropletIp: employees.dropletIp,
      interserviceSecret: employees.interserviceSecret,
    })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (
    !employee ||
    employee.dropletStatus !== "active" ||
    !employee.dropletIp ||
    !employee.interserviceSecret
  ) {
    return null;
  }

  return {
    url: `http://${employee.dropletIp}:3001`,
    secret: employee.interserviceSecret,
  };
}

/** @deprecated Use getEmployeeBackend instead — kept for backward compat */
export async function getCompanyBackend(
  companyId: string,
): Promise<BackendConfig | null> {
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (
    !company ||
    company.dropletStatus !== "active" ||
    !company.dropletIp ||
    !company.interserviceSecret
  ) {
    return null;
  }

  return {
    url: `http://${company.dropletIp}:3001`,
    secret: company.interserviceSecret,
  };
}

/** Check if an employee has an active droplet backend */
export async function isEmployeeBackendReady(employeeId: string): Promise<boolean> {
  const backend = await getEmployeeBackend(employeeId);
  return backend !== null;
}

/** Make an authenticated request to a droplet API */
async function backendFetch(
  config: BackendConfig,
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `${config.url}${path}`;

  // Add timeout to prevent hanging Vercel functions
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-interservice-secret": config.secret,
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error || `Backend error: ${res.status}`);
    }

    return res;
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(`Backend timeout on ${path}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/** Create a backend client bound to a specific droplet */
export function createBackendClient(config: BackendConfig) {
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
      authorityConfig?: { defaultRole?: string; members?: Array<{ slackUserId: string; name: string; role: string }> };
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

    async reprovisionEmployee(id: string) {
      const res = await backendFetch(config, `/internal/employees/${id}/reprovision`, {
        method: "POST",
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

    async syncCredentials(employeeId: string, credentials: Array<{
      label: string;
      username: string;
      password: string;
      url?: string;
      notes?: string;
    }>) {
      const res = await backendFetch(config, `/internal/employees/${employeeId}/credentials/sync`, {
        method: "POST",
        body: JSON.stringify({ credentials }),
      });
      return res.json();
    },

    async installSkill(employeeId: string, slug: string, content: string) {
      const res = await backendFetch(config, `/internal/employees/${employeeId}/skills/install`, {
        method: "POST",
        body: JSON.stringify({ slug, content }),
      });
      return res.json();
    },

    async uninstallSkill(employeeId: string, slug: string) {
      const res = await backendFetch(config, `/internal/employees/${employeeId}/skills/uninstall`, {
        method: "POST",
        body: JSON.stringify({ slug }),
      });
      return res.json();
    },

    async regenerateConfigs() {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000); // 2 min timeout
      try {
        const res = await fetch(`${config.url}/internal/regenerate-configs`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "x-interservice-secret": config.secret,
          },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(body.error || `Regenerate configs failed: ${res.status}`);
        }
        return res.json();
      } catch (err: any) {
        if (err.name === "AbortError") throw new Error("Regenerate configs timed out (2 min)");
        throw err;
      } finally {
        clearTimeout(timeout);
      }
    },

    async hotUpdate(branch?: string) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 300000); // 5 min timeout
      try {
        const res = await fetch(`${config.url}/internal/hot-update`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "x-interservice-secret": config.secret,
          },
          body: JSON.stringify({ branch: branch || "main" }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(body.error || `Hot update failed: ${res.status}`);
        }
        return res.json();
      } catch (err: any) {
        if (err.name === "AbortError") throw new Error("Hot update timed out (5 min)");
        throw err;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
