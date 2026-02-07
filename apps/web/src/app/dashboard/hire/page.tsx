"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { JOB_TEMPLATES, getJobTemplateCategories, getJobTemplate } from "@ai-employees/shared";

type Step = "role" | "profile" | "channels" | "review";

const CHANNEL_OPTIONS = [
  { id: "slack", label: "Slack", icon: "💬", desc: "Connect to your Slack workspace" },
  { id: "email", label: "Email", icon: "📧", desc: "Get a dedicated email address" },
  { id: "browser", label: "Browser", icon: "🌐", desc: "Web browsing and research" },
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
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* Progress bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 40 }}>
        {(["role", "profile", "channels", "review"] as Step[]).map((s, i) => (
          <div
            key={s}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background:
                i <= ["role", "profile", "channels", "review"].indexOf(step)
                  ? "var(--accent)"
                  : "var(--border)",
              transition: "background 0.3s",
            }}
          />
        ))}
      </div>

      {/* Step 1: Choose Role */}
      {step === "role" && (
        <div className="animate-in">
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
            Who do you want to hire?
          </h1>
          <p style={{ color: "var(--text-secondary)", marginBottom: 32 }}>
            Choose a pre-built role or create your own custom position
          </p>

          {categories.map((cat) => (
            <div key={cat} style={{ marginBottom: 24 }}>
              <h3
                style={{
                  fontSize: 13,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  color: "var(--text-muted)",
                  marginBottom: 12,
                }}
              >
                {cat}
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                  gap: 12,
                }}
              >
                {JOB_TEMPLATES.filter((t) => t.category === cat).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleSelectTemplate(t.id)}
                    className="card"
                    style={{
                      padding: 20,
                      textAlign: "left",
                      cursor: "pointer",
                      border:
                        selectedTemplate === t.id
                          ? "1px solid var(--accent)"
                          : "1px solid var(--border)",
                    }}
                  >
                    <div style={{ fontSize: 28, marginBottom: 8 }}>{t.emoji}</div>
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
                      {t.title}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                      {t.description.slice(0, 80)}...
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Custom role option */}
          <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
            <button
              onClick={handleCustom}
              className="card"
              style={{
                padding: 20,
                width: "100%",
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 16,
                border: isCustom ? "1px solid var(--accent)" : "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 10,
                  background: "var(--bg-tertiary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 24,
                }}
              >
                ✨
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>Build Your Own</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  Create a custom role with your own persona and goals
                </div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Employee Profile */}
      {step === "profile" && (
        <div className="animate-in">
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
            {template ? `Set up your ${template.title}` : "Create Custom Employee"}
          </h1>
          <p style={{ color: "var(--text-secondary)", marginBottom: 32 }}>
            Give your employee a name and customize their personality
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <label style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>
                Employee Name
              </label>
              <input
                className="input"
                placeholder="e.g., Sarah, Alex, Jordan"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div>
              <label style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>
                Job Title
              </label>
              <input
                className="input"
                placeholder="e.g., Marketing Manager"
                value={form.jobTitle}
                onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
              />
            </div>

            <div>
              <label style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>
                Persona &amp; Instructions
              </label>
              <textarea
                className="input"
                style={{ minHeight: 160, resize: "vertical", fontFamily: "inherit" }}
                placeholder="Describe how this employee should behave, their expertise, communication style..."
                value={form.persona}
                onChange={(e) => setForm({ ...form, persona: e.target.value })}
              />
            </div>

            <div>
              <label style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>
                Goals &amp; OKRs
              </label>
              <textarea
                className="input"
                style={{ minHeight: 80, resize: "vertical", fontFamily: "inherit" }}
                placeholder="What should this employee focus on achieving?"
                value={form.goals}
                onChange={(e) => setForm({ ...form, goals: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32 }}>
            <button className="btn-secondary" onClick={() => setStep("role")}>
              Back
            </button>
            <button
              className="btn-primary"
              disabled={!form.name || !form.jobTitle}
              onClick={() => setStep("channels")}
              style={{ opacity: !form.name || !form.jobTitle ? 0.5 : 1 }}
            >
              Next: Set Up Workspace
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Channels / Workspace */}
      {step === "channels" && (
        <div className="animate-in">
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
            Set up {form.name}&apos;s workspace
          </h1>
          <p style={{ color: "var(--text-secondary)", marginBottom: 32 }}>
            Choose what tools and channels {form.name} will have access to — like
            giving a new hire their laptop and accounts
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            {CHANNEL_OPTIONS.map((ch) => {
              const selected = form.channels.includes(ch.id);
              return (
                <button
                  key={ch.id}
                  onClick={() => toggleChannel(ch.id)}
                  className="card"
                  style={{
                    padding: 20,
                    textAlign: "left",
                    cursor: "pointer",
                    border: selected
                      ? "1px solid var(--accent)"
                      : "1px solid var(--border)",
                    background: selected
                      ? "rgba(99, 102, 241, 0.05)"
                      : "var(--bg-card)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ fontSize: 28 }}>{ch.icon}</span>
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 4,
                        border: selected
                          ? "none"
                          : "2px solid var(--border)",
                        background: selected ? "var(--accent)" : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "white",
                        fontSize: 12,
                      }}
                    >
                      {selected && "✓"}
                    </div>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
                    {ch.label}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    {ch.desc}
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32 }}>
            <button className="btn-secondary" onClick={() => setStep("profile")}>
              Back
            </button>
            <button className="btn-primary" onClick={() => setStep("review")}>
              Review &amp; Hire
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Review & Hire */}
      {step === "review" && (
        <div className="animate-in">
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
            Ready to hire {form.name}?
          </h1>
          <p style={{ color: "var(--text-secondary)", marginBottom: 32 }}>
            Review the details and bring your new employee onboard
          </p>

          {error && (
            <div
              style={{
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: 8,
                padding: "10px 14px",
                marginBottom: 20,
                color: "var(--error)",
                fontSize: 14,
              }}
            >
              {error}
            </div>
          )}

          <div className="card" style={{ padding: 24, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 12,
                  background: "var(--bg-tertiary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 28,
                }}
              >
                {template?.emoji || "🤖"}
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{form.name}</div>
                <div style={{ color: "var(--text-secondary)" }}>{form.jobTitle}</div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                paddingTop: 16,
                borderTop: "1px solid var(--border)",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 12,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    color: "var(--text-muted)",
                    marginBottom: 8,
                  }}
                >
                  Workspace
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {form.channels.length > 0 ? (
                    form.channels.map((ch) => {
                      const channel = CHANNEL_OPTIONS.find((c) => c.id === ch);
                      return (
                        <span
                          key={ch}
                          style={{
                            background: "var(--bg-tertiary)",
                            padding: "4px 10px",
                            borderRadius: 6,
                            fontSize: 13,
                          }}
                        >
                          {channel?.icon} {channel?.label}
                        </span>
                      );
                    })
                  ) : (
                    <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                      No channels selected
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 12,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    color: "var(--text-muted)",
                    marginBottom: 8,
                  }}
                >
                  Role Template
                </div>
                <div style={{ fontSize: 14 }}>
                  {template ? `${template.emoji} ${template.title}` : "✨ Custom Role"}
                </div>
              </div>
            </div>
          </div>

          {/* What happens next */}
          <div
            className="card"
            style={{ padding: 24, marginBottom: 32, background: "rgba(99, 102, 241, 0.04)" }}
          >
            <div style={{ fontWeight: 600, marginBottom: 12 }}>
              What happens when you hire {form.name}:
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--accent)" }}>1.</span>
                We spin up a dedicated, isolated AI workstation
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--accent)" }}>2.</span>
                Install their role persona, goals, and skills
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--accent)" }}>3.</span>
                Connect their channels (Slack, email, browser, etc.)
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--accent)" }}>4.</span>
                {form.name} starts working immediately — 24/7
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button className="btn-secondary" onClick={() => setStep("channels")}>
              Back
            </button>
            <button
              className="btn-primary"
              onClick={handleHire}
              disabled={loading}
              style={{
                opacity: loading ? 0.7 : 1,
                fontSize: 16,
                padding: "12px 32px",
              }}
            >
              {loading ? "Setting up workstation..." : `Hire ${form.name}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
