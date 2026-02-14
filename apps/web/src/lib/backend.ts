/**
 * Per-company backend client — routes provisioning requests to the
 * company's dedicated DigitalOcean droplet.
 *
 * Each company has its own droplet (IP + interservice secret stored in DB).
 * Falls back to demo mode if the company has no active droplet.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies } from "@/lib/schema";

interface CompanyBackendConfig {
  url: string;
  secret: string;
}

/** Look up a company's droplet backend from the DB */
export async function getCompanyBackend(
  companyId: string,
): Promise<CompanyBackendConfig | null> {
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

/** Check if a company has an active droplet backend */
export async function isCompanyBackendReady(companyId: string): Promise<boolean> {
  const backend = await getCompanyBackend(companyId);
  return backend !== null;
}

/** Make an authenticated request to a company's droplet API */
async function backendFetch(
  config: CompanyBackendConfig,
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `${config.url}${path}`;

  const res = await fetch(url, {
    ...options,
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
}

/** Create a backend client bound to a specific company's droplet */
export function createBackendClient(config: CompanyBackendConfig) {
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
  };
}
