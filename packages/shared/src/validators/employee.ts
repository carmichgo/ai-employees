import { z } from "zod";

export const personalityConfigSchema = z.object({
  autonomy: z.enum(["full", "high", "moderate", "low"]).default("high"),
  proactivity: z.enum(["very-proactive", "proactive", "balanced", "reactive"]).default("proactive"),
  communication: z.enum(["concise", "detailed", "casual", "formal"]).default("concise"),
  bossTechnicalLevel: z.enum(["very-technical", "technical", "somewhat-technical", "non-technical"]).optional(),
});

export const createEmployeeSchema = z.object({
  name: z.string().min(1).max(100),
  jobTitle: z.string().min(1).max(255),
  tier: z.enum(["junior", "senior", "expert"]).default("junior"),
  templateId: z.string().optional(),
  persona: z.string().max(5000).optional(),
  goals: z.string().max(2000).optional(),
  personalityConfig: personalityConfigSchema.optional(),
  modelConfig: z
    .object({
      primary: z.string(),
      fallbacks: z.array(z.string()).optional(),
    })
    .optional(),
  phoneNumber: z.string().max(20).optional(),
  channels: z
    .array(z.enum(["slack", "discord", "telegram", "whatsapp", "email", "webchat", "phone", "signal", "teams", "google-chat", "matrix"]))
    .optional(),
  toolsAllow: z
    .array(z.string())
    .optional(),
  skills: z
    .array(z.string().max(100))
    .optional(),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type PersonalityConfigInput = z.infer<typeof personalityConfigSchema>;
