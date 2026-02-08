"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { JOB_TEMPLATES, getJobTemplateCategories, getJobTemplate } from "@ai-employees/shared";
import { Check, ArrowRight, ArrowLeft, Sparkles, Loader2 } from "lucide-react";

type Step = "role" | "profile" | "channels" | "review";

const STEPS: { key: Step; label: string }[] = [
  { key: "role", label: "Role" },
  { key: "profile", label: "Profile" },
  { key: "channels", label: "Workspace" },
  { key: "review", label: "Review" },
];

const CHANNEL_OPTIONS = [
  { id: "slack", label: "Slack", icon: "💬", desc: "Connect to your workspace" },
  { id: "email", label: "Email", icon: "📧", desc: "Dedicated email address" },
  { id: "browser", label: "Browser", icon: "🌐", desc: "Web browsing & research" },
  { id: "telegram", label: "Telegram", icon: "✈️", desc: "Telegram messaging" },
  { id: "whatsapp", label: "WhatsApp", icon: "📱", desc: "WhatsApp Business" },
  { id: "discord", label: "Discord", icon: "🎮", desc: "Discord server access" },
];

export default function HireEmployeePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("role");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [isCustom, setIsCustom] = useState(false);
  const [form, setForm] = useState({
    name: "",
    jobTitle: "",
    persona: "",
    goals: "",
    channels: [] as string[],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const categories = getJobTemplateCategories();
  const template = selectedTemplate ? getJobTemplate(selectedTemplate) : null;
  const stepIndex = STEPS.findIndex((s) => s.key === step);

  const handleSelectTemplate = (id: string) => {
    const t = getJobTemplate(id)!;
    setSelectedTemplate(id);
    setIsCustom(false);
    setForm({
      ...form,
      name: "",
      jobTitle: t.title,
      persona: t.persona,
      goals: t.goals,
      channels: t.suggestedChannels,
    });
    setStep("profile");
  };

  const handleCustom = () => {
    setSelectedTemplate(null);
    setIsCustom(true);
    setForm({ name: "", jobTitle: "", persona: "", goals: "", channels: [] });
    setStep("profile");
  };

  const handleHire = async () => {
    setError("");
    setLoading(true);

    try {
      const result = await api.hireEmployee({
        name: form.name,
        jobTitle: form.jobTitle,
        templateId: selectedTemplate || undefined,
        persona: form.persona || undefined,
        goals: form.goals || undefined,
        channels: form.channels,
      });
      router.push(`/dashboard/employees/${result.employee.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to hire employee");
      setLoading(false);
    }
  };

  const toggleChannel = (id: string) => {
    setForm({
      ...form,
      channels: form.channels.includes(id)
        ? form.channels.filter((c) => c !== id)
        : [...form.channels, id],
    });
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      {/* Step indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 48 }}>
        {STEPS.map((s, i) => {
          const isCompleted = i < stepIndex;
          const isCurrent = s.key === step;
          return (
            <div key={s.key} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 600,
                    background: isCurrent
                      ? "var(--text)"
                      : isCompleted
                        ? "var(--green)"
                        : "rgba(255,255,255,0.06)",
                    color: isCurrent || isCompleted ? "var(--bg)" : "var(--text-tertiary)",
                    border: isCurrent ? "none" : isCompleted ? "none" : "1px solid var(--border)",
                    transition: "all 0.3s",
                  }}
                >
                  {isCompleted ? <Check size={14} /> : i + 1}
                </div>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: isCurrent ? 500 : 400,
                    color: isCurrent ? "var(--text)" : "var(--text-tertiary)",
                    transition: "color 0.3s",
                  }}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: 1,
                    background: isCompleted ? "var(--green)" : "var(--border)",
                    margin: "0 16px",
                    transition: "background 0.3s",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step 1: Choose Role */}
      {step === "role" && (
        <div className="animate-in">
          <h1 className="heading-1" style={{ marginBottom: 8 }}>
            Who do you want to hire?
          </h1>
          <p style={{ color: "var(--text-secondary)", marginBottom: 40, fontSize: 15 }}>
            Choose a pre-built role or create your own custom position
          </p>

          {categories.map((cat) => (
            <div key={cat} style={{ marginBottom: 28 }}>
              <p className="label" style={{ marginBottom: 12 }}>{cat}</p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                  gap: 10,
                }}
              >
                {JOB_TEMPLATES.filter((t) => t.category === cat).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleSelectTemplate(t.id)}
                    className={`card card-interactive ${selectedTemplate === t.id ? "card-selected" : ""}`}
                    style={{
                      padding: 20,
                      textAlign: "left",
                      cursor: "pointer",
                      background: selectedTemplate === t.id ? "rgba(255,255,255,0.04)" : undefined,
                    }}
                  >
                    <div style={{ fontSize: 28, marginBottom: 10 }}>{t.emoji}</div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, letterSpacing: "-0.01em" }}>
                      {t.title}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      {t.description.slice(0, 70)}...
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Custom role */}
          <div className="divider" style={{ margin: "28px 0" }} />
          <button
            onClick={handleCustom}
            className={`card card-interactive ${isCustom ? "card-selected" : ""}`}
            style={{
              padding: 20,
              width: "100%",
              textAlign: "left",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: "linear-gradient(135deg, rgba(93, 121, 223, 0.15), rgba(169, 75, 210, 0.15))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Sparkles size={20} style={{ color: "var(--blue)" }} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Build Your Own</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                Create a custom role with your own persona and goals
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Step 2: Employee Profile */}
      {step === "profile" && (
        <div className="animate-in">
          <h1 className="heading-1" style={{ marginBottom: 8 }}>
            {template ? `Set up your ${template.title}` : "Create Custom Employee"}
          </h1>
          <p style={{ color: "var(--text-secondary)", marginBottom: 40, fontSize: 15 }}>
            Give your employee a name and customize their personality
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div>
              <label className="input-label">Employee Name</label>
              <input
                className="input"
                placeholder="e.g., Sarah, Alex, Jordan"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div>
              <label className="input-label">Job Title</label>
              <input
                className="input"
                placeholder="e.g., Marketing Manager"
                value={form.jobTitle}
                onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
              />
            </div>

            <div>
              <label className="input-label">Persona &amp; Instructions</label>
              <textarea
                className="input"
                style={{ minHeight: 140 }}
                placeholder="Describe how this employee should behave, their expertise, communication style..."
                value={form.persona}
                onChange={(e) => setForm({ ...form, persona: e.target.value })}
              />
            </div>

            <div>
              <label className="input-label">Goals &amp; OKRs</label>
              <textarea
                className="input"
                style={{ minHeight: 80 }}
                placeholder="What should this employee focus on achieving?"
                value={form.goals}
                onChange={(e) => setForm({ ...form, goals: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 40 }}>
            <button className="btn-secondary" onClick={() => setStep("role")} style={{ gap: 6 }}>
              <ArrowLeft size={14} /> Back
            </button>
            <button
              className="btn-primary"
              disabled={!form.name || !form.jobTitle}
              onClick={() => setStep("channels")}
              style={{ gap: 6 }}
            >
              Next: Workspace <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Channels */}
      {step === "channels" && (
        <div className="animate-in">
          <h1 className="heading-1" style={{ marginBottom: 8 }}>
            Set up {form.name}&apos;s workspace
          </h1>
          <p style={{ color: "var(--text-secondary)", marginBottom: 40, fontSize: 15 }}>
            Choose what tools and channels {form.name} will have access to
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 10,
            }}
          >
            {CHANNEL_OPTIONS.map((ch) => {
              const selected = form.channels.includes(ch.id);
              return (
                <button
                  key={ch.id}
                  onClick={() => toggleChannel(ch.id)}
                  className={`card card-interactive ${selected ? "card-selected" : ""}`}
                  style={{
                    padding: 20,
                    textAlign: "left",
                    cursor: "pointer",
                    background: selected ? "rgba(255,255,255,0.04)" : undefined,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <span style={{ fontSize: 28 }}>{ch.icon}</span>
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 6,
                        border: selected ? "none" : "1.5px solid var(--border-hover)",
                        background: selected ? "var(--text)" : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.2s",
                      }}
                    >
                      {selected && <Check size={12} style={{ color: "var(--bg)" }} />}
                    </div>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                    {ch.label}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {ch.desc}
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 40 }}>
            <button className="btn-secondary" onClick={() => setStep("profile")} style={{ gap: 6 }}>
              <ArrowLeft size={14} /> Back
            </button>
            <button className="btn-primary" onClick={() => setStep("review")} style={{ gap: 6 }}>
              Review &amp; Hire <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Review */}
      {step === "review" && (
        <div className="animate-in">
          <h1 className="heading-1" style={{ marginBottom: 8 }}>
            Ready to hire {form.name}?
          </h1>
          <p style={{ color: "var(--text-secondary)", marginBottom: 40, fontSize: 15 }}>
            Review the details and bring your new employee onboard
          </p>

          {error && (
            <div
              style={{
                background: "var(--red-muted)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
                borderRadius: "var(--radius-sm)",
                padding: "10px 14px",
                marginBottom: 20,
                color: "var(--red)",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          {/* Employee summary card */}
          <div className="card glow-subtle" style={{ padding: 28, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  background: "linear-gradient(135deg, rgba(93, 121, 223, 0.15), rgba(169, 75, 210, 0.15))",
                  border: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 28,
                }}
              >
                {template?.emoji || "A"}
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>
                  {form.name}
                </div>
                <div style={{ color: "var(--text-secondary)", fontSize: 14 }}>
                  {form.jobTitle}
                </div>
              </div>
            </div>

            <div className="divider" style={{ margin: "0 0 20px" }} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div>
                <p className="label" style={{ marginBottom: 10 }}>Workspace</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {form.channels.length > 0 ? (
                    form.channels.map((ch) => {
                      const channel = CHANNEL_OPTIONS.find((c) => c.id === ch);
                      return (
                        <span
                          key={ch}
                          style={{
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid var(--border)",
                            padding: "4px 10px",
                            borderRadius: 6,
                            fontSize: 12,
                          }}
                        >
                          {channel?.icon} {channel?.label}
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
              <div>
                <p className="label" style={{ marginBottom: 10 }}>Template</p>
                <div style={{ fontSize: 14 }}>
                  {template ? `${template.emoji} ${template.title}` : "Custom Role"}
                </div>
              </div>
            </div>
          </div>

          {/* What happens next */}
          <div
            className="card"
            style={{ padding: 24, marginBottom: 40, background: "rgba(255,255,255,0.02)" }}
          >
            <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 14 }}>
              What happens next:
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                "Spin up a dedicated, isolated workstation",
                "Install role persona, goals, and skills",
                "Connect channels (Slack, email, browser, etc.)",
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
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.06)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
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

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button className="btn-secondary" onClick={() => setStep("channels")} style={{ gap: 6 }}>
              <ArrowLeft size={14} /> Back
            </button>
            <button
              className="btn-primary"
              onClick={handleHire}
              disabled={loading}
              style={{ gap: 8 }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                  Setting up...
                  <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                </>
              ) : (
                <>
                  Hire {form.name}
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
