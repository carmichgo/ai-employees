import type { EmployeeTier } from "./types/employee.js";
export interface EmployeeTierConfig {
    id: EmployeeTier;
    label: string;
    subtitle: string;
    model: string;
    priceMonthly: number;
    creditsIncluded: number;
    overagePerCredit: number;
    resources: {
        memory: string;
        cpus: string;
    };
}
export declare const EMPLOYEE_TIERS: Record<EmployeeTier, EmployeeTierConfig>;
export declare const EMPLOYEE_TIER_OPTIONS: EmployeeTier[];
/** Get the model string for a given employee tier */
export declare function getModelForTier(tier: EmployeeTier): string;
/** Get container resources for a given employee tier */
export declare function getResourcesForTier(tier: EmployeeTier): {
    memory: string;
    cpus: string;
};
export declare const CONTAINER_RESOURCES: {
    readonly starter: {
        readonly memory: "2g";
        readonly cpus: "1.0";
    };
    readonly professional: {
        readonly memory: "4g";
        readonly cpus: "2.0";
    };
    readonly enterprise: {
        readonly memory: "8g";
        readonly cpus: "4.0";
    };
};
export interface CompanyPlanConfig {
    id: string;
    label: string;
    subtitle: string;
    priceMonthly: number;
    infrastructure: "shared" | "dedicated";
    maxEmployees: number;
}
export declare const COMPANY_PLANS: Record<string, CompanyPlanConfig>;
export declare const EMPLOYEE_STATUSES: readonly ["provisioning", "onboarding", "active", "paused", "terminated", "error"];
export declare const CHANNEL_TYPES: readonly ["slack", "discord", "telegram", "whatsapp", "email", "webchat", "voice-chat", "phone", "signal", "teams", "google-chat", "matrix"];
export interface CapabilityOption {
    id: string;
    label: string;
    desc: string;
    toolsAllow: string[];
    skills?: string[];
    plugins?: string[];
}
export declare const CAPABILITY_OPTIONS: CapabilityOption[];
export interface ExpertiseOption {
    id: string;
    label: string;
    desc: string;
    skills: string[];
}
export declare const EXPERTISE_OPTIONS: ExpertiseOption[];
//# sourceMappingURL=constants.d.ts.map