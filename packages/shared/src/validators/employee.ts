import { z } from "zod";

export const personalityConfigSchema = z.object({
  autonomy: z.enum(["full", "high", "moderate", "low"]).default("high"),
  proactivity: z.enum(["very-proactive", "proactive", "balanced", "reactive"]).default("proactive"),
  communication: z.enum(["concise", "detailed", "casual", "formal"]).default("concise"),
});

export const createEmployeeSchema = z.object({
  name: z.string().min(1).max(100),
  jobTitle: z.string().min(1).max(255),
  templateId: z.string().optional(),
  persona: z.string().max(5000).optional(),
  goals: z.string().max(2000).optional(),
  personalityConfig: personalityConfigSchema.optional(),
  modelConfig: z
    .object({
      primary: z.string().default("anthropic/claude-opus-4-6"),
      fallbacks: z.array(z.string()).optional(),
    })
    .optional(),
  channels: z
    .array(z.enum(["slack", "discord", "telegram", "whatsapp", "email", "webchat", "browser"]))
    .optional(),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type PersonalityConfigInput = z.infer<typeof personalityConfigSchema>;
