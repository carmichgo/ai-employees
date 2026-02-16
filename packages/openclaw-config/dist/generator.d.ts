/**
 * Generates a Blitzer configuration (openclaw.json) for a single AI employee.
 *
 * Each employee is a fully autonomous Blitzer agent with:
 *   - Full tool access: browser, web search, file I/O, shell, scheduling
 *   - HTTP chat completions API for dashboard chat
 *   - Persistent workspace and memory
 *   - Channel integrations (Slack, Discord, etc.) when credentials are provided
 */
export interface EmployeeInput {
    id: string;
    name: string;
    jobTitle: string;
    emoji?: string;
    persona?: string | null;
    goals?: string | null;
    personalityConfig?: {
        autonomy?: string;
        proactivity?: string;
        communication?: string;
        bossTechnicalLevel?: string;
    } | null;
    companySlug?: string;
    companyName?: string;
    modelConfig: {
        primary: string;
        fallbacks?: string[];
    };
    toolsConfig: {
        profile?: string;
        allow?: string[];
        deny?: string[];
    };
    sandboxConfig: Record<string, unknown>;
    channels: ChannelInput[];
}
export interface ChannelInput {
    type: string;
    credentials: Record<string, unknown>;
    config: Record<string, unknown>;
}
export type OpenClawConfig = Record<string, unknown>;
/** Generate a complete Blitzer configuration for an AI employee */
export declare function generateOpenClawConfig(employee: EmployeeInput, gatewayToken: string): OpenClawConfig;
/** Generate a rich SOUL.md that defines the employee's identity and capabilities */
export declare function generateSoulMd(employee: EmployeeInput): string;
/** Generate an email address for the employee */
export declare function generateEmployeeEmail(employeeName: string, companySlug: string): string;
/**
 * Update an existing Blitzer config with new channel connections.
 * This avoids needing the full employee data — just the existing config
 * and the new list of channels with their credentials.
 */
export declare function regenerateChannelConfig(existingConfig: OpenClawConfig, agentId: string, channels: ChannelInput[]): OpenClawConfig;
//# sourceMappingURL=generator.d.ts.map