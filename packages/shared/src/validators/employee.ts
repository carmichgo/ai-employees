import { z } from "zod";

export const createEmployeeSchema = z.object({
  name: z.string().min(1).max(100),
  jobTitle: z.string().min(1).max(255),
  templateId: z.string().optional(),
  persona: z.string().max(5000).optional(),
  goals: z.string().max(2000).optional(),
  modelConfig: z
    .object({
      primary: z.string().default("anthropic/claude-sonnet-4-20250514"),
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
