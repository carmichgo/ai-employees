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
    personalityConfig?: {
      autonomy?: string;
      proactivity?: string;
      communication?: string;
    };
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

  // Employee email credentials
  async getEmployeeEmail(id: string) {
    return this.request<{
      email: {
        provider: string;
        address: string;
        imapHost: string;
        imapPort: number;
        smtpHost: string;
        smtpPort: number;
        username: string;
        hasPassword: boolean;
      } | null;
    }>(`/api/employees/${id}/email`);
  }

  async saveEmployeeEmail(id: string, data: {
    provider: string;
    address: string;
    imapHost?: string;
    imapPort?: number;
    smtpHost: string;
    smtpPort?: number;
    username: string;
    password: string;
  }) {
    return this.request<{ message: string; email: any }>(`/api/employees/${id}/email`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async removeEmployeeEmail(id: string) {
    return this.request<{ message: string }>(`/api/employees/${id}/email`, {
      method: "DELETE",
    });
  }

  // Employee credentials (logins, passwords, API keys)
  async listCredentials(employeeId: string) {
    return this.request<{
      credentials: Array<{
        id: string;
        label: string;
        username: string;
        hasPassword: boolean;
        url: string;
        notes: string;
      }>;
    }>(`/api/employees/${employeeId}/credentials`);
  }

  async saveCredential(
    employeeId: string,
    data: { id?: string; label: string; username: string; password?: string; url?: string; notes?: string },
  ) {
    return this.request<{ message: string; credential: any }>(
      `/api/employees/${employeeId}/credentials`,
      { method: "PUT", body: JSON.stringify(data) },
    );
  }

  async deleteCredential(employeeId: string, credId: string) {
    return this.request<{ message: string }>(
      `/api/employees/${employeeId}/credentials?credId=${encodeURIComponent(credId)}`,
      { method: "DELETE" },
    );
  }

  async getChatHistory(id: string) {
    return this.request<{
      messages: Array<{
        id: string;
        role: string;
        content: string;
        mode: string | null;
        createdAt: string;
      }>;
    }>(`/api/employees/${id}/chat`);
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
    return this.request<{ droplet: { id: string | null; ip: string | null; region: string | null; size: string | null; status: string; phase: string | null } }>(
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

  async getDropletLogs() {
    return this.request<{ phase: string; logs: string }>(
      "/api/companies/droplet/logs",
    );
  }

  // Integrations
  async getIntegrations() {
    return this.request<{
      integrations: Record<string, {
        connected: boolean;
        teamId?: string;
        teamName?: string;
        connectedAt?: string;
      }>;
    }>("/api/integrations");
  }

  async disconnectIntegration(type: string) {
    return this.request<{ message: string }>(
      `/api/integrations?type=${type}`,
      { method: "DELETE" },
    );
  }

  // Employee files
  async listFiles(employeeId: string) {
    return this.request<{
      files: Array<{ name: string; size: number; uploadedAt: string; mimeType?: string }>;
    }>(`/api/employees/${employeeId}/files`);
  }

  async uploadFile(employeeId: string, file: File) {
    const token = this.getToken();
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${API_URL}/api/employees/${employeeId}/files`, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, body.error || "Upload failed");
    }
    return res.json();
  }

  async deleteFile(employeeId: string, filename: string) {
    return this.request<{ message: string }>(
      `/api/employees/${employeeId}/files?name=${encodeURIComponent(filename)}`,
      { method: "DELETE" },
    );
  }

  // Employee triggers
  async listTriggers(employeeId: string) {
    return this.request<{
      triggers: Array<{
        id: string;
        type: string;
        name: string;
        config: Record<string, unknown>;
        enabled: boolean;
        webhookToken: string | null;
        lastRunAt: string | null;
        createdAt: string;
      }>;
    }>(`/api/employees/${employeeId}/triggers`);
  }

  async createTrigger(
    employeeId: string,
    data: { type: string; name: string; config: Record<string, unknown>; enabled?: boolean },
  ) {
    return this.request<{ trigger: any }>(`/api/employees/${employeeId}/triggers`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateTrigger(
    employeeId: string,
    triggerId: string,
    data: { name?: string; config?: Record<string, unknown>; enabled?: boolean },
  ) {
    return this.request<{ trigger: any }>(
      `/api/employees/${employeeId}/triggers?triggerId=${triggerId}`,
      { method: "PATCH", body: JSON.stringify(data) },
    );
  }

  async deleteTrigger(employeeId: string, triggerId: string) {
    return this.request<{ message: string }>(
      `/api/employees/${employeeId}/triggers?triggerId=${triggerId}`,
      { method: "DELETE" },
    );
  }

  // Tasks
  async listTasks(params?: { employeeId?: string; status?: string }) {
    const qs = new URLSearchParams();
    if (params?.employeeId) qs.set("employeeId", params.employeeId);
    if (params?.status) qs.set("status", params.status);
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<{
      tasks: Array<{
        id: string;
        employeeId: string;
        title: string;
        description: string | null;
        status: string;
        priority: string;
        source: string;
        completedAt: string | null;
        createdAt: string;
        updatedAt: string;
        employeeName: string | null;
        employeeEmoji: string | null;
        employeeJobTitle: string | null;
      }>;
    }>(`/api/tasks${query}`);
  }

  async createTask(data: {
    employeeId: string;
    title: string;
    description?: string;
    priority?: string;
  }) {
    return this.request<{ task: any }>("/api/tasks", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateTask(taskId: string, data: {
    title?: string;
    description?: string;
    status?: string;
    priority?: string;
  }) {
    return this.request<{ task: any }>(`/api/tasks?taskId=${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteTask(taskId: string) {
    return this.request<{ message: string }>(`/api/tasks?taskId=${taskId}`, {
      method: "DELETE",
    });
  }

  getSlackInstallUrl(): string {
    const token = this.getToken();
    // The install route is a redirect, so we navigate to it directly
    // We pass the token as a cookie, but also support bearer auth
    return `${API_URL}/api/integrations/slack/install`;
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
