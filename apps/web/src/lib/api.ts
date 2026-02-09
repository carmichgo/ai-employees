// In Vercel deployment, API routes live at the same origin
const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
    if (typeof window !== "undefined") {
      localStorage.setItem("token", token);
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("token");
    }
    return this.token;
  }

  clearToken() {
    this.token = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
    }
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, body.error || "Request failed");
    }

    return res.json();
  }

  // Auth
  async register(data: {
    companyName: string;
    companySlug: string;
    name: string;
    email: string;
    password: string;
  }) {
    const res = await this.request<{ token: string; user: any; company: any }>(
      "/api/auth/register",
      { method: "POST", body: JSON.stringify(data) },
    );
    this.setToken(res.token);
    return res;
  }

  async login(email: string, password: string) {
    const res = await this.request<{ token: string; user: any; company: any }>(
      "/api/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) },
    );
    this.setToken(res.token);
    return res;
  }

  async me() {
    return this.request<{ user: any; company: any }>("/api/auth/me");
  }

  // Employees
  async listEmployees() {
    return this.request<{ employees: any[] }>("/api/employees");
  }

  async getEmployee(id: string) {
    return this.request<{ employee: any }>(`/api/employees/${id}`);
  }

  async hireEmployee(data: {
    name: string;
    jobTitle: string;
    templateId?: string;
    persona?: string;
    goals?: string;
    channels?: string[];
  }) {
    return this.request<{ employee: any; message: string }>("/api/employees", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateEmployee(id: string, data: Record<string, any>) {
    return this.request<{ employee: any }>(`/api/employees/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async pauseEmployee(id: string) {
    return this.request<{ employee: any }>(`/api/employees/${id}/pause`, {
      method: "POST",
    });
  }

  async resumeEmployee(id: string) {
    return this.request<{ employee: any }>(`/api/employees/${id}/resume`, {
      method: "POST",
    });
  }

  async terminateEmployee(id: string) {
    return this.request<{ employee: any }>(`/api/employees/${id}`, {
      method: "DELETE",
    });
  }

  async chatWithEmployee(
    id: string,
    message: string,
    conversationHistory?: Array<{ role: string; content: string }>,
  ) {
    return this.request<{ reply: string; mode: string; usage?: any }>(
      `/api/employees/${id}/chat`,
      {
        method: "POST",
        body: JSON.stringify({ message, conversationHistory }),
      },
    );
  }

  async getTemplates() {
    return this.request<{ templates: any[]; categories: string[] }>(
      "/api/employees/templates",
    );
  }

  // Dashboard
  async getDashboard() {
    return this.request<{ company: any; employees: any }>("/api/dashboard/overview");
  }

  // Droplet management
  async getDropletStatus() {
    return this.request<{ droplet: { id: string | null; ip: string | null; region: string | null; size: string | null; status: string } }>(
      "/api/companies/droplet",
    );
  }

  async provisionDroplet() {
    return this.request<{ message: string; dropletId: string }>(
      "/api/companies/droplet",
      { method: "POST" },
    );
  }

  async destroyDroplet() {
    return this.request<{ message: string }>(
      "/api/companies/droplet",
      { method: "DELETE" },
    );
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const api = new ApiClient();
