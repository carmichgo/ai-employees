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
      const msg = body.detail
        ? `${body.error || "Error"}: ${body.detail}`
        : body.error || "Request failed";
      throw new ApiError(res.status, msg);
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

  async forgotPassword(email: string) {
    return this.request<{ message: string; resetUrl?: string }>(
      "/api/auth/forgot-password",
      { method: "POST", body: JSON.stringify({ email }) },
    );
  }

  async resetPassword(token: string, password: string) {
    return this.request<{ message: string }>(
      "/api/auth/reset-password",
      { method: "POST", body: JSON.stringify({ token, password }) },
    );
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
    tier?: string;
    hostingMode?: string;
    templateId?: string;
    persona?: string;
    goals?: string;
    channels?: string[];
    toolsAllow?: string[];
    skills?: string[];
    personalityConfig?: {
      autonomy?: string;
      proactivity?: string;
      communication?: string;
    };
    authorityConfig?: {
      defaultRole: string;
      members: Array<{ slackUserId: string; name: string; role: string }>;
    };
    byokAnthropicKey?: string;
    byokGeminiKey?: string;
    byokModel?: string;
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
        type: "login" | "api_key";
        label: string;
        username: string;
        hasPassword: boolean;
        url: string;
        notes: string;
        hasApiKey: boolean;
      }>;
    }>(`/api/employees/${employeeId}/credentials`);
  }

  async saveCredential(
    employeeId: string,
    data: { id?: string; type?: "login" | "api_key"; label: string; username?: string; password?: string; apiKey?: string; url?: string; notes?: string },
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

  // Employee channels
  async listChannels(employeeId: string) {
    return this.request<{
      channels: Array<{
        id: string;
        channelType: string;
        name: string;
        status: string;
        hasCredentials: boolean;
        createdAt: string;
        updatedAt: string;
      }>;
    }>(`/api/employees/${employeeId}/channels`);
  }

  async connectChannel(employeeId: string, channelType: string, credentials: Record<string, unknown>) {
    return this.request<{ message: string; status: string }>(
      `/api/employees/${employeeId}/channels`,
      { method: "POST", body: JSON.stringify({ channelType, credentials }) },
    );
  }

  async disconnectChannel(employeeId: string, channelType: string) {
    return this.request<{ message: string }>(
      `/api/employees/${employeeId}/channels?type=${encodeURIComponent(channelType)}`,
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
    files?: Array<{ name: string; mimeType: string }>,
    signal?: AbortSignal,
  ) {
    return this.request<{ reply: string; mode: string; usage?: any }>(
      `/api/employees/${id}/chat`,
      {
        method: "POST",
        body: JSON.stringify({ message, conversationHistory, files }),
        signal,
      },
    );
  }

  async clearChatHistory(id: string) {
    return this.request<{ success: boolean; message: string }>(
      `/api/employees/${id}/chat`,
      { method: "DELETE" },
    );
  }

  async restartEmployee(id: string, clearChat = false) {
    return this.request<{ success: boolean; results: string[] }>(
      `/api/employees/${id}/restart`,
      {
        method: "POST",
        body: JSON.stringify({ clearChat }),
      },
    );
  }

  async rebootEmployee(id: string) {
    return this.request<{ success: boolean; message: string }>(
      `/api/employees/${id}/reboot`,
      { method: "POST" },
    );
  }

  async stopEmployee(id: string) {
    return this.request<{ success: boolean; message: string }>(
      `/api/employees/${id}/stop`,
      { method: "POST" },
    );
  }

  async reactivateEmployee(id: string) {
    return this.request<{ message: string; dropletStatus?: string }>(
      `/api/employees/${id}/reprovision`,
      { method: "POST" },
    );
  }

  async getTemplates() {
    return this.request<{ templates: any[]; categories: string[] }>(
      "/api/employees/templates",
    );
  }

  // Employee activity status
  async getEmployeeActivity() {
    return this.request<{
      activity: Array<{
        employeeId: string;
        activityStatus: "working" | "idle" | "offline";
        currentTask: string | null;
        inProgressCount: number;
        pendingCount: number;
        lastHealthAt: string | null;
        lastRequestSentAt: string | null;
        lastResponseAt: string | null;
        lastActiveAt: string | null;
        tasks: Array<{
          taskId: string;
          title: string;
          inProgressSince: string;
          lastUpdated: string;
          minutesSinceUpdate: number;
        }>;
      }>;
    }>("/api/employees/activity");
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

  async uploadFile(employeeId: string, file: File, folder?: string) {
    const token = this.getToken();
    const formData = new FormData();
    formData.append("file", file);
    if (folder) formData.append("folder", folder);

    const res = await fetch(`${API_URL}/api/employees/${employeeId}/files`, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let errorMsg = `Upload failed (${res.status})`;
      try {
        const body = JSON.parse(text);
        if (body.error) errorMsg = body.error;
      } catch {
        if (text) errorMsg = `Upload failed: ${text.slice(0, 200)}`;
      }
      throw new ApiError(res.status, errorMsg);
    }
    return res.json();
  }

  async deleteFile(employeeId: string, filename: string) {
    return this.request<{ message: string }>(
      `/api/employees/${employeeId}/files?name=${encodeURIComponent(filename)}`,
      { method: "DELETE" },
    );
  }

  // Employee capabilities
  async getCapabilities(employeeId: string) {
    return this.request<{ capabilities: string[]; tier: string }>(
      `/api/employees/${employeeId}/capabilities`,
    );
  }

  async updateCapabilities(employeeId: string, capabilities: string[]) {
    return this.request<{
      capabilities: string[];
      priceDifference: number;
      billingUpdated: boolean;
      message: string;
    }>(`/api/employees/${employeeId}/capabilities`, {
      method: "PUT",
      body: JSON.stringify({ capabilities }),
    });
  }

  // Browser extension relay info
  async getRelayInfo(employeeId: string) {
    return this.request<{
      available: boolean;
      reason?: string;
      employeeName?: string;
      gatewayUrl?: string;
      gatewayToken?: string;
      wsUrl?: string;
      relayToken?: string;
      command?: string;
    }>(`/api/employees/${employeeId}/relay`);
  }

  // Employee documents (workspace files)
  async listDocuments(employeeId: string) {
    return this.request<{
      files: Array<{
        name: string;
        path: string;
        size: number;
        modifiedAt: string;
        type: string;
      }>;
    }>(`/api/employees/${employeeId}/documents`);
  }

  async deleteDocument(employeeId: string, filePath: string) {
    // filePath is the workspace-relative path (e.g. "workspace-main/file.png" or needs "workspace/" prefix)
    const needsPrefix = !filePath.startsWith("skills/") && !filePath.startsWith("workspace-main/");
    const prefix = needsPrefix ? "workspace/" : "";
    return this.request<{ message: string }>(
      `/api/employees/${employeeId}/workspace/${prefix}${filePath}`,
      { method: "DELETE" },
    );
  }

  async deleteFolder(employeeId: string, folderPath: string) {
    const needsPrefix = !folderPath.startsWith("skills/") && !folderPath.startsWith("workspace-main/");
    const prefix = needsPrefix ? "workspace/" : "";
    return this.request<{ message: string }>(
      `/api/employees/${employeeId}/workspace/${prefix}${folderPath}`,
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

  // Employee skills
  async listSkills(employeeId: string) {
    return this.request<{
      skills: Array<{
        id: string;
        skillSlug: string;
        source: string;
        enabled: boolean;
        config: Record<string, unknown>;
        createdAt: string;
      }>;
    }>(`/api/employees/${employeeId}/skills`);
  }

  async installSkill(employeeId: string, data: { slug: string; source?: string; content?: string; files?: Array<{ name: string; content: string }> }) {
    return this.request<{ message: string; skill: any }>(
      `/api/employees/${employeeId}/skills`,
      { method: "POST", body: JSON.stringify(data) },
    );
  }

  async toggleSkill(employeeId: string, slug: string, enabled: boolean) {
    return this.request<{ message: string; skill: any }>(
      `/api/employees/${employeeId}/skills?slug=${encodeURIComponent(slug)}`,
      { method: "PATCH", body: JSON.stringify({ enabled }) },
    );
  }

  async uninstallSkill(employeeId: string, slug: string) {
    return this.request<{ message: string }>(
      `/api/employees/${employeeId}/skills?slug=${encodeURIComponent(slug)}`,
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
        category: string | null;
        triggerId: string | null;
        triggerName: string | null;
        triggerCron: { cron?: string; message?: string } | null;
        dueDate: string | null;
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
    category?: string;
    dueDate?: string;
    status?: string;
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
    category?: string;
    dueDate?: string | null;
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

  // Task Comments
  async listTaskComments(taskId: string) {
    return this.request<{
      comments: Array<{
        id: string;
        taskId: string;
        authorType: string;
        authorName: string;
        content: string;
        createdAt: string;
      }>;
    }>(`/api/tasks/comments?taskId=${taskId}`);
  }

  async addTaskComment(taskId: string, content: string, authorName?: string) {
    return this.request<{ comment: any }>(`/api/tasks/comments?taskId=${taskId}`, {
      method: "POST",
      body: JSON.stringify({ content, authorName }),
    });
  }

  // Billing
  async createCheckoutSession(data: {
    name: string;
    jobTitle: string;
    tier: string;
    hostingMode?: string;
    channels: string[];
    capabilities: string[];
    expertise: string[];
    templateId?: string;
    persona?: string;
    goals?: string;
    toolsAllow?: string[];
    skills?: string[];
    personalityConfig?: any;
    authorityConfig?: any;
    byokAnthropicKey?: string;
    byokGeminiKey?: string;
    byokModel?: string;
  }) {
    // Returns { url } for first hire (redirect to Stripe Checkout)
    // or { employee, message } for subsequent hires (line item added to existing subscription)
    return this.request<{ url?: string; employee?: any; message?: string; billingAdded?: boolean; priceMonthly?: number }>("/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async confirmCheckout(sessionId: string) {
    return this.request<{ employee?: any; message?: string; alreadyCompleted?: boolean }>(
      "/api/billing/checkout/confirm",
      {
        method: "POST",
        body: JSON.stringify({ sessionId }),
      },
    );
  }

  async createPortalSession() {
    return this.request<{ url: string }>("/api/billing/portal", {
      method: "POST",
    });
  }

  async listSubscriptions() {
    return this.request<{ subscriptions: any[] }>("/api/billing/subscriptions");
  }

  async getBillingOverview() {
    return this.request<{
      subscription: any;
      employees: any[];
      monthlyTotal: number;
      paymentMethods: any[];
      invoices: any[];
    }>("/api/billing/overview");
  }

  // Bases (project containers for tables)
  async listBases() {
    return this.request<{
      bases: Array<{
        id: string;
        companyId: string;
        name: string;
        description: string | null;
        color: string;
        icon: string;
        createdAt: string;
        updatedAt: string;
      }>;
    }>("/api/tables/bases");
  }

  async getBase(baseId: string) {
    return this.request<{
      base: any;
      tables: Array<{
        id: string;
        companyId: string;
        baseId: string;
        name: string;
        description: string | null;
        createdAt: string;
        updatedAt: string;
      }>;
    }>(`/api/tables/bases?baseId=${baseId}`);
  }

  async createBase(data: { name: string; description?: string; color?: string; icon?: string }) {
    return this.request<{ base: any }>("/api/tables/bases", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateBase(baseId: string, data: { name?: string; description?: string; color?: string; icon?: string }) {
    return this.request<{ base: any }>(`/api/tables/bases?baseId=${baseId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteBase(baseId: string) {
    return this.request<{ message: string }>(`/api/tables/bases?baseId=${baseId}`, {
      method: "DELETE",
    });
  }

  // Tables (Airtable-style DB)
  async listTables(baseId?: string) {
    const params = baseId ? `?baseId=${baseId}` : "";
    return this.request<{
      tables: Array<{
        id: string;
        companyId: string;
        baseId: string | null;
        name: string;
        description: string | null;
        createdAt: string;
        updatedAt: string;
      }>;
    }>(`/api/tables${params}`);
  }

  async getTable(tableId: string) {
    return this.request<{
      table: any;
      columns: Array<{
        id: string;
        tableId: string;
        name: string;
        type: string;
        options: any;
        position: number;
        createdAt: string;
      }>;
      rows: Array<{
        id: string;
        tableId: string;
        cells: Record<string, any>;
        position: number;
        createdAt: string;
        updatedAt: string;
      }>;
    }>(`/api/tables?tableId=${tableId}`);
  }

  async createTable(data: { name: string; description?: string; baseId?: string }) {
    return this.request<{ table: any; columns: any[] }>("/api/tables", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateTable(tableId: string, data: { name?: string; description?: string }) {
    return this.request<{ table: any }>(`/api/tables?tableId=${tableId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteTable(tableId: string) {
    return this.request<{ message: string }>(`/api/tables?tableId=${tableId}`, {
      method: "DELETE",
    });
  }

  async addColumn(tableId: string, data: { name: string; type?: string; options?: any }) {
    return this.request<{ column: any }>("/api/tables/columns", {
      method: "POST",
      body: JSON.stringify({ tableId, ...data }),
    });
  }

  async updateColumn(columnId: string, data: { name?: string; type?: string; options?: any; position?: number }) {
    return this.request<{ column: any }>(`/api/tables/columns?columnId=${columnId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteColumn(columnId: string) {
    return this.request<{ message: string }>(`/api/tables/columns?columnId=${columnId}`, {
      method: "DELETE",
    });
  }

  async addRow(tableId: string, cells?: Record<string, any>) {
    return this.request<{ row: any }>("/api/tables/rows", {
      method: "POST",
      body: JSON.stringify({ tableId, cells }),
    });
  }

  async updateRow(rowId: string, cells: Record<string, any>) {
    return this.request<{ row: any }>(`/api/tables/rows?rowId=${rowId}`, {
      method: "PATCH",
      body: JSON.stringify({ cells }),
    });
  }

  async deleteRow(rowId: string) {
    return this.request<{ message: string }>(`/api/tables/rows?rowId=${rowId}`, {
      method: "DELETE",
    });
  }

  // Apps / Artifacts
  async listApps() {
    return this.request<{
      apps: Array<{
        id: string;
        name: string;
        description: string | null;
        emoji: string | null;
        type: string;
        workspacePath: string | null;
        url: string | null;
        hostingMode: string;
        deployVersion: string | null;
        isPublic: boolean;
        instructions: string | null;
        shared: boolean;
        status: string;
        createdAt: string;
        updatedAt: string;
        employeeId: string;
        employeeName: string | null;
        employeeEmoji: string | null;
        employeeJobTitle: string | null;
      }>;
    }>("/api/apps");
  }

  async deleteApp(id: string) {
    return this.request<{ message: string }>(`/api/apps/${id}`, {
      method: "DELETE",
    });
  }

  async updateApp(id: string, data: { name?: string; description?: string; emoji?: string; shared?: boolean; isPublic?: boolean; status?: string }) {
    return this.request<{ app: any }>(`/api/apps/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  // BYOK API key validation
  async validateApiKeys(data: { anthropicKey: string; geminiKey?: string }) {
    return this.request<{
      anthropicValid: boolean;
      anthropicError?: string;
      geminiValid: boolean;
      geminiError?: string;
    }>("/api/billing/validate-keys", {
      method: "POST",
      body: JSON.stringify(data),
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
