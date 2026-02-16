import { z } from "zod";
export declare const personalityConfigSchema: z.ZodObject<{
    autonomy: z.ZodDefault<z.ZodEnum<["full", "high", "moderate", "low"]>>;
    proactivity: z.ZodDefault<z.ZodEnum<["very-proactive", "proactive", "balanced", "reactive"]>>;
    communication: z.ZodDefault<z.ZodEnum<["concise", "detailed", "casual", "formal"]>>;
    bossTechnicalLevel: z.ZodOptional<z.ZodEnum<["very-technical", "technical", "somewhat-technical", "non-technical"]>>;
}, "strip", z.ZodTypeAny, {
    autonomy: "full" | "high" | "moderate" | "low";
    proactivity: "very-proactive" | "proactive" | "balanced" | "reactive";
    communication: "concise" | "detailed" | "casual" | "formal";
    bossTechnicalLevel?: "very-technical" | "technical" | "somewhat-technical" | "non-technical" | undefined;
}, {
    autonomy?: "full" | "high" | "moderate" | "low" | undefined;
    proactivity?: "very-proactive" | "proactive" | "balanced" | "reactive" | undefined;
    communication?: "concise" | "detailed" | "casual" | "formal" | undefined;
    bossTechnicalLevel?: "very-technical" | "technical" | "somewhat-technical" | "non-technical" | undefined;
}>;
export declare const createEmployeeSchema: z.ZodObject<{
    name: z.ZodString;
    jobTitle: z.ZodString;
    tier: z.ZodDefault<z.ZodEnum<["junior", "senior", "expert"]>>;
    templateId: z.ZodOptional<z.ZodString>;
    persona: z.ZodOptional<z.ZodString>;
    goals: z.ZodOptional<z.ZodString>;
    personalityConfig: z.ZodOptional<z.ZodObject<{
        autonomy: z.ZodDefault<z.ZodEnum<["full", "high", "moderate", "low"]>>;
        proactivity: z.ZodDefault<z.ZodEnum<["very-proactive", "proactive", "balanced", "reactive"]>>;
        communication: z.ZodDefault<z.ZodEnum<["concise", "detailed", "casual", "formal"]>>;
        bossTechnicalLevel: z.ZodOptional<z.ZodEnum<["very-technical", "technical", "somewhat-technical", "non-technical"]>>;
    }, "strip", z.ZodTypeAny, {
        autonomy: "full" | "high" | "moderate" | "low";
        proactivity: "very-proactive" | "proactive" | "balanced" | "reactive";
        communication: "concise" | "detailed" | "casual" | "formal";
        bossTechnicalLevel?: "very-technical" | "technical" | "somewhat-technical" | "non-technical" | undefined;
    }, {
        autonomy?: "full" | "high" | "moderate" | "low" | undefined;
        proactivity?: "very-proactive" | "proactive" | "balanced" | "reactive" | undefined;
        communication?: "concise" | "detailed" | "casual" | "formal" | undefined;
        bossTechnicalLevel?: "very-technical" | "technical" | "somewhat-technical" | "non-technical" | undefined;
    }>>;
    modelConfig: z.ZodOptional<z.ZodObject<{
        primary: z.ZodString;
        fallbacks: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        primary: string;
        fallbacks?: string[] | undefined;
    }, {
        primary: string;
        fallbacks?: string[] | undefined;
    }>>;
    phoneNumber: z.ZodOptional<z.ZodString>;
    channels: z.ZodOptional<z.ZodArray<z.ZodEnum<["slack", "discord", "telegram", "whatsapp", "email", "webchat", "voice-chat", "phone", "signal", "teams", "google-chat", "matrix"]>, "many">>;
    toolsAllow: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    jobTitle: string;
    tier: "junior" | "senior" | "expert";
    skills?: string[] | undefined;
    templateId?: string | undefined;
    persona?: string | undefined;
    goals?: string | undefined;
    personalityConfig?: {
        autonomy: "full" | "high" | "moderate" | "low";
        proactivity: "very-proactive" | "proactive" | "balanced" | "reactive";
        communication: "concise" | "detailed" | "casual" | "formal";
        bossTechnicalLevel?: "very-technical" | "technical" | "somewhat-technical" | "non-technical" | undefined;
    } | undefined;
    modelConfig?: {
        primary: string;
        fallbacks?: string[] | undefined;
    } | undefined;
    phoneNumber?: string | undefined;
    channels?: ("slack" | "discord" | "telegram" | "whatsapp" | "email" | "webchat" | "voice-chat" | "phone" | "signal" | "teams" | "google-chat" | "matrix")[] | undefined;
    toolsAllow?: string[] | undefined;
}, {
    name: string;
    jobTitle: string;
    skills?: string[] | undefined;
    tier?: "junior" | "senior" | "expert" | undefined;
    templateId?: string | undefined;
    persona?: string | undefined;
    goals?: string | undefined;
    personalityConfig?: {
        autonomy?: "full" | "high" | "moderate" | "low" | undefined;
        proactivity?: "very-proactive" | "proactive" | "balanced" | "reactive" | undefined;
        communication?: "concise" | "detailed" | "casual" | "formal" | undefined;
        bossTechnicalLevel?: "very-technical" | "technical" | "somewhat-technical" | "non-technical" | undefined;
    } | undefined;
    modelConfig?: {
        primary: string;
        fallbacks?: string[] | undefined;
    } | undefined;
    phoneNumber?: string | undefined;
    channels?: ("slack" | "discord" | "telegram" | "whatsapp" | "email" | "webchat" | "voice-chat" | "phone" | "signal" | "teams" | "google-chat" | "matrix")[] | undefined;
    toolsAllow?: string[] | undefined;
}>;
export declare const updateEmployeeSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    jobTitle: z.ZodOptional<z.ZodString>;
    tier: z.ZodOptional<z.ZodDefault<z.ZodEnum<["junior", "senior", "expert"]>>>;
    templateId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    persona: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    goals: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    personalityConfig: z.ZodOptional<z.ZodOptional<z.ZodObject<{
        autonomy: z.ZodDefault<z.ZodEnum<["full", "high", "moderate", "low"]>>;
        proactivity: z.ZodDefault<z.ZodEnum<["very-proactive", "proactive", "balanced", "reactive"]>>;
        communication: z.ZodDefault<z.ZodEnum<["concise", "detailed", "casual", "formal"]>>;
        bossTechnicalLevel: z.ZodOptional<z.ZodEnum<["very-technical", "technical", "somewhat-technical", "non-technical"]>>;
    }, "strip", z.ZodTypeAny, {
        autonomy: "full" | "high" | "moderate" | "low";
        proactivity: "very-proactive" | "proactive" | "balanced" | "reactive";
        communication: "concise" | "detailed" | "casual" | "formal";
        bossTechnicalLevel?: "very-technical" | "technical" | "somewhat-technical" | "non-technical" | undefined;
    }, {
        autonomy?: "full" | "high" | "moderate" | "low" | undefined;
        proactivity?: "very-proactive" | "proactive" | "balanced" | "reactive" | undefined;
        communication?: "concise" | "detailed" | "casual" | "formal" | undefined;
        bossTechnicalLevel?: "very-technical" | "technical" | "somewhat-technical" | "non-technical" | undefined;
    }>>>;
    modelConfig: z.ZodOptional<z.ZodOptional<z.ZodObject<{
        primary: z.ZodString;
        fallbacks: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        primary: string;
        fallbacks?: string[] | undefined;
    }, {
        primary: string;
        fallbacks?: string[] | undefined;
    }>>>;
    phoneNumber: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    channels: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodEnum<["slack", "discord", "telegram", "whatsapp", "email", "webchat", "voice-chat", "phone", "signal", "teams", "google-chat", "matrix"]>, "many">>>;
    toolsAllow: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
    skills: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
}, "strip", z.ZodTypeAny, {
    skills?: string[] | undefined;
    name?: string | undefined;
    jobTitle?: string | undefined;
    tier?: "junior" | "senior" | "expert" | undefined;
    templateId?: string | undefined;
    persona?: string | undefined;
    goals?: string | undefined;
    personalityConfig?: {
        autonomy: "full" | "high" | "moderate" | "low";
        proactivity: "very-proactive" | "proactive" | "balanced" | "reactive";
        communication: "concise" | "detailed" | "casual" | "formal";
        bossTechnicalLevel?: "very-technical" | "technical" | "somewhat-technical" | "non-technical" | undefined;
    } | undefined;
    modelConfig?: {
        primary: string;
        fallbacks?: string[] | undefined;
    } | undefined;
    phoneNumber?: string | undefined;
    channels?: ("slack" | "discord" | "telegram" | "whatsapp" | "email" | "webchat" | "voice-chat" | "phone" | "signal" | "teams" | "google-chat" | "matrix")[] | undefined;
    toolsAllow?: string[] | undefined;
}, {
    skills?: string[] | undefined;
    name?: string | undefined;
    jobTitle?: string | undefined;
    tier?: "junior" | "senior" | "expert" | undefined;
    templateId?: string | undefined;
    persona?: string | undefined;
    goals?: string | undefined;
    personalityConfig?: {
        autonomy?: "full" | "high" | "moderate" | "low" | undefined;
        proactivity?: "very-proactive" | "proactive" | "balanced" | "reactive" | undefined;
        communication?: "concise" | "detailed" | "casual" | "formal" | undefined;
        bossTechnicalLevel?: "very-technical" | "technical" | "somewhat-technical" | "non-technical" | undefined;
    } | undefined;
    modelConfig?: {
        primary: string;
        fallbacks?: string[] | undefined;
    } | undefined;
    phoneNumber?: string | undefined;
    channels?: ("slack" | "discord" | "telegram" | "whatsapp" | "email" | "webchat" | "voice-chat" | "phone" | "signal" | "teams" | "google-chat" | "matrix")[] | undefined;
    toolsAllow?: string[] | undefined;
}>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type PersonalityConfigInput = z.infer<typeof personalityConfigSchema>;
//# sourceMappingURL=employee.d.ts.map