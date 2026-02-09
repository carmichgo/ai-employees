"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Building2, User, Server, RefreshCw, Trash2 } from "lucide-react";

const DROPLET_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  none: { label: "Not provisioned", color: "var(--text-tertiary)" },
  provisioning: { label: "Provisioning...", color: "#f59e0b" },
  booting: { label: "Booting...", color: "#f59e0b" },
  active: { label: "Active", color: "#22c55e" },
  error: { label: "Error", color: "#ef4444" },
  destroyed: { label: "Destroyed", color: "var(--text-tertiary)" },
};

export default function SettingsPage() {
  const [company, setCompany] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [droplet, setDroplet] = useState<any>(null);
  const [dropletLoading, setDropletLoading] = useState(false);

  useEffect(() => {
    api.me().then((data) => {
      setCompany(data.company);
      setUser(data.user);
    });
    loadDroplet();
  }, []);

  const loadDroplet = useCallback(async () => {
    try {
      const data = await api.getDropletStatus();
      setDroplet(data.droplet);

      // Auto-poll while provisioning
      if (data.droplet.status === "provisioning" || data.droplet.status === "booting") {
        setTimeout(loadDroplet, 5000);
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
          </div>
        </div>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>
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
