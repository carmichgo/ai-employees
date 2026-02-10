"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Building2, User, Server, RefreshCw, Trash2, Link2, Unlink, CheckCircle2, ExternalLink } from "lucide-react";

const DROPLET_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  none: { label: "Not provisioned", color: "var(--text-tertiary)" },
  provisioning: { label: "Provisioning...", color: "#f59e0b" },
  booting: { label: "Booting...", color: "#f59e0b" },
  active: { label: "Active", color: "#22c55e" },
  error: { label: "Error", color: "#ef4444" },
  destroyed: { label: "Destroyed", color: "var(--text-tertiary)" },
};

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <div style={{ width: 24, height: 24, border: "2px solid var(--border)", borderTopColor: "var(--text)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
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
            borderTopColor: "var(--text)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  const dropletStatusInfo = DROPLET_STATUS_LABELS[droplet?.status || "none"] || DROPLET_STATUS_LABELS.none;

  return (
    <div className="animate-in" style={{ maxWidth: 600 }}>
      <h1 className="heading-1" style={{ marginBottom: 32 }}>Settings</h1>

      <div className="card" style={{ padding: 24, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <Building2 size={16} style={{ color: "var(--text-tertiary)" }} />
          <h3 style={{ fontSize: 14, fontWeight: 600 }}>Company</h3>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[
            { label: "Name", value: company.name },
            { label: "Slug", value: company.slug },
            { label: "Plan", value: company.plan, capitalize: true },
            { label: "Max Employees", value: company.maxEmployees },
          ].map((item) => (
            <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{item.label}</span>
              <span style={{
                fontSize: 13,
                fontWeight: 500,
                textTransform: item.capitalize ? "capitalize" : undefined,
              }}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Infrastructure Card */}
      <div className="card" style={{ padding: 24, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <Server size={16} style={{ color: "var(--text-tertiary)" }} />
          <h3 style={{ fontSize: 14, fontWeight: 600 }}>Infrastructure</h3>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Status</span>
            <span style={{
              fontSize: 12,
              fontWeight: 600,
              color: dropletStatusInfo.color,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}>
              {(droplet?.status === "provisioning" || droplet?.status === "booting") && (
                <span style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: "#f59e0b",
                  animation: "pulse 1.5s ease-in-out infinite",
                }} />
              )}
              {droplet?.status === "active" && (
                <span style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: "#22c55e",
                }} />
              )}
              {dropletStatusInfo.label}
            </span>
          </div>

          {droplet?.status === "active" && droplet?.phase && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Services</span>
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                color: droplet.phase === "ready" ? "#22c55e" : droplet.phase === "failed" ? "#ef4444" : "#f59e0b",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}>
                {droplet.phase === "provisioning" && (
                  <span style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: "#f59e0b",
                    animation: "pulse 1.5s ease-in-out infinite",
                  }} />
                )}
                {droplet.phase === "ready" && (
                  <span style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: "#22c55e",
                  }} />
                )}
                {droplet.phase === "provisioning" ? "Building..." : droplet.phase === "ready" ? "Ready" : droplet.phase === "failed" ? "Build Failed" : droplet.phase}
              </span>
            </div>
          )}

          {droplet?.ip && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>IP Address</span>
              <span style={{ fontSize: 13, fontWeight: 500, fontFamily: "monospace" }}>{droplet.ip}</span>
            </div>
          )}

          {droplet?.region && droplet?.status !== "none" && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Region</span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{droplet.region}</span>
            </div>
          )}

          {droplet?.size && droplet?.status !== "none" && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Size</span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{droplet.size}</span>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            {(!droplet || droplet.status === "none" || droplet.status === "destroyed") && (
              <button
                className="btn-primary btn-sm"
                onClick={handleProvision}
                disabled={dropletLoading}
                style={{ fontSize: 12 }}
              >
                Provision Infrastructure
              </button>
            )}
            {(droplet?.status === "provisioning" || droplet?.status === "booting") && (
              <button
                className="btn-secondary btn-sm"
                onClick={loadDroplet}
                style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}
              >
                <RefreshCw size={12} /> Refresh
              </button>
            )}
            {(droplet?.status === "active" || droplet?.status === "booting" || droplet?.status === "provisioning" || droplet?.status === "error") && (
              <button
                className="btn-danger btn-sm"
                onClick={handleDestroy}
                disabled={dropletLoading}
                style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}
              >
                <Trash2 size={12} /> Destroy
              </button>
            )}
            {droplet?.status === "active" && (
              <button
                className="btn-secondary btn-sm"
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
                style={{ fontSize: 12 }}
              >
                {logsLoading ? "Loading..." : "View Build Logs"}
              </button>
            )}
          </div>

          {buildLogs && (
            <div style={{
              marginTop: 12,
              padding: 12,
              backgroundColor: "var(--bg-secondary)",
              borderRadius: 8,
              maxHeight: 300,
              overflow: "auto",
            }}>
              <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0, fontFamily: "monospace", color: "var(--text-secondary)" }}>
                {buildLogs}
              </pre>
            </div>
          )}
        </div>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>
      </div>

      {/* Integrations Card */}
      <div className="card" style={{ padding: 24, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <Link2 size={16} style={{ color: "var(--text-tertiary)" }} />
          <h3 style={{ fontSize: 14, fontWeight: 600 }}>Integrations</h3>
        </div>

        {/* Slack OAuth notice */}
        {slackNotice && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              marginBottom: 16,
              fontSize: 13,
              background:
                slackNotice.type === "success"
                  ? "rgba(34, 197, 94, 0.1)"
                  : slackNotice.type === "denied"
                    ? "rgba(245, 158, 11, 0.1)"
                    : "rgba(239, 68, 68, 0.1)",
              border: `1px solid ${
                slackNotice.type === "success"
                  ? "rgba(34, 197, 94, 0.2)"
                  : slackNotice.type === "denied"
                    ? "rgba(245, 158, 11, 0.2)"
                    : "rgba(239, 68, 68, 0.2)"
              }`,
              color:
                slackNotice.type === "success"
                  ? "#22c55e"
                  : slackNotice.type === "denied"
                    ? "#f59e0b"
                    : "#ef4444",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {slackNotice.type === "success" && <CheckCircle2 size={14} />}
            {slackNotice.message}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Slack */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 16px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--bg-secondary)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 24 }}>💬</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Slack</div>
                {integrations.slack ? (
                  <div style={{ fontSize: 12, color: "#22c55e", display: "flex", alignItems: "center", gap: 4 }}>
                    <CheckCircle2 size={11} />
                    Connected to {integrations.slack.teamName}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                    Let employees chat in your Slack workspace
                  </div>
                )}
              </div>
            </div>
            {integrations.slack ? (
              <button
                className="btn-danger btn-sm"
                onClick={handleDisconnectSlack}
                disabled={integrationsLoading}
                style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}
              >
                <Unlink size={12} /> Disconnect
              </button>
            ) : (
              <button
                className="btn-primary btn-sm"
                onClick={handleConnectSlack}
                style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}
              >
                <ExternalLink size={12} /> Connect
              </button>
            )}
          </div>

          {/* Email — coming soon */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 16px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--bg-secondary)",
              opacity: 0.6,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 24 }}>📧</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Email</div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  Dedicated email addresses for employees
                </div>
              </div>
            </div>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 500 }}>
              Coming soon
            </span>
          </div>

          {/* Discord — coming soon */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 16px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--bg-secondary)",
              opacity: 0.6,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 24 }}>🎮</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Discord</div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  Add employees to your Discord server
                </div>
              </div>
            </div>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 500 }}>
              Coming soon
            </span>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <User size={16} style={{ color: "var(--text-tertiary)" }} />
          <h3 style={{ fontSize: 14, fontWeight: 600 }}>Account</h3>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[
            { label: "Name", value: user.name },
            { label: "Email", value: user.email },
            { label: "Role", value: user.role, capitalize: true },
          ].map((item) => (
            <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{item.label}</span>
              <span style={{
                fontSize: 13,
                fontWeight: 500,
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
