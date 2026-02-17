"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import {
  JOB_TEMPLATES,
  getJobTemplateCategories,
  getJobTemplate,
  AUTONOMY_OPTIONS,
  PROACTIVITY_OPTIONS,
  COMMUNICATION_OPTIONS,
  BOSS_TECHNICAL_LEVEL_OPTIONS,
  DEFAULT_AUTHORITY_ROLE_OPTIONS,
  DEFAULT_PERSONALITY,
  CAPABILITY_OPTIONS,
  EXPERTISE_OPTIONS,
  EMPLOYEE_TIERS,
  EMPLOYEE_TIER_OPTIONS,
  getAddonPrice,
  calculateAddonTotal,
  type PersonalityConfig,
  type EmployeeTier,
} from "@ai-employees/shared";
import {
  Check,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Loader2,
  Globe,
  Mail,
  PenLine,
  Code,
  BarChart3,
  Share2,
  KanbanSquare,
  Headphones,
  Target,
  Palette,
  Calendar,
  FileText,
  MessageSquare,
  Send,
  Smartphone,
  Gamepad2,
  ChevronDown,
  Shield,
  Grid3X3,
  Hash,
  MonitorSmartphone,
  Wrench,
  Zap,
  Crown,
  Rocket,
  Video,
  Users,
  Plus,
  Trash2,
} from "lucide-react";

// ── Steps ──────────────────────────────────────

type Step = "role" | "identity" | "tier" | "personality" | "boss-tech" | "authority" | "channels" | "tools" | "skills" | "review";
const STEPS: Step[] = ["role", "identity", "tier", "personality", "boss-tech", "authority", "channels", "tools", "skills", "review"];
const SKIPPABLE_STEPS: Step[] = ["authority", "channels", "tools", "skills"];

// ── Channel Options ────────────────────────────

const CHANNEL_OPTIONS = [
  { id: "slack", label: "Slack", desc: "Team messaging & collaboration", Icon: MessageSquare },
  { id: "email", label: "Email", desc: "Dedicated email inbox", Icon: Mail },
  { id: "telegram", label: "Telegram", desc: "Telegram messaging", Icon: Send },
  { id: "whatsapp", label: "WhatsApp", desc: "WhatsApp Business", Icon: Smartphone },
  { id: "discord", label: "Discord", desc: "Discord server", Icon: Gamepad2 },
  { id: "signal", label: "Signal", desc: "Private encrypted messaging", Icon: Shield },
  { id: "teams", label: "Microsoft Teams", desc: "Teams channels & chats", Icon: MonitorSmartphone },
  { id: "google-chat", label: "Google Chat", desc: "Google Workspace messaging", Icon: MessageSquare },
  { id: "matrix", label: "Matrix", desc: "Decentralized chat (Element)", Icon: Hash },
];

// ── Capability icons ───────────────────────────

const CAPABILITY_ICONS: Record<string, any> = {
  "web-browsing": Globe,
  "internet-search": Globe,
  email: Mail,
  files: FileText,
  "code-execution": Code,
  scheduling: Calendar,
  memory: Sparkles,
  images: Palette,
  "video-generation": Video,
  "phone-calls": Headphones,
  pdf: FileText,
};

// ── Expertise icons ────────────────────────────

const EXPERTISE_ICONS: Record<string, any> = {
  "web-research": Globe,
  "email-outreach": Mail,
  writing: PenLine,
  "code-engineering": Code,
  "social-media": Share2,
  "data-analytics": BarChart3,
  "project-management": KanbanSquare,
  "customer-support": Headphones,
  "sales-crm": Target,
  "design-media": Palette,
  "scheduling-ops": Calendar,
  "file-documents": FileText,
};

// ── All capability IDs (for default-all-on) ────

const ALL_CAPABILITY_IDS = CAPABILITY_OPTIONS.map((c) => c.id);

// ── Template → Capability Mapping ──────────────

const TEMPLATE_CAPABILITIES: Record<string, string[]> = {
  marketer: ALL_CAPABILITY_IDS,
  "seo-manager": ALL_CAPABILITY_IDS,
  coo: ALL_CAPABILITY_IDS,
  "customer-support": ALL_CAPABILITY_IDS,
  "sales-rep": ALL_CAPABILITY_IDS,
  "software-engineer": ALL_CAPABILITY_IDS,
  "data-analyst": ALL_CAPABILITY_IDS,
  "content-writer": ALL_CAPABILITY_IDS,
  "executive-assistant": ALL_CAPABILITY_IDS,
  researcher: ALL_CAPABILITY_IDS,
};

// ── Template → Expertise Mapping ───────────────

const TEMPLATE_EXPERTISE: Record<string, string[]> = {
  marketer: ["web-research", "writing", "social-media", "data-analytics", "email-outreach", "design-media"],
  "seo-manager": ["web-research", "writing", "data-analytics"],
  coo: ["project-management", "data-analytics", "scheduling-ops"],
  "customer-support": ["customer-support", "writing", "email-outreach"],
  "sales-rep": ["sales-crm", "email-outreach", "web-research"],
  "software-engineer": ["code-engineering", "web-research", "file-documents"],
  "data-analyst": ["data-analytics", "code-engineering", "file-documents"],
  "content-writer": ["writing", "web-research", "social-media", "design-media"],
  "executive-assistant": ["scheduling-ops", "email-outreach", "file-documents"],
  researcher: ["web-research", "writing", "data-analytics", "file-documents"],
};

// ── Expand helpers ─────────────────────────────

function expandCapabilities(capIds: string[]): string[] {
  const tools = new Set<string>();
  for (const id of capIds) {
    const cap = CAPABILITY_OPTIONS.find((c) => c.id === id);
    if (cap) {
      for (const t of cap.toolsAllow) tools.add(t);
    }
  }
  return Array.from(tools);
}

function expandExpertise(expertiseIds: string[]): string[] {
  const skills = new Set<string>();
  for (const id of expertiseIds) {
    const exp = EXPERTISE_OPTIONS.find((e) => e.id === id);
    if (exp) {
      for (const s of exp.skills) skills.add(s);
    }
  }
  return Array.from(skills);
}

// ── Styles ─────────────────────────────────────

const styles = {
  heading: {
    fontSize: "clamp(1.75rem, 3vw, 2.25rem)",
    fontWeight: 700,
    letterSpacing: "-0.03em",
    lineHeight: 1.15,
    color: "var(--text)",
    margin: 0,
  } as React.CSSProperties,
  subtitle: {
    fontSize: 15,
    color: "var(--text-secondary)",
    marginTop: 8,
    marginBottom: 0,
    lineHeight: 1.5,
  } as React.CSSProperties,
  sectionLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text)",
    marginBottom: 8,
  } as React.CSSProperties,
  sectionHint: {
    fontSize: 12,
    color: "var(--text-tertiary)",
    marginBottom: 12,
    marginTop: -4,
    lineHeight: 1.4,
  } as React.CSSProperties,
};

// ── Component ──────────────────────────────────

export default function HireEmployeePage() {
  return (
    <Suspense>
      <HireEmployeeWizard />
    </Suspense>
  );
}

function HireEmployeeWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [paymentStatus, setPaymentStatus] = useState<"success" | "cancelled" | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [animKey, setAnimKey] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [form, setForm] = useState({
    name: "",
    jobTitle: "",
    tier: "senior" as EmployeeTier,
    persona: "",
    goals: "",
    channels: [] as string[],
    capabilities: [...ALL_CAPABILITY_IDS] as string[],
    skills: [] as string[],
    personality: { ...DEFAULT_PERSONALITY } as PersonalityConfig,
    authority: {
      defaultRole: "manager" as "manager" | "colleague",
      members: [] as Array<{ slackUserId: string; name: string; role: "manager" | "colleague" }>,
    },
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const step = STEPS[stepIndex];
  const template = selectedTemplate ? getJobTemplate(selectedTemplate) : null;
  const categories = getJobTemplateCategories();

  // ── Handle Stripe return ───────────────────
  useEffect(() => {
    const payment = searchParams.get("payment");
    if (payment === "success") {
      setPaymentStatus("success");
      // Redirect to employees list after a brief pause
      const timer = setTimeout(() => router.push("/dashboard/employees"), 3000);
      return () => clearTimeout(timer);
    }
    if (payment === "cancelled") {
      setPaymentStatus("cancelled");
    }
  }, [searchParams, router]);

  // ── Navigation ─────────────────────────────

  const goTo = useCallback(
    (index: number) => {
      setDirection(index > stepIndex ? "forward" : "back");
      setAnimKey((k) => k + 1);
      setStepIndex(index);
    },
    [stepIndex],
  );

  const goNext = useCallback(() => {
    if (stepIndex < STEPS.length - 1) goTo(stepIndex + 1);
  }, [stepIndex, goTo]);

  const goBack = useCallback(() => {
    if (stepIndex > 0) goTo(stepIndex - 1);
  }, [stepIndex, goTo]);

  // ── Template Selection ─────────────────────

  const handleSelectTemplate = (id: string) => {
    const t = getJobTemplate(id)!;
    setSelectedTemplate(id);
    setForm({
      name: "",
      jobTitle: t.title,
      tier: "senior" as EmployeeTier,
      persona: t.persona,
      goals: t.goals,
      channels: [...t.suggestedChannels],
      capabilities: TEMPLATE_CAPABILITIES[id] || [...ALL_CAPABILITY_IDS],
      skills: TEMPLATE_EXPERTISE[id] || [],
      personality: { ...t.defaultPersonality },
      authority: { defaultRole: "manager", members: [] },
    });
    goTo(1);
  };

  const handleCustom = () => {
    setSelectedTemplate(null);
    setForm({
      name: "",
      jobTitle: "",
      tier: "senior" as EmployeeTier,
      persona: "",
      goals: "",
      channels: [],
      capabilities: [...ALL_CAPABILITY_IDS],
      skills: [],
      personality: { ...DEFAULT_PERSONALITY },
      authority: { defaultRole: "manager", members: [] },
    });
    goTo(1);
  };

  // ── Toggles ────────────────────────────────

  const toggleChannel = (id: string) => {
    setForm((f) => ({
      ...f,
      channels: f.channels.includes(id) ? f.channels.filter((c) => c !== id) : [...f.channels, id],
    }));
  };

  const toggleCapability = (id: string) => {
    setForm((f) => ({
      ...f,
      capabilities: f.capabilities.includes(id) ? f.capabilities.filter((c) => c !== id) : [...f.capabilities, id],
    }));
  };

  const toggleSkill = (id: string) => {
    setForm((f) => ({
      ...f,
      skills: f.skills.includes(id) ? f.skills.filter((s) => s !== id) : [...f.skills, id],
    }));
  };

  // ── Submit ─────────────────────────────────

  const buildPersona = () => {
    let persona = form.persona;
    if (form.skills.length > 0) {
      const labels = form.skills
        .map((id) => EXPERTISE_OPTIONS.find((s) => s.id === id)?.label)
        .filter(Boolean);
      if (labels.length > 0) {
        persona += `\n\n## Focus Areas\nYou should particularly excel at and prioritize: ${labels.join(", ")}. While you have access to all tools and capabilities, these are your primary areas of expertise and where you should invest the most effort.`;
      }
    }
    return persona;
  };

  const handleHire = async () => {
    setError("");
    setLoading(true);
    try {
      const toolsAllow = expandCapabilities(form.capabilities);
      const skillSlugs = expandExpertise(form.skills);

      const hireData = {
        name: form.name,
        jobTitle: form.jobTitle,
        tier: form.tier,
        templateId: selectedTemplate || undefined,
        persona: buildPersona() || undefined,
        goals: form.goals || undefined,
        channels: form.channels,
        toolsAllow,
        skills: skillSlugs,
        personalityConfig: form.personality,
        authorityConfig: form.authority.members.length > 0 || form.authority.defaultRole !== "manager"
          ? form.authority
          : undefined,
      };

      // Try Stripe billing first — if configured:
      //   - First hire: returns { url } → redirect to Stripe Checkout
      //   - Subsequent hires: returns { employee } → line item added to existing subscription
      try {
        const checkout = await api.createCheckoutSession({
          ...hireData,
          capabilities: form.capabilities,
          expertise: form.skills,
        });
        if (checkout.url) {
          // First hire — redirect to Stripe Checkout for payment
          window.location.href = checkout.url;
          return;
        }
        if ((checkout as any).employee) {
          // Subsequent hire — employee was created and billed immediately
          router.push(`/dashboard/employees/${(checkout as any).employee.id}`);
          return;
        }
      } catch (checkoutErr: any) {
        // If billing fails (Stripe not configured, network error, etc.),
        // fall back to direct hire
        if (checkoutErr.status && checkoutErr.status !== 500 && checkoutErr.status < 500) throw checkoutErr;
      }

      // Fallback: direct hire (no Stripe)
      const result = await api.hireEmployee(hireData);
      router.push(`/dashboard/employees/${result.employee.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to hire employee");
      setLoading(false);
    }
  };

  // ── Validation ─────────────────────────────

  const canProceedFromIdentity = form.name.trim() && form.jobTitle.trim();

  // ── Animation class ────────────────────────

  const animClass = direction === "forward" ? "wizard-step-forward" : "wizard-step-back";

  // ── Render helpers ─────────────────────────

  const renderSelectionCard = ({
    selected,
    onClick,
    icon,
    label,
    desc,
    priceBadge,
  }: {
    selected: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    desc?: string;
    priceBadge?: "free" | number;
  }) => (
    <button
      onClick={onClick}
      style={{
        padding: "16px 18px",
        background: "#ffffff",
        border: selected ? "1.5px solid var(--text)" : "1px solid var(--border)",
        borderRadius: "var(--radius-xl)",
        cursor: "pointer",
        textAlign: "left",
        transition: "all 0.15s ease",
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        position: "relative",
        height: "100%",
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--border-hover)";
          (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-sm)";
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
          (e.currentTarget as HTMLElement).style.boxShadow = "none";
        }
      }}
    >
      {icon && <div style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>{icon}</div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text)",
              letterSpacing: "-0.01em",
            }}
          >
            {label}
          </div>
          {priceBadge !== undefined && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 6px",
                borderRadius: 4,
                whiteSpace: "nowrap",
                ...(priceBadge === "free"
                  ? { color: "#16a34a", background: "rgba(22, 163, 74, 0.08)" }
                  : { color: "#d97706", background: "rgba(217, 119, 6, 0.08)" }),
              }}
            >
              {priceBadge === "free" ? "Included" : `+$${priceBadge}/mo`}
            </span>
          )}
        </div>
        {desc && (
          <div
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              lineHeight: 1.4,
              marginTop: 2,
            }}
          >
            {desc}
          </div>
        )}
      </div>
      {selected && (
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "var(--text)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Check size={11} style={{ color: "#ffffff" }} />
        </div>
      )}
    </button>
  );

  const renderPersonalityRow = (
    label: string,
    hint: string,
    options: readonly { value: string; label: string; desc: string }[],
    currentValue: string,
    onChange: (value: string) => void,
  ) => (
    <div>
      <div style={styles.sectionLabel}>{label}</div>
      <p style={styles.sectionHint}>{hint}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {options.map((opt) => {
          const selected = currentValue === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              style={{
                padding: "12px 12px",
                background: selected ? "#ffffff" : "var(--bg-secondary)",
                border: selected ? "1.5px solid var(--text)" : "1px solid var(--border)",
                borderRadius: "var(--radius-xl)",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s ease",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: selected ? 600 : 500,
                  color: "var(--text)",
                  marginBottom: 2,
                }}
              >
                {opt.label}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.4 }}>
                {opt.desc}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  // ── Bottom nav bar ─────────────────────────

  const renderBottomNav = ({
    showBack = true,
    showSkip = false,
    showNext = true,
    nextLabel = "Next",
    nextDisabled = false,
    onNext,
    isLoading = false,
  }: {
    showBack?: boolean;
    showSkip?: boolean;
    showNext?: boolean;
    nextLabel?: string;
    nextDisabled?: boolean;
    onNext?: () => void;
    isLoading?: boolean;
  }) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 48,
        paddingTop: 24,
      }}
    >
      {/* Left: Back + Skip */}
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        {showBack && stepIndex > 0 && (
          <button
            onClick={goBack}
            style={{
              background: "none",
              border: "none",
              color: "var(--text)",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
              padding: 0,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            Back
          </button>
        )}
        {showSkip && (
          <button
            onClick={goNext}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-tertiary)",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Skip
          </button>
        )}
      </div>

      {/* Center: Step dots */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {STEPS.map((_, i) => (
          <div
            key={i}
            style={{
              width: i === stepIndex ? 24 : 8,
              height: 8,
              borderRadius: 4,
              background: i === stepIndex ? "var(--text)" : "var(--border)",
              transition: "all 0.3s ease",
            }}
          />
        ))}
      </div>

      {/* Right: Next / Hire button */}
      <div>
        {showNext && (
          <button
            className="btn-primary"
            disabled={nextDisabled || isLoading}
            onClick={onNext || goNext}
            style={{
              borderRadius: 20,
              height: 40,
              padding: "0 24px",
              fontSize: 14,
              gap: 8,
            }}
          >
            {isLoading ? (
              <>
                <Loader2
                  size={16}
                  style={{ animation: "spin 1s linear infinite" }}
                />
                Setting up...
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
              </>
            ) : (
              <>
                {nextLabel}
                <ArrowRight size={15} />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );

  // ── Review pills ───────────────────────────

  const pillStyle = {
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    padding: "4px 10px",
    borderRadius: 100,
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text)",
    display: "inline-flex" as const,
    alignItems: "center" as const,
    gap: 5,
  };

  // ── Step renderers ─────────────────────────

  return (
    <div
      style={{
        maxWidth: 720,
        width: "100%",
        margin: "0 auto",
        minHeight: "calc(100vh - 48px)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "40px 0",
      }}
    >
      {/* ═══ Payment Return Status ═══ */}
      {paymentStatus === "success" && (
        <div style={{
          textAlign: "center",
          padding: "80px 20px",
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "rgba(22, 163, 74, 0.1)", margin: "0 auto 20px",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Check size={32} style={{ color: "#16a34a" }} />
          </div>
          <h1 style={styles.heading}>Payment confirmed!</h1>
          <p style={styles.subtitle}>
            Your new employee is being set up. Redirecting to your team...
          </p>
          <div style={{ marginTop: 24 }}>
            <Loader2 size={20} className="spin" style={{ color: "var(--text-secondary)" }} />
          </div>
        </div>
      )}
      {paymentStatus === "cancelled" && (
        <div style={{
          background: "rgba(217, 119, 6, 0.06)",
          border: "1px solid rgba(217, 119, 6, 0.15)",
          borderRadius: "var(--radius-lg)",
          padding: "14px 18px",
          marginBottom: 24,
          fontSize: 13,
          color: "#d97706",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          Payment was cancelled. You can try again when you&apos;re ready.
          <button
            onClick={() => setPaymentStatus(null)}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              color: "#d97706",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ═══ Step 1: Role Selection ═══ */}
      {step === "role" && paymentStatus !== "success" && (
        <div key={animKey} className={animClass}>
          <h1 style={styles.heading}>What role should they fill?</h1>
          <p style={styles.subtitle}>
            Pick a starting point — you can customize everything later
          </p>

          <div style={{ marginTop: 40 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 10,
              }}
            >
              {JOB_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleSelectTemplate(t.id)}
                  style={{
                    padding: "20px 16px",
                    background: "#ffffff",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-xl)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s ease",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--border-hover)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-sm)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "none";
                  }}
                >
                  <div style={{ fontSize: 28 }}>{t.emoji}</div>
                  <div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--text)",
                        letterSpacing: "-0.01em",
                        marginBottom: 2,
                      }}
                    >
                      {t.title}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--text-secondary)",
                        lineHeight: 1.4,
                      }}
                    >
                      {t.description.slice(0, 65)}...
                    </div>
                  </div>
                </button>
              ))}

              {/* Custom Role card */}
              <button
                onClick={handleCustom}
                style={{
                  padding: "20px 16px",
                  background: "#ffffff",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-xl)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--border-hover)";
                  (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-sm)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                  (e.currentTarget as HTMLElement).style.boxShadow = "none";
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "rgba(37, 99, 235, 0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Sparkles size={18} style={{ color: "var(--blue)" }} />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--text)",
                      letterSpacing: "-0.01em",
                      marginBottom: 2,
                    }}
                  >
                    Custom Role
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      lineHeight: 1.4,
                    }}
                  >
                    Build your own from scratch
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Bottom nav: dots only, no buttons on step 1 */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginTop: 48,
              paddingTop: 24,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: i === stepIndex ? 24 : 8,
                    height: 8,
                    borderRadius: 4,
                    background: i === stepIndex ? "var(--text)" : "var(--border)",
                    transition: "all 0.3s ease",
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Step 2: Identity ═══ */}
      {step === "identity" && (
        <div key={animKey} className={animClass}>
          <h1 style={styles.heading}>What should we call them?</h1>
          <p style={styles.subtitle}>
            Give your new {template ? template.title.toLowerCase() : "employee"} a name and title
          </p>

          <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 24 }}>
            <div>
              <label style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", display: "block", marginBottom: 8 }}>
                Employee Name
              </label>
              <input
                className="input"
                placeholder="e.g., Sarah, Alex, Jordan"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
                style={{
                  height: 44,
                  fontSize: 15,
                  borderRadius: "var(--radius-xl)",
                  padding: "0 16px",
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", display: "block", marginBottom: 8 }}>
                Job Title
              </label>
              <input
                className="input"
                placeholder="e.g., Marketing Manager"
                value={form.jobTitle}
                onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
                style={{
                  height: 44,
                  fontSize: 15,
                  borderRadius: "var(--radius-xl)",
                  padding: "0 16px",
                }}
              />
            </div>
          </div>

          {renderBottomNav({
            nextDisabled: !canProceedFromIdentity,
          })}
        </div>
      )}

      {/* ═══ Step 3: Employee Tier ═══ */}
      {step === "tier" && (
        <div key={animKey} className={animClass}>
          <h1 style={styles.heading}>Choose their experience level</h1>
          <p style={styles.subtitle}>
            This determines {form.name || "their"} AI model, speed, and monthly cost
          </p>

          <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 12 }}>
            {EMPLOYEE_TIER_OPTIONS.map((tierId) => {
              const config = EMPLOYEE_TIERS[tierId];
              const selected = form.tier === tierId;
              const TierIcon = tierId === "junior" ? Zap : tierId === "senior" ? Rocket : Crown;
              return (
                <button
                  key={tierId}
                  onClick={() => setForm({ ...form, tier: tierId })}
                  style={{
                    padding: "24px 24px",
                    background: selected ? "#ffffff" : "var(--bg-secondary)",
                    border: selected ? "1.5px solid var(--text)" : "1px solid var(--border)",
                    borderRadius: "var(--radius-2xl)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s ease",
                    display: "flex",
                    alignItems: "center",
                    gap: 20,
                    position: "relative",
                  }}
                  onMouseEnter={(e) => {
                    if (!selected) {
                      (e.currentTarget as HTMLElement).style.borderColor = "var(--border-hover)";
                      (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-sm)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!selected) {
                      (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                      (e.currentTarget as HTMLElement).style.boxShadow = "none";
                    }
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      background: selected ? "var(--text)" : "var(--bg-secondary)",
                      border: selected ? "none" : "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      transition: "all 0.15s ease",
                    }}
                  >
                    <TierIcon size={22} style={{ color: selected ? "#ffffff" : "var(--text-secondary)" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
                      <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>
                        {config.label}
                      </div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text)" }}>
                        ${config.priceMonthly}<span style={{ fontSize: 13, fontWeight: 400, color: "var(--text-secondary)" }}>/mo</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      {config.subtitle}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>
                      {config.creditsIncluded} task credits/mo &middot; ${config.overagePerCredit.toFixed(2)}/credit overage
                    </div>
                  </div>
                  {selected && (
                    <div
                      style={{
                        position: "absolute",
                        top: 14,
                        right: 14,
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        background: "var(--text)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Check size={13} style={{ color: "#ffffff" }} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {renderBottomNav({})}
        </div>
      )}

      {/* ═══ Step 4: Personality ═══ */}
      {step === "personality" && (
        <div key={animKey} className={animClass}>
          <h1 style={styles.heading}>How should they work?</h1>
          <p style={styles.subtitle}>
            Set {form.name || "their"} decision-making, initiative, and communication style
          </p>

          <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 28 }}>
            {renderPersonalityRow(
              "Decision Making",
              `How much should ${form.name || "they"} check with you before acting?`,
              AUTONOMY_OPTIONS,
              form.personality.autonomy,
              (v) => setForm({ ...form, personality: { ...form.personality, autonomy: v as any } }),
            )}
            {renderPersonalityRow(
              "Work Style",
              `Should ${form.name || "they"} find things to do, or wait for instructions?`,
              PROACTIVITY_OPTIONS,
              form.personality.proactivity,
              (v) => setForm({ ...form, personality: { ...form.personality, proactivity: v as any } }),
            )}
            {renderPersonalityRow(
              "Communication",
              `How should ${form.name || "they"} communicate with you?`,
              COMMUNICATION_OPTIONS,
              form.personality.communication,
              (v) => setForm({ ...form, personality: { ...form.personality, communication: v as any } }),
            )}
          </div>

          {renderBottomNav({})}
        </div>
      )}

      {/* ═══ Step 4: Boss Technical Level ═══ */}
      {step === "boss-tech" && (
        <div key={animKey} className={animClass}>
          <h1 style={styles.heading}>How technical are you?</h1>
          <p style={styles.subtitle}>
            This helps {form.name || "your employee"} understand how to work with you —
            whether to use APIs and code, or stick to simple browser-based automation
          </p>

          <div style={{ marginTop: 40 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, maxWidth: 520 }}>
              {BOSS_TECHNICAL_LEVEL_OPTIONS.map((opt) => {
                const selected = form.personality.bossTechnicalLevel === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() =>
                      setForm({
                        ...form,
                        personality: { ...form.personality, bossTechnicalLevel: opt.value as any },
                      })
                    }
                    style={{
                      padding: "20px 22px",
                      background: selected ? "#ffffff" : "var(--bg-secondary)",
                      border: selected ? "1.5px solid var(--text)" : "1px solid var(--border)",
                      borderRadius: "var(--radius-xl)",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.15s ease",
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                      position: "relative",
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) {
                        (e.currentTarget as HTMLElement).style.borderColor = "var(--border-hover)";
                        (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-sm)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) {
                        (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                        (e.currentTarget as HTMLElement).style.boxShadow = "none";
                      }
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: selected ? "var(--text)" : "var(--bg-secondary)",
                        border: selected ? "none" : "1px solid var(--border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        transition: "all 0.15s ease",
                      }}
                    >
                      <Wrench size={18} style={{ color: selected ? "#ffffff" : "var(--text-secondary)" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          color: "var(--text)",
                          marginBottom: 2,
                        }}
                      >
                        {opt.label}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: "var(--text-secondary)",
                          lineHeight: 1.4,
                        }}
                      >
                        {opt.desc}
                      </div>
                    </div>
                    {selected && (
                      <div
                        style={{
                          position: "absolute",
                          top: 12,
                          right: 12,
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          background: "var(--text)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Check size={12} style={{ color: "#ffffff" }} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <p
              style={{
                fontSize: 12,
                color: "var(--text-tertiary)",
                marginTop: 16,
                lineHeight: 1.5,
                maxWidth: 520,
              }}
            >
              Non-technical? {form.name || "Your employee"} will prefer browser automation (clicking through websites)
              over APIs and code. Technical? They&apos;ll use the fastest approach — APIs, scripts, and integrations.
            </p>
          </div>

          {renderBottomNav({})}
        </div>
      )}

      {/* ═══ Step: Authority ═══ */}
      {step === "authority" && (
        <div key={animKey} className={animClass}>
          <h1 style={styles.heading}>Who&apos;s in charge?</h1>
          <p style={styles.subtitle}>
            Control who can assign tasks to {form.name || "your employee"} and who can only ask questions
          </p>

          <div style={{ marginTop: 40 }}>
            {/* Default role for unlisted users */}
            <div style={styles.sectionLabel}>Default permission for Slack users</div>
            <p style={styles.sectionHint}>
              When someone messages {form.name || "your employee"} in Slack and isn&apos;t in the list below, what role do they get?
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 32 }}>
              {DEFAULT_AUTHORITY_ROLE_OPTIONS.map((opt) => {
                const selected = form.authority.defaultRole === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() =>
                      setForm({
                        ...form,
                        authority: { ...form.authority, defaultRole: opt.value as "manager" | "colleague" },
                      })
                    }
                    style={{
                      padding: "16px 18px",
                      background: selected ? "#ffffff" : "var(--bg-secondary)",
                      border: selected ? "1.5px solid var(--text)" : "1px solid var(--border)",
                      borderRadius: "var(--radius-xl)",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.15s ease",
                      position: "relative",
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) {
                        (e.currentTarget as HTMLElement).style.borderColor = "var(--border-hover)";
                        (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-sm)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) {
                        (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                        (e.currentTarget as HTMLElement).style.boxShadow = "none";
                      }
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
                      {opt.label}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                      {opt.desc}
                    </div>
                    {selected && (
                      <div
                        style={{
                          position: "absolute",
                          top: 10,
                          right: 10,
                          width: 18,
                          height: 18,
                          borderRadius: "50%",
                          background: "var(--text)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Check size={11} style={{ color: "#ffffff" }} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Specific team members */}
            <div style={styles.sectionLabel}>Team members (optional)</div>
            <p style={styles.sectionHint}>
              Override the default for specific people. Add Slack users and set whether they&apos;re a manager or colleague.
            </p>

            {/* Members list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {form.authority.members.map((member, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-lg)",
                    padding: "8px 12px",
                  }}
                >
                  <Users size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                  <input
                    className="input"
                    placeholder="Name"
                    value={member.name}
                    onChange={(e) => {
                      const updated = [...form.authority.members];
                      updated[i] = { ...updated[i], name: e.target.value };
                      setForm({ ...form, authority: { ...form.authority, members: updated } });
                    }}
                    style={{
                      flex: 1,
                      height: 32,
                      fontSize: 13,
                      borderRadius: "var(--radius-md)",
                      padding: "0 10px",
                      minWidth: 0,
                    }}
                  />
                  <input
                    className="input"
                    placeholder="Slack User ID (U...)"
                    value={member.slackUserId}
                    onChange={(e) => {
                      const updated = [...form.authority.members];
                      updated[i] = { ...updated[i], slackUserId: e.target.value };
                      setForm({ ...form, authority: { ...form.authority, members: updated } });
                    }}
                    style={{
                      width: 160,
                      height: 32,
                      fontSize: 13,
                      borderRadius: "var(--radius-md)",
                      padding: "0 10px",
                    }}
                  />
                  <select
                    value={member.role}
                    onChange={(e) => {
                      const updated = [...form.authority.members];
                      updated[i] = { ...updated[i], role: e.target.value as "manager" | "colleague" };
                      setForm({ ...form, authority: { ...form.authority, members: updated } });
                    }}
                    style={{
                      height: 32,
                      fontSize: 13,
                      borderRadius: "var(--radius-md)",
                      padding: "0 8px",
                      border: "1px solid var(--border)",
                      background: "#ffffff",
                      color: "var(--text)",
                      cursor: "pointer",
                    }}
                  >
                    <option value="manager">Manager</option>
                    <option value="colleague">Colleague</option>
                  </select>
                  <button
                    onClick={() => {
                      const updated = form.authority.members.filter((_, idx) => idx !== i);
                      setForm({ ...form, authority: { ...form.authority, members: updated } });
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 4,
                      color: "var(--text-tertiary)",
                      flexShrink: 0,
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                setForm({
                  ...form,
                  authority: {
                    ...form.authority,
                    members: [...form.authority.members, { slackUserId: "", name: "", role: "manager" }],
                  },
                });
              }}
              style={{
                background: "none",
                border: "1px dashed var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: "10px 16px",
                cursor: "pointer",
                color: "var(--text-secondary)",
                fontSize: 13,
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 6,
                width: "100%",
                justifyContent: "center",
              }}
            >
              <Plus size={14} />
              Add team member
            </button>

            <p
              style={{
                fontSize: 12,
                color: "var(--text-tertiary)",
                marginTop: 16,
                lineHeight: 1.5,
              }}
            >
              You can find a user&apos;s Slack ID by clicking their profile in Slack, then clicking the &quot;...&quot; menu and selecting &quot;Copy member ID&quot;.
              You can also configure this later from the employee settings page.
            </p>
          </div>

          {renderBottomNav({ showSkip: true })}
        </div>
      )}

      {/* ═══ Step 5: Channels ═══ */}
      {step === "channels" && (
        <div key={animKey} className={animClass}>
          <h1 style={styles.heading}>Where should they communicate?</h1>
          <p style={styles.subtitle}>
            Choose the channels {form.name || "your employee"} should use
          </p>

          <div
            style={{
              marginTop: 40,
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gridAutoRows: "1fr",
              gap: 10,
            }}
          >
            {CHANNEL_OPTIONS.map((ch) => {
              const selected = form.channels.includes(ch.id);
              const price = getAddonPrice("channels", ch.id, form.tier);
              return (
                <div key={ch.id} style={{ height: "100%" }}>
                  {renderSelectionCard({
                    selected,
                    onClick: () => toggleChannel(ch.id),
                    icon: <ch.Icon size={20} style={{ color: selected ? "var(--text)" : "var(--text-secondary)" }} />,
                    label: ch.label,
                    desc: ch.desc,
                    priceBadge: price,
                  })}
                </div>
              );
            })}
          </div>

          {renderBottomNav({ showSkip: true })}
        </div>
      )}

      {/* ═══ Step 6: Tools / Capabilities ═══ */}
      {step === "tools" && (
        <div key={animKey} className={animClass}>
          <h1 style={styles.heading}>What can they do?</h1>
          <p style={styles.subtitle}>
            Choose what {form.name || "your employee"} is able to do — all capabilities are enabled by default
          </p>

          <div
            style={{
              marginTop: 40,
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gridAutoRows: "1fr",
              gap: 10,
            }}
          >
            {CAPABILITY_OPTIONS.map((cap) => {
              const selected = form.capabilities.includes(cap.id);
              const Icon = CAPABILITY_ICONS[cap.id] || Sparkles;
              const price = getAddonPrice("capabilities", cap.id, form.tier);
              return (
                <div key={cap.id} style={{ height: "100%" }}>
                  {renderSelectionCard({
                    selected,
                    onClick: () => toggleCapability(cap.id),
                    icon: <Icon size={20} style={{ color: selected ? "var(--text)" : "var(--text-secondary)" }} />,
                    label: cap.label,
                    desc: cap.desc,
                    priceBadge: price,
                  })}
                </div>
              );
            })}
          </div>

          {renderBottomNav({ showSkip: true })}
        </div>
      )}

      {/* ═══ Step 7: Skills / Expertise ═══ */}
      {step === "skills" && (
        <div key={animKey} className={animClass}>
          <h1 style={styles.heading}>What should they be great at?</h1>
          <p style={styles.subtitle}>
            Select focus areas — {form.name || "they"} can do all of these, but will prioritize what you pick
          </p>

          <div
            style={{
              marginTop: 40,
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gridAutoRows: "1fr",
              gap: 10,
            }}
          >
            {EXPERTISE_OPTIONS.map((skill) => {
              const selected = form.skills.includes(skill.id);
              const Icon = EXPERTISE_ICONS[skill.id] || Sparkles;
              const price = getAddonPrice("expertise", skill.id, form.tier);
              return (
                <button
                  key={skill.id}
                  onClick={() => toggleSkill(skill.id)}
                  style={{
                    padding: "16px 14px",
                    background: "#ffffff",
                    border: selected ? "1.5px solid var(--text)" : "1px solid var(--border)",
                    borderRadius: "var(--radius-xl)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s ease",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    position: "relative",
                  }}
                  onMouseEnter={(e) => {
                    if (!selected) {
                      (e.currentTarget as HTMLElement).style.borderColor = "var(--border-hover)";
                      (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-sm)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!selected) {
                      (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                      (e.currentTarget as HTMLElement).style.boxShadow = "none";
                    }
                  }}
                >
                  {selected && (
                    <div
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        background: "var(--text)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Check size={11} style={{ color: "#ffffff" }} />
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Icon
                      size={20}
                      style={{ color: selected ? "var(--text)" : "var(--text-secondary)" }}
                    />
                    {price !== "free" && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "2px 6px",
                          borderRadius: 4,
                          whiteSpace: "nowrap",
                          color: "#d97706",
                          background: "rgba(217, 119, 6, 0.08)",
                        }}
                      >
                        +${price}/mo
                      </span>
                    )}
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--text)",
                        letterSpacing: "-0.01em",
                        marginBottom: 2,
                      }}
                    >
                      {skill.label}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-secondary)",
                        lineHeight: 1.4,
                      }}
                    >
                      {skill.desc}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {renderBottomNav({ showSkip: true, nextLabel: "Review" })}
        </div>
      )}

      {/* ═══ Step 8: Review & Hire ═══ */}
      {step === "review" && (
        <div key={animKey} className={animClass}>
          <h1 style={styles.heading}>Ready to hire {form.name}?</h1>
          <p style={styles.subtitle}>
            Review and customize before bringing {form.name} onboard
          </p>

          {error && (
            <div
              style={{
                background: "var(--red-muted)",
                border: "1px solid rgba(220, 38, 38, 0.15)",
                borderRadius: "var(--radius-lg)",
                padding: "12px 16px",
                marginTop: 24,
                color: "var(--red)",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          {/* Summary card */}
          <div
            style={{
              marginTop: 32,
              background: "#ffffff",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-2xl)",
              padding: 28,
              boxShadow: "var(--shadow-xs)",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 28,
                }}
              >
                {template?.emoji || "🤖"}
              </div>
              <div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                    color: "var(--text)",
                  }}
                >
                  {form.name}
                </div>
                <div style={{ color: "var(--text-secondary)", fontSize: 14 }}>{form.jobTitle}</div>
              </div>
            </div>

            <div className="divider" style={{ marginBottom: 20 }} />

            {/* Tier & Pricing */}
            {(() => {
              const baseCost = EMPLOYEE_TIERS[form.tier].priceMonthly;
              const addonCost = calculateAddonTotal(form.tier, form.channels, form.capabilities, form.skills);
              const totalCost = baseCost + addonCost;

              // Collect paid add-on line items
              const addonLines: { label: string; price: number }[] = [];
              for (const ch of form.channels) {
                const p = getAddonPrice("channels", ch, form.tier);
                if (p !== "free") {
                  const opt = CHANNEL_OPTIONS.find((c) => c.id === ch);
                  addonLines.push({ label: opt?.label || ch, price: p });
                }
              }
              for (const cap of form.capabilities) {
                const p = getAddonPrice("capabilities", cap, form.tier);
                if (p !== "free") {
                  const opt = CAPABILITY_OPTIONS.find((c) => c.id === cap);
                  addonLines.push({ label: opt?.label || cap, price: p });
                }
              }
              for (const sk of form.skills) {
                const p = getAddonPrice("expertise", sk, form.tier);
                if (p !== "free") {
                  const opt = EXPERTISE_OPTIONS.find((s) => s.id === sk);
                  addonLines.push({ label: opt?.label || sk, price: p });
                }
              }

              return (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                    Pricing
                  </div>
                  {/* Base tier */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={pillStyle}>{EMPLOYEE_TIERS[form.tier].label}</span>
                      <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                        {EMPLOYEE_TIERS[form.tier].creditsIncluded} credits included
                      </span>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
                      ${baseCost}/mo
                    </span>
                  </div>
                  {/* Add-on line items */}
                  {addonLines.length > 0 && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                      {addonLines.map((item, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
                          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{item.label}</span>
                          <span style={{ fontSize: 13, color: "#d97706", fontWeight: 500 }}>+${item.price}/mo</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Total */}
                  <div style={{
                    marginTop: 10, paddingTop: 10,
                    borderTop: "1.5px solid var(--text)",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
                      Total
                    </span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>
                      ${totalCost}/mo
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Personality */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                Personality
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {[
                  AUTONOMY_OPTIONS.find((o) => o.value === form.personality.autonomy)?.label,
                  PROACTIVITY_OPTIONS.find((o) => o.value === form.personality.proactivity)?.label,
                  COMMUNICATION_OPTIONS.find((o) => o.value === form.personality.communication)?.label,
                  BOSS_TECHNICAL_LEVEL_OPTIONS.find((o) => o.value === form.personality.bossTechnicalLevel)?.label
                    ? `Boss: ${BOSS_TECHNICAL_LEVEL_OPTIONS.find((o) => o.value === form.personality.bossTechnicalLevel)?.label}`
                    : null,
                ].filter(Boolean).map((label) => (
                  <span key={label} style={pillStyle}>{label}</span>
                ))}
              </div>
            </div>

            {/* Authority */}
            {(form.authority.members.length > 0 || form.authority.defaultRole !== "manager") && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                  Authority
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <span style={pillStyle}>
                    Default: {form.authority.defaultRole === "manager" ? "Everyone is a manager" : "Everyone is a colleague"}
                  </span>
                  {form.authority.members.map((m, i) => (
                    <span key={i} style={pillStyle}>
                      <Users size={12} />
                      {m.name || m.slackUserId}: {m.role}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Channels */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                Channels
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {form.channels.length > 0 ? (
                  form.channels.map((ch) => {
                    const channel = CHANNEL_OPTIONS.find((c) => c.id === ch);
                    const price = getAddonPrice("channels", ch, form.tier);
                    return (
                      <span key={ch} style={pillStyle}>
                        {channel && <channel.Icon size={12} />}
                        {channel?.label || ch}
                        {price !== "free" && <span style={{ color: "#d97706", fontSize: 10, fontWeight: 600 }}>+${price}</span>}
                      </span>
                    );
                  })
                ) : (
                  <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>
                    No channels selected
                  </span>
                )}
              </div>
            </div>

            {/* Capabilities */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                Capabilities
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {form.capabilities.length === ALL_CAPABILITY_IDS.length ? (
                  <span style={pillStyle}>Full access — all capabilities enabled</span>
                ) : form.capabilities.length > 0 ? (
                  form.capabilities.map((capId) => {
                    const cap = CAPABILITY_OPTIONS.find((c) => c.id === capId);
                    const price = getAddonPrice("capabilities", capId, form.tier);
                    return (
                      <span key={capId} style={pillStyle}>
                        {cap?.label || capId}
                        {price !== "free" && <span style={{ color: "#d97706", fontSize: 10, fontWeight: 600 }}>+${price}</span>}
                      </span>
                    );
                  })
                ) : (
                  <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>
                    No capabilities selected
                  </span>
                )}
              </div>
            </div>

            {/* Focus Areas */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                Focus Areas
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {form.skills.length > 0 ? (
                  form.skills.map((sk) => {
                    const skill = EXPERTISE_OPTIONS.find((s) => s.id === sk);
                    const Icon = EXPERTISE_ICONS[sk];
                    const price = getAddonPrice("expertise", sk, form.tier);
                    return (
                      <span key={sk} style={pillStyle}>
                        {Icon && <Icon size={12} />}
                        {skill?.label || sk}
                        {price !== "free" && <span style={{ color: "#d97706", fontSize: 10, fontWeight: 600 }}>+${price}</span>}
                      </span>
                    );
                  })
                ) : (
                  <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>
                    No focus areas selected
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Fine-tune instructions (expandable) */}
          <div style={{ marginTop: 16 }}>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-secondary)",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
                padding: "8px 0",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <ChevronDown
                size={16}
                style={{
                  transform: showAdvanced ? "rotate(180deg)" : "none",
                  transition: "transform 0.2s",
                }}
              />
              Fine-tune instructions
            </button>

            {showAdvanced && (
              <div
                className="animate-in"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                  marginTop: 8,
                }}
              >
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", display: "block", marginBottom: 6 }}>
                    Persona & Instructions
                  </label>
                  <textarea
                    className="input"
                    style={{
                      minHeight: 140,
                      borderRadius: "var(--radius-lg)",
                      fontSize: 13,
                      lineHeight: 1.6,
                    }}
                    placeholder="Describe how this employee should behave, their expertise, communication style..."
                    value={form.persona}
                    onChange={(e) => setForm({ ...form, persona: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", display: "block", marginBottom: 6 }}>
                    Goals & Objectives
                  </label>
                  <textarea
                    className="input"
                    style={{
                      minHeight: 70,
                      borderRadius: "var(--radius-lg)",
                      fontSize: 13,
                      lineHeight: 1.6,
                    }}
                    placeholder="What should this employee focus on achieving?"
                    value={form.goals}
                    onChange={(e) => setForm({ ...form, goals: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>

          {/* What happens next */}
          <div
            style={{
              marginTop: 20,
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-2xl)",
              padding: 24,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 14, color: "var(--text)" }}>
              What happens next
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                "Spin up a dedicated, isolated workstation",
                "Install role persona, goals, and skills",
                "Connect channels (Slack, email, messaging, etc.)",
                `${form.name} starts working immediately — 24/7`,
              ].map((text, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    fontSize: 13,
                    color: "var(--text-secondary)",
                  }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: "#ffffff",
                      border: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--text-tertiary)",
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </div>
                  {text}
                </div>
              ))}
            </div>
          </div>

          {renderBottomNav({
            nextLabel: `Hire ${form.name}`,
            onNext: handleHire,
            isLoading: loading,
          })}
        </div>
      )}
    </div>
  );
}
