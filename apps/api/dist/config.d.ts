import { z } from "zod";
declare const envSchema: z.ZodObject<{
    DATABASE_URL: z.ZodString;
    REDIS_URL: z.ZodDefault<z.ZodString>;
    JWT_SECRET: z.ZodString;
    JWT_EXPIRES_IN: z.ZodDefault<z.ZodString>;
    ENCRYPTION_KEY: z.ZodString;
    INTERSERVICE_SECRET: z.ZodString;
    ANTHROPIC_API_KEY: z.ZodOptional<z.ZodString>;
    SLACK_APP_TOKEN: z.ZodOptional<z.ZodString>;
    SLACK_SIGNING_SECRET: z.ZodOptional<z.ZodString>;
    OPENCLAW_IMAGE: z.ZodDefault<z.ZodString>;
    OPENCLAW_NETWORK: z.ZodDefault<z.ZodString>;
    API_PORT: z.ZodDefault<z.ZodNumber>;
    PLATFORM_URL: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    DATABASE_URL: string;
    REDIS_URL: string;
    JWT_SECRET: string;
    JWT_EXPIRES_IN: string;
    ENCRYPTION_KEY: string;
    INTERSERVICE_SECRET: string;
    OPENCLAW_IMAGE: string;
    OPENCLAW_NETWORK: string;
    API_PORT: number;
    PLATFORM_URL: string;
    ANTHROPIC_API_KEY?: string | undefined;
    SLACK_APP_TOKEN?: string | undefined;
    SLACK_SIGNING_SECRET?: string | undefined;
}, {
    DATABASE_URL: string;
    JWT_SECRET: string;
    ENCRYPTION_KEY: string;
    INTERSERVICE_SECRET: string;
    REDIS_URL?: string | undefined;
    JWT_EXPIRES_IN?: string | undefined;
    ANTHROPIC_API_KEY?: string | undefined;
    SLACK_APP_TOKEN?: string | undefined;
    SLACK_SIGNING_SECRET?: string | undefined;
    OPENCLAW_IMAGE?: string | undefined;
    OPENCLAW_NETWORK?: string | undefined;
    API_PORT?: number | undefined;
    PLATFORM_URL?: string | undefined;
}>;
export type Env = z.infer<typeof envSchema>;
export declare function loadConfig(): Env;
export {};
//# sourceMappingURL=config.d.ts.map