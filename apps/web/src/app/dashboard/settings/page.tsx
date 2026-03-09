"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Building2, User, Link2, Unlink, CheckCircle2, ExternalLink, Download, Chrome } from "lucide-react";

const cssVars = `
  :root {
    --text: #0a0a0a;
    --text-secondary: #525252;
    --text-tertiary: #a3a3a3;
    --border: #e5e5e5;
    --bg: #ffffff;
    --bg-secondary: #f5f5f5;
    --green: #16a34a;
    --red: #dc2626;
    --radius-sm: 6px;
    --radius-md: 8px;
    --radius-lg: 10px;
    --shadow-xs: 0 1px 2px rgba(0,0,0,0.04);
    --shadow-sm: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
  }
  @keyframes spin { to { transform: rotate(360deg) } }
  @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }
  @keyframes settingsFadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <div style={{
          width: 24,
          height: 24,
          border: "2px solid var(--border)",
          borderTopColor: "var(--text-tertiary)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
        <style>{cssVars}</style>
      </div>
    }>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const [company, setCompany] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [integrations, setIntegrations] = useState<Record<string, any>>({});
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [slackNotice, setSlackNotice] = useState<{ type: "success" | "error" | "denied"; message: string } | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    api.me().then((data) => {
      setCompany(data.company);
      setUser(data.user);
    });
    loadIntegrations();

    // Handle Slack OAuth redirect params
    const slackParam = searchParams.get("slack");
    if (slackParam === "connected") {
      const team = searchParams.get("team") || "your workspace";
      setSlackNotice({ type: "success", message: `Slack connected to ${team}!` });
    } else if (slackParam === "denied") {
      setSlackNotice({ type: "denied", message: "Slack authorization was denied." });
    } else if (slackParam === "error") {
      const reason = searchParams.get("reason") || "unknown error";
      setSlackNotice({ type: "error", message: `Slack connection failed: ${reason}` });
    }
  }, [searchParams]);

  const loadIntegrations = useCallback(async () => {
    try {
      const data = await api.getIntegrations();
      setIntegrations(data.integrations || {});
    } catch {
      // Integrations endpoint might not exist yet
    }
  }, []);

  const handleConnectSlack = () => {
    // Navigate to Slack install endpoint — browser sends cookie automatically
    window.location.href = api.getSlackInstallUrl();
  };

  const handleDisconnectSlack = async () => {
    if (!confirm("Disconnect Slack? Employees will no longer be able to message in your workspace.")) return;
    setIntegrationsLoading(true);
    try {
      await api.disconnectIntegration("slack");
      setIntegrations((prev) => {
        const { slack, ...rest } = prev;
        return rest;
      });
      setSlackNotice({ type: "success", message: "Slack disconnected." });
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIntegrationsLoading(false);
    }
  };

  if (!company || !user) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <div
          style={{
            width: 24,
            height: 24,
            border: "2px solid var(--border)",
            borderTopColor: "var(--text-tertiary)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{cssVars}</style>
      </div>
    );
  }

  /* ---- shared style objects ---- */

  const sectionCard: React.CSSProperties = {
    padding: 24,
    marginBottom: 16,
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    boxShadow: "var(--shadow-sm)",
  };

  const sectionHeader: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
    paddingBottom: 16,
    borderBottom: "1px solid var(--border)",
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text)",
    letterSpacing: "-0.01em",
  };

  const kvRow: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  };

  const kvLabel: React.CSSProperties = {
    fontSize: 13,
    color: "var(--text-secondary)",
    fontWeight: 400,
  };

  const kvValue: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text)",
  };

  const btnBase: React.CSSProperties = {
    height: 32,
    padding: "0 12px",
    fontSize: 12,
    fontWeight: 500,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    transition: "all 0.15s ease",
    lineHeight: 1,
  };

  const btnPrimary: React.CSSProperties = {
    ...btnBase,
    background: "var(--text)",
    color: "var(--bg)",
    border: "1px solid var(--text)",
  };

  const btnDanger: React.CSSProperties = {
    ...btnBase,
    background: "var(--bg)",
    color: "var(--red)",
    border: "1px solid rgba(220,38,38,0.25)",
  };

  const integrationCard: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--border)",
    background: "var(--bg-secondary)",
  };

  return (
    <div style={{ maxWidth: 600, animation: "settingsFadeIn 0.3s ease-out" }}>
      <style>{cssVars}</style>

      <h1 style={{
        fontSize: 22,
        fontWeight: 700,
        color: "var(--text)",
        marginBottom: 28,
        letterSpacing: "-0.02em",
      }}>
        Settings
      </h1>

      {/* Company Card */}
      <div style={sectionCard}>
        <div style={sectionHeader}>
          <Building2 size={16} style={{ color: "var(--text-tertiary)" }} />
          <h3 style={sectionTitle}>Company</h3>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { label: "Name", value: company.name },
            { label: "Slug", value: company.slug },
          ].map((item) => (
            <div key={item.label} style={kvRow}>
              <span style={kvLabel}>{item.label}</span>
              <span style={kvValue}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Integrations Card */}
      <div style={sectionCard}>
        <div style={sectionHeader}>
          <Link2 size={16} style={{ color: "var(--text-tertiary)" }} />
          <h3 style={sectionTitle}>Integrations</h3>
        </div>

        {/* Slack OAuth notice */}
        {slackNotice && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              marginBottom: 16,
              fontSize: 13,
              fontWeight: 500,
              background:
                slackNotice.type === "success"
                  ? "rgba(22,163,74,0.06)"
                  : slackNotice.type === "denied"
                    ? "rgba(217,119,6,0.06)"
                    : "rgba(220,38,38,0.06)",
              border: `1px solid ${
                slackNotice.type === "success"
                  ? "rgba(22,163,74,0.15)"
                  : slackNotice.type === "denied"
                    ? "rgba(217,119,6,0.15)"
                    : "rgba(220,38,38,0.15)"
              }`,
              color:
                slackNotice.type === "success"
                  ? "#16a34a"
                  : slackNotice.type === "denied"
                    ? "#d97706"
                    : "#dc2626",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {slackNotice.type === "success" && <CheckCircle2 size={14} />}
            {slackNotice.message}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Slack */}
          <div style={integrationCard}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>💬</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Slack</div>
                {integrations.slack ? (
                  <div style={{ fontSize: 12, color: "#16a34a", display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                    <CheckCircle2 size={11} />
                    Connected to {integrations.slack.teamName}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                    Let employees chat in your Slack workspace
                  </div>
                )}
              </div>
            </div>
            {integrations.slack ? (
              <button
                onClick={handleDisconnectSlack}
                disabled={integrationsLoading}
                style={{
                  ...btnDanger,
                  ...(integrationsLoading ? { opacity: 0.5, cursor: "not-allowed" } : {}),
                }}
              >
                <Unlink size={12} /> Disconnect
              </button>
            ) : (
              <button
                onClick={handleConnectSlack}
                style={btnPrimary}
              >
                <ExternalLink size={12} /> Connect
              </button>
            )}
          </div>

          {/* Email — per-employee config */}
          <div style={integrationCard}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>📧</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Email</div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                  Configure per employee — add IMAP/SMTP credentials on each employee&apos;s page
                </div>
              </div>
            </div>
            <CheckCircle2 size={16} style={{ color: "#16a34a", flexShrink: 0 }} />
          </div>

          {/* Discord — coming soon */}
          <div style={{ ...integrationCard, opacity: 0.55 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>🎮</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Discord</div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                  Add employees to your Discord server
                </div>
              </div>
            </div>
            <span style={{
              fontSize: 11,
              color: "var(--text-tertiary)",
              fontWeight: 500,
              background: "var(--bg)",
              padding: "3px 8px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
            }}>
              Coming soon
            </span>
          </div>

          {/* Chrome Extension */}
          <div style={integrationCard}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Chrome size={22} style={{ color: "var(--text-tertiary)" }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Chrome Extension</div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                  Let employees browse using your real Chrome session
                </div>
              </div>
            </div>
            <a
              href="/api/extension/download"
              style={{
                ...btnPrimary,
                textDecoration: "none",
              }}
            >
              <Download size={12} /> Download
            </a>
          </div>
        </div>
      </div>

      {/* Account Card */}
      <div style={{ ...sectionCard, marginBottom: 0 }}>
        <div style={sectionHeader}>
          <User size={16} style={{ color: "var(--text-tertiary)" }} />
          <h3 style={sectionTitle}>Account</h3>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { label: "Name", value: user.name },
            { label: "Email", value: user.email },
            { label: "Role", value: user.role, capitalize: true },
          ].map((item) => (
            <div key={item.label} style={kvRow}>
              <span style={kvLabel}>{item.label}</span>
              <span style={{
                ...kvValue,
                textTransform: item.capitalize ? "capitalize" : undefined,
              }}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
