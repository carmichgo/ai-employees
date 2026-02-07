export type EmployeeStatus =
  | "provisioning"
  | "onboarding"
  | "active"
  | "paused"
  | "terminated"
  | "error";

export type ChannelType =
  | "slack"
  | "discord"
  | "telegram"
  | "whatsapp"
  | "email"
  | "webchat"
  | "browser";

export type PlanTier = "starter" | "professional" | "enterprise";

export interface ModelConfig {
  primary: string;
  fallbacks?: string[];
}

export interface ToolsConfig {
  profile?: "full" | "messaging" | "readonly";
  allow?: string[];
  deny?: string[];
}

export interface ProvisionedAccounts {
  slack?: { botToken: string; teamId: string };
  discord?: { token: string; guildId: string };
  telegram?: { token: string };
  whatsapp?: { phoneNumberId: string; accessToken: string };
  email?: { address: string; imapHost: string; smtpHost: string };
  browser?: { enabled: boolean };
}

export interface EmployeeCreateInput {
  name: string;
  jobTitle: string;
  templateId?: string;
  persona?: string;
  goals?: string;
  modelConfig?: ModelConfig;
  channels?: ChannelType[];
}
