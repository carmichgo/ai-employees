import type { EmployeeTier } from "./types/employee.js";

export const PLAN_LIMITS = {
  starter: { maxEmployees: 50, maxChannelsPerEmployee: 10 },
  professional: { maxEmployees: 50, maxChannelsPerEmployee: 10 },
  enterprise: { maxEmployees: 100, maxChannelsPerEmployee: 25 },
} as const;

// ── Employee Tier Configuration ──────────────────────
// Per-employee pricing model: tier determines model, resources, credits, and pricing.

export interface EmployeeTierConfig {
  id: EmployeeTier;
  label: string;
  subtitle: string;
  model: string;
  priceMonthly: number;
  creditsIncluded: number;
  overagePerCredit: number;
  resources: { memory: string; cpus: string };
}

export const EMPLOYEE_TIERS: Record<EmployeeTier, EmployeeTierConfig> = {
  junior: {
    id: "junior",
    label: "Junior AI Employee",
    subtitle: "Haiku — Fast & affordable",
    model: "anthropic/claude-haiku-4-5-20251001",
    priceMonthly: 99,
    creditsIncluded: 25,
    overagePerCredit: 0.25,
    resources: { memory: "2g", cpus: "1.0" },
  },
  senior: {
    id: "senior",
    label: "Senior AI Employee",
    subtitle: "Sonnet — Balanced power",
    model: "anthropic/claude-sonnet-4-5-20250929",
    priceMonthly: 299,
    creditsIncluded: 100,
    overagePerCredit: 0.50,
    resources: { memory: "4g", cpus: "2.0" },
  },
  expert: {
    id: "expert",
    label: "Expert AI Employee",
    subtitle: "Opus — Maximum capability",
    model: "anthropic/claude-opus-4-6",
    priceMonthly: 799,
    creditsIncluded: 300,
    overagePerCredit: 0.75,
    resources: { memory: "4g", cpus: "2.0" },
  },
} as const;

export const EMPLOYEE_TIER_OPTIONS: EmployeeTier[] = ["junior", "senior", "expert"];

/** Get the model string for a given employee tier */
export function getModelForTier(tier: EmployeeTier): string {
  return EMPLOYEE_TIERS[tier].model;
}

/** Get container resources for a given employee tier */
export function getResourcesForTier(tier: EmployeeTier): { memory: string; cpus: string } {
  return EMPLOYEE_TIERS[tier].resources;
}

// Legacy — kept for backward compatibility with existing company plan checks
export const CONTAINER_RESOURCES = {
  starter: { memory: "2g", cpus: "1.0" },
  professional: { memory: "4g", cpus: "2.0" },
  enterprise: { memory: "8g", cpus: "4.0" },
} as const;

// ── Add-on Pricing ─────────────────────────────────────
// Some channels, capabilities, and skills cost extra per month.
// Higher tiers unlock some add-ons for free ("included").
// "free" = included at no extra cost for that tier.
// number = monthly add-on price for that tier.

export type AddonPricing = Record<EmployeeTier, "free" | number>;

export interface AddonConfig {
  /** Map of item ID → per-tier pricing */
  channels: Record<string, AddonPricing>;
  capabilities: Record<string, AddonPricing>;
  expertise: Record<string, AddonPricing>;
}

export const ADDON_PRICING: AddonConfig = {
  channels: {
    // Free for all tiers
    slack:        { junior: "free", senior: "free", expert: "free" },
    email:        { junior: "free", senior: "free", expert: "free" },
    // Jr add-on, Sr+ included
    telegram:     { junior: 9,      senior: "free", expert: "free" },
    discord:      { junior: 9,      senior: "free", expert: "free" },
    // Jr/Sr add-on, Expert included
    whatsapp:     { junior: 19,     senior: 19,     expert: "free" },
    teams:        { junior: 19,     senior: 19,     expert: "free" },
    "google-chat":{ junior: 19,     senior: 19,     expert: "free" },
    // Add-on for all tiers
    signal:       { junior: 29,     senior: 29,     expert: 19 },
    matrix:       { junior: 29,     senior: 29,     expert: 19 },
  },
  capabilities: {
    // Free for all tiers
    "web-browsing":    { junior: "free", senior: "free", expert: "free" },
    "internet-search": { junior: "free", senior: "free", expert: "free" },
    files:             { junior: "free", senior: "free", expert: "free" },
    memory:            { junior: "free", senior: "free", expert: "free" },
    // Jr add-on, Sr+ included
    email:             { junior: 19,     senior: "free", expert: "free" },
    "code-execution":  { junior: 19,     senior: "free", expert: "free" },
    pdf:               { junior: 19,     senior: "free", expert: "free" },
    // Jr/Sr add-on, Expert included
    scheduling:        { junior: 29,     senior: 19,     expert: "free" },
    // Add-on for all tiers (expensive resources)
    "image-generation":{ junior: 29,     senior: 19,     expert: 9 },
    "video-generation":{ junior: 49,     senior: 39,     expert: 29 },
    "phone-calls":     { junior: 49,     senior: 39,     expert: 29 },
  },
  expertise: {
    // Free for all tiers
    "web-research":    { junior: "free", senior: "free", expert: "free" },
    "email-outreach":  { junior: "free", senior: "free", expert: "free" },
    writing:           { junior: "free", senior: "free", expert: "free" },
    // Jr add-on, Sr+ included
    "data-analytics":  { junior: 19,     senior: "free", expert: "free" },
    "customer-support":{ junior: 19,     senior: "free", expert: "free" },
    "file-documents":  { junior: 19,     senior: "free", expert: "free" },
    // Jr/Sr add-on, Expert included
    "code-engineering":{ junior: 29,     senior: 19,     expert: "free" },
    "social-media":    { junior: 29,     senior: 19,     expert: "free" },
    "project-management":{ junior: 29,   senior: 19,     expert: "free" },
    // Add-on for all tiers
    "sales-crm":       { junior: 39,     senior: 29,     expert: 19 },
    "design-media":    { junior: 39,     senior: 29,     expert: 19 },
    "scheduling-ops":  { junior: 39,     senior: 29,     expert: 19 },
  },
};

/** Get the add-on price for an item, or "free" if included with the tier */
export function getAddonPrice(
  category: keyof AddonConfig,
  itemId: string,
  tier: EmployeeTier,
): "free" | number {
  const pricing = ADDON_PRICING[category][itemId];
  if (!pricing) return "free";
  return pricing[tier];
}

/** Calculate total monthly add-on cost for selected items */
export function calculateAddonTotal(
  tier: EmployeeTier,
  channels: string[],
  capabilities: string[],
  expertise: string[],
): number {
  let total = 0;
  for (const ch of channels) {
    const price = getAddonPrice("channels", ch, tier);
    if (price !== "free") total += price;
  }
  for (const cap of capabilities) {
    const price = getAddonPrice("capabilities", cap, tier);
    if (price !== "free") total += price;
  }
  for (const exp of expertise) {
    const price = getAddonPrice("expertise", exp, tier);
    if (price !== "free") total += price;
  }
  return total;
}

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
  "signal",
  "teams",
  "google-chat",
  "matrix",
] as const;

// ── Capability Options ─────────────────────────────────
// User-friendly tool capabilities shown in the wizard.
// Each maps to technical toolsAllow entries + optional skills/plugins.

export interface CapabilityOption {
  id: string;
  label: string;
  desc: string;
  toolsAllow: string[];
  skills?: string[];
  plugins?: string[];
}

export const CAPABILITY_OPTIONS: CapabilityOption[] = [
  { id: "web-browsing", label: "Browse websites", desc: "Visit websites, fill forms, extract data", toolsAllow: ["group:web", "browser", "web_fetch"] },
  { id: "internet-search", label: "Search the internet", desc: "Find information, news, and answers online", toolsAllow: ["web_search"] },
  { id: "email", label: "Send & receive emails", desc: "Read inbox, compose emails, manage threads", toolsAllow: ["group:messaging"], skills: ["himalaya"] },
  { id: "files", label: "Create & edit files", desc: "Write documents, spreadsheets, PDFs, and organize files", toolsAllow: ["group:fs"], skills: ["nano-pdf"] },
  { id: "code-execution", label: "Write & run code", desc: "Execute scripts, install packages, use the terminal", toolsAllow: ["group:runtime"] },
  { id: "scheduling", label: "Schedule recurring tasks", desc: "Set up automated routines and reminders", toolsAllow: ["group:automation"] },
  { id: "memory", label: "Remember past work", desc: "Recall previous conversations, contacts, and context", toolsAllow: ["group:memory", "group:sessions"] },
  { id: "image-generation", label: "AI Image Generation", desc: "Create images, illustrations, and designs on demand", toolsAllow: ["image", "canvas", "group:runtime"], skills: ["openai-image-gen", "gifgrep", "media-generation"] },
  { id: "video-generation", label: "AI Video Generation", desc: "Generate video clips and animations from text prompts", toolsAllow: ["group:runtime"], skills: ["video-frames", "media-generation"] },
  { id: "phone-calls", label: "Make phone calls", desc: "Place and receive voice calls", toolsAllow: [], plugins: ["voice-call"] },
];

// ── Expertise Options ──────────────────────────────────
// User-friendly focus areas shown in the wizard skills step.
// Each maps to real OpenClaw skill slugs behind the scenes.

export interface ExpertiseOption {
  id: string;
  label: string;
  desc: string;
  skills: string[];
}

export const EXPERTISE_OPTIONS: ExpertiseOption[] = [
  { id: "web-research", label: "Web Research", desc: "Search the web, read articles, compile reports", skills: ["sag", "summarize", "blogwatcher"] },
  { id: "email-outreach", label: "Email & Outreach", desc: "Write email sequences, manage inbox, follow up", skills: ["himalaya"] },
  { id: "writing", label: "Writing & Content", desc: "Blog posts, social copy, documents, marketing material", skills: ["summarize", "nano-pdf"] },
  { id: "code-engineering", label: "Code & Engineering", desc: "Write code, manage GitHub repos, review pull requests", skills: ["github", "coding-agent", "tmux"] },
  { id: "social-media", label: "Social Media", desc: "Post on Twitter/X, manage accounts, track engagement", skills: ["bird"] },
  { id: "data-analytics", label: "Data & Analytics", desc: "Analyze data, build reports, track metrics", skills: ["google", "summarize"] },
  { id: "project-management", label: "Project Management", desc: "Organize tasks, coordinate work, manage boards", skills: ["notion", "trello", "google"] },
  { id: "customer-support", label: "Customer Support", desc: "Handle tickets, write help docs, resolve issues", skills: ["himalaya", "summarize"] },
  { id: "sales-crm", label: "Sales & CRM", desc: "Find prospects, track deals, manage pipeline", skills: ["himalaya", "sag"] },
  { id: "scheduling-ops", label: "Scheduling & Ops", desc: "Manage calendars, set reminders, automate workflows", skills: ["google"] },
];