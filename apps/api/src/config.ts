import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  ENCRYPTION_KEY: z.string().min(32),
  INTERSERVICE_SECRET: z.string().min(32).describe("Shared secret for Vercel-to-DO API auth"),
  OPENCLAW_IMAGE: z.string().default("openclaw:latest"),
  OPENCLAW_NETWORK: z.string().default("ai-employees-internal"),
  API_PORT: z.coerce.number().default(3001),
  PLATFORM_URL: z.string().default("http://localhost:3000"),
});

export type Env = z.infer<typeof envSchema>;

export function loadConfig(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment variables:", result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}
