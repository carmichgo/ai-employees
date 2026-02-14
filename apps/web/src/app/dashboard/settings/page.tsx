"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Building2, User, Server, RefreshCw, Trash2, Link2, Unlink, CheckCircle2, ExternalLink } from "lucide-react";

const DROPLET_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  none: { label: "Not provisioned", color: "var(--text-tertiary)" },
  provisioning: { label: "Provisioning...", color: "#d97706" },
  booting: { label: "Booting...", color: "#d97706" },
  active: { label: "Active", color: "#16a34a" },
  error: { label: "Error", color: "#dc2626" },
  destroyed: { label: "Destroyed", color: "var(--text-tertiary)" },
};

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
  const [droplet, setDroplet] = useState<any>(null);
  const [dropletLoading, setDropletLoading] = useState(false);
  const [buildLogs, setBuildLogs] = useState<string | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [integrations, setIntegrations] = useState<Record<string, any>>({});
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [slackNotice, setSlackNotice] = useState<{ type: "success" | "error" | "denied"; message: string } | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    api.me().then((data) => {
      setCompany(data.company);
      setUser(data.user);
    });
    loadDroplet();
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

  const loadDroplet = useCallback(async () => {
    try {
      const data = await api.getDropletStatus();
      setDroplet(data.droplet);

      // Auto-poll while provisioning or while Phase 2 is still building
      if (
        data.droplet.status === "provisioning" ||
        data.droplet.status === "booting" ||
        (data.droplet.status === "active" && data.droplet.phase === "provisioning")
      ) {
        setTimeout(loadDroplet, 10000);
      }
    } catch {
      setDroplet({ status: "none" });
    }
  }, []);

  const handleProvision = async () => {
    setDropletLoading(true);
    try {
      await api.provisionDroplet();
      loadDroplet();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDropletLoading(false);
    }
  };

  const handleDestroy = async () => {
    if (!confirm("Are you sure? This will destroy all running AI employees on this infrastructure.")) return;
    setDropletLoading(true);
    try {
      await api.destroyDroplet();
      setDroplet({ status: "destroyed" });
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDropletLoading(false);
    }
  };

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

  const dropletStatusInfo = DROPLET_STATUS_LABELS[droplet?.status || "none"] || DROPLET_STATUS_LABELS.none;

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

  const btnSecondary: React.CSSProperties = {
    ...btnBase,
    background: "var(--bg)",
    color: "var(--text)",
    border: "1px solid var(--border)",
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

  const statusDot = (color: string, pulsing = false): React.CSSProperties => ({
    display: "inline-block",
    width: 8,
    height: 8,
    borderRadius: "50%",
    backgroundColor: color,
    ...(pulsing ? { animation: "pulse 1.5s ease-in-out infinite" } : {}),
  });

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
            { label: "Plan", value: company.plan, capitalize: true },
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

      {/* Infrastructure Card */}
      <div style={sectionCard}>
        <div style={sectionHeader}>
          <Server size={16} style={{ color: "var(--text-tertiary)" }} />
          <h3 style={sectionTitle}>Infrastructure</h3>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={kvRow}>
            <span style={kvLabel}>Status</span>
            <span style={{
              fontSize: 12,
              fontWeight: 600,
              color: dropletStatusInfo.color,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}>
              {(droplet?.status === "provisioning" || droplet?.status === "booting") && (
                <span style={statusDot("#d97706", true)} />
              )}
              {droplet?.status === "active" && (
                <span style={statusDot("#16a34a")} />
              )}
              {dropletStatusInfo.label}
            </span>
          </div>

          {droplet?.status === "active" && droplet?.phase && (
            <div style={kvRow}>
              <span style={kvLabel}>Services</span>
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                color: droplet.phase === "ready" ? "#16a34a" : droplet.phase === "failed" ? "#dc2626" : "#d97706",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}>
                {droplet.phase === "provisioning" && (
                  <span style={statusDot("#d97706", true)} />
                )}
                {droplet.phase === "ready" && (
                  <span style={statusDot("#16a34a")} />
                )}
                {droplet.phase === "provisioning" ? "Building..." : droplet.phase === "ready" ? "Ready" : droplet.phase === "failed" ? "Build Failed" : droplet.phase}
              </span>
            </div>
          )}

          {droplet?.ip && (
            <div style={kvRow}>
              <span style={kvLabel}>IP Address</span>
              <span style={{
                ...kvValue,
                fontFamily: "'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', monospace",
                fontSize: 12,
                color: "var(--text-secondary)",
                background: "var(--bg-secondary)",
                padding: "2px 8px",
                borderRadius: "var(--radius-sm)",
              }}>
                {droplet.ip}
              </span>
            </div>
          )}

          {droplet?.region && droplet?.status !== "none" && (
            <div style={kvRow}>
              <span style={kvLabel}>Region</span>
              <span style={kvValue}>{droplet.region}</span>
            </div>
          )}

          {droplet?.size && droplet?.status !== "none" && (
            <div style={kvRow}>
              <span style={kvLabel}>Size</span>
              <span style={kvValue}>{droplet.size}</span>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            {(!droplet || droplet.status === "none" || droplet.status === "destroyed") && (
              <button
                onClick={handleProvision}
                disabled={dropletLoading}
                style={{
                  ...btnPrimary,
                  ...(dropletLoading ? { opacity: 0.5, cursor: "not-allowed" } : {}),
                }}
              >
                Provision Infrastructure
              </button>
            )}
            {(droplet?.status === "provisioning" || droplet?.status === "booting") && (
              <button
                onClick={loadDroplet}
                style={btnSecondary}
              >
                <RefreshCw size={12} /> Refresh
              </button>
            )}
            {(droplet?.status === "active" || droplet?.status === "booting" || droplet?.status === "provisioning" || droplet?.status === "error") && (
              <button
                onClick={handleDestroy}
                disabled={dropletLoading}
                style={{
                  ...btnDanger,
                  ...(dropletLoading ? { opacity: 0.5, cursor: "not-allowed" } : {}),
                }}
              >
                <Trash2 size={12} /> Destroy
              </button>
            )}
            {droplet?.status === "active" && (
              <button
                onClick={async () => {
                  setLogsLoading(true);
                  try {
                    const data = await api.getDropletLogs();
                    setBuildLogs(data.logs);
                  } catch {
                    setBuildLogs("Failed to fetch logs");
                  } finally {
                    setLogsLoading(false);
                  }
                }}
                disabled={logsLoading}
                style={{
                  ...btnSecondary,
                  ...(logsLoading ? { opacity: 0.5, cursor: "not-allowed" } : {}),
                }}
              >
                {logsLoading ? "Loading..." : "View Build Logs"}
              </button>
            )}
          </div>

          {buildLogs && (
            <div style={{
              marginTop: 8,
              padding: 14,
              backgroundColor: "var(--bg-secondary)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              maxHeight: 300,
              overflow: "auto",
            }}>
              <pre style={{
                fontSize: 11,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                margin: 0,
                fontFamily: "'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', monospace",
                color: "var(--text-secondary)",
                lineHeight: 1.6,
              }}>
                {buildLogs}
              </pre>
            </div>
          )}
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
