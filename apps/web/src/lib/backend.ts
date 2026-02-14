/**
 * Backend client — routes provisioning requests to the appropriate backend.
 *
 * Default: All companies use the shared infrastructure backend.
 * Dedicated plan ($100/mo): Company gets its own isolated DigitalOcean droplet.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies } from "@/lib/schema";

interface CompanyBackendConfig {
  url: string;
  secret: string;
}

const SHARED_BACKEND_URL = process.env.SHARED_BACKEND_URL;
const SHARED_BACKEND_SECRET = process.env.SHARED_BACKEND_SECRET;

/** Check if shared infrastructure is configured */
export function isSharedBackendEnabled(): boolean {
  return !!(SHARED_BACKEND_URL && SHARED_BACKEND_SECRET);
}

/**
 * Resolve which backend a company should use.
 *
 * Priority:
 * 1. Dedicated droplet (plan === "dedicated" and droplet is active)
 * 2. Shared backend (SHARED_BACKEND_URL configured)
 * 3. null (demo mode)
 */
export async function getCompanyBackend(
  companyId: string,
): Promise<CompanyBackendConfig | null> {
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!company) return null;

  // Dedicated plan: use company's own droplet if active
  if (
    company.plan === "dedicated" &&
    company.dropletStatus === "active" &&
    company.dropletIp &&
    company.interserviceSecret
  ) {
    return {
      url: `http://${company.dropletIp}:3001`,
      secret: company.interserviceSecret,
    };
  }

  // Shared backend: all other companies
  if (SHARED_BACKEND_URL && SHARED_BACKEND_SECRET) {
    return {
      url: SHARED_BACKEND_URL,
      secret: SHARED_BACKEND_SECRET,
    };
  }

  return null;
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
