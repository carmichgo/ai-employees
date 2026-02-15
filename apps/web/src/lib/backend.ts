/**
 * Backend client — routes provisioning requests to the appropriate backend.
 *
 * Default: All companies use a shared droplet (auto-provisioned on demand).
 * Dedicated plan ($100/mo): Company gets its own isolated DigitalOcean droplet.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, sharedInfrastructure } from "@/lib/schema";

interface CompanyBackendConfig {
  url: string;
  secret: string;
}

/**
 * Resolve which backend a company should use.
 *
 * Priority:
 * 1. Dedicated droplet (plan === "dedicated" and droplet is active)
 * 2. Shared droplet (auto-provisioned, stored in shared_infrastructure table)
 * 3. null (demo mode / needs provisioning)
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

  // Shared backend: look up the shared droplet from DB
  return getSharedBackend();
}

/** Get the shared droplet backend config from DB, or null if not ready */
export async function getSharedBackend(): Promise<CompanyBackendConfig | null> {
  const [shared] = await db
    .select()
    .from(sharedInfrastructure)
    .where(eq(sharedInfrastructure.key, "default"))
    .limit(1);

  if (
    !shared ||
    shared.dropletStatus !== "active" ||
    !shared.dropletIp ||
    !shared.interserviceSecret
  ) {
    return null;
  }

  return {
    url: `http://${shared.dropletIp}:3001`,
    secret: shared.interserviceSecret,
  };
}

/** Check if the shared droplet is currently provisioning */
export async function getSharedDropletStatus(): Promise<string> {
  const [shared] = await db
    .select()
    .from(sharedInfrastructure)
    .where(eq(sharedInfrastructure.key, "default"))
    .limit(1);

  return shared?.dropletStatus || "none";
}

/** Check if a company has an active backend */
export async function isCompanyBackendReady(companyId: string): Promise<boolean> {
  const backend = await getCompanyBackend(companyId);
  return backend !== null;
}

/** Make an authenticated request to a backend API */
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

/** Create a backend client bound to a specific backend */
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

    async getWhatsAppQR(employeeId: string) {
      const res = await backendFetch(config, `/internal/employees/${employeeId}/channels/whatsapp/qr`);
      return res.json() as Promise<{ status: string; qr: string | null; message?: string }>;
    },
  };
}
