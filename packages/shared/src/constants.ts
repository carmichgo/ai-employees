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
  { id: "files", label: "Create & edit files", desc: "Write documents, spreadsheets, and organize files", toolsAllow: ["group:fs"] },
  { id: "code-execution", label: "Write & run code", desc: "Execute scripts, install packages, use the terminal", toolsAllow: ["group:runtime"] },
  { id: "scheduling", label: "Schedule recurring tasks", desc: "Set up automated routines and reminders", toolsAllow: ["group:automation"] },
  { id: "memory", label: "Remember past work", desc: "Recall previous conversations, contacts, and context", toolsAllow: ["group:memory", "group:sessions"] },
  { id: "images", label: "Create images & designs", desc: "Generate, edit, and analyze visual content", toolsAllow: ["image", "canvas"] },
  { id: "phone-calls", label: "Make phone calls", desc: "Place and receive voice calls", toolsAllow: [], plugins: ["voice-call"] },
  { id: "pdf", label: "Read & create PDFs", desc: "Generate reports, read documents, manipulate PDFs", toolsAllow: [], skills: ["nano-pdf"] },
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
  { id: "design-media", label: "Design & Media", desc: "Create images, edit videos, produce visual content", skills: ["openai-image-gen", "video-frames", "gifgrep"] },
  { id: "scheduling-ops", label: "Scheduling & Ops", desc: "Manage calendars, set reminders, automate workflows", skills: ["google"] },
  { id: "file-documents", label: "Files & Documents", desc: "Read, write, organize files, create PDFs", skills: ["nano-pdf"] },
];