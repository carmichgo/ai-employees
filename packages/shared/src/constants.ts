export const PLAN_LIMITS = {
  starter: { maxEmployees: 3, maxChannelsPerEmployee: 3 },
  professional: { maxEmployees: 15, maxChannelsPerEmployee: 10 },
  enterprise: { maxEmployees: 100, maxChannelsPerEmployee: 25 },
} as const;

export const CONTAINER_RESOURCES = {
  starter: { memory: "1g", cpus: "0.5" },
  professional: { memory: "2g", cpus: "1.0" },
  enterprise: { memory: "4g", cpus: "2.0" },
} as const;

export const EMPLOYEE_STATUSES = [
  "provisioning",
  "onboarding",
  "active",
  "paused",
  "terminated",
  "error",
] as const;

export const CHANNEL_TYPES = [
  "slack",
  "discord",
  "telegram",
  "whatsapp",
  "email",
  "webchat",
  "browser",
] as const;
