/**
 * Backend client — calls the DigitalOcean Fastify API for provisioning operations.
 * Used by Vercel API routes to trigger real OpenClaw container lifecycle.
 *
 * When BACKEND_URL is not set, falls back to "demo mode" (no real provisioning).
 */

const BACKEND_URL = process.env.BACKEND_URL; // e.g. https://api.yourdomain.com
const BACKEND_SECRET = process.env.BACKEND_SECRET; // must match INTERSERVICE_SECRET on DO

export function isBackendConfigured(): boolean {
  return !!(BACKEND_URL && BACKEND_SECRET);
}

async function backendFetch(path: string, options: RequestInit = {}): Promise<Response> {
  if (!BACKEND_URL || !BACKEND_SECRET) {
    throw new Error("Backend not configured — set BACKEND_URL and BACKEND_SECRET env vars");
  }

  const url = `${BACKEND_URL.replace(/\/$/, "")}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-interservice-secret": BACKEND_SECRET,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Backend error: ${res.status}`);
  }

  return res;
}

export const backend = {
  async provisionEmployee(data: {
    companyId: string;
    name: string;
    jobTitle: string;
    templateId?: string;
    persona?: string;
    goals?: string;
    channels?: string[];
    modelConfig?: { primary: string };
  }) {
    const res = await backendFetch("/internal/employees/provision", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async pauseEmployee(id: string) {
    const res = await backendFetch(`/internal/employees/${id}/pause`, {
      method: "POST",
    });
    return res.json();
  },

  async resumeEmployee(id: string) {
    const res = await backendFetch(`/internal/employees/${id}/resume`, {
      method: "POST",
    });
    return res.json();
  },

  async terminateEmployee(id: string) {
    const res = await backendFetch(`/internal/employees/${id}`, {
      method: "DELETE",
    });
    return res.json();
  },

  async getEmployeeStatus(id: string) {
    const res = await backendFetch(`/internal/employees/${id}/status`);
    return res.json();
  },
};
