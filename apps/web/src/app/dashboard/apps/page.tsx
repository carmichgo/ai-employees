"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  Blocks,
  Loader2,
  ExternalLink,
  Trash2,
  Eye,
  X,
  Globe,
  Lock,
  Code,
  Wrench,
  Zap,
  FileCode,
  Search,
} from "lucide-react";

type App = {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  type: string;
  workspacePath: string | null;
  url: string | null;
  instructions: string | null;
  shared: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  employeeId: string;
  employeeName: string | null;
  employeeEmoji: string | null;
  employeeJobTitle: string | null;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function getTypeIcon(type: string) {
  switch (type) {
    case "webapp": return Globe;
    case "script": return FileCode;
    case "api": return Zap;
    case "skill": return Code;
    default: return Wrench;
  }
}

function getTypeLabel(type: string) {
  switch (type) {
    case "webapp": return "Web App";
    case "script": return "Script";
    case "api": return "API";
    case "skill": return "Skill";
    default: return "Tool";
  }
}

function getTypeColor(type: string) {
  switch (type) {
    case "webapp": return "#3b82f6";
    case "script": return "#8b5cf6";
    case "api": return "#f59e0b";
    case "skill": return "#10b981";
    default: return "#6b7280";
  }
}

/* ─── App Detail Modal ────────────────────────────────────── */

function AppDetail({ app, onClose, onDelete }: { app: App; onClose: () => void; onDelete: (id: string) => void }) {
  const [deleting, setDeleting] = useState(false);
  const TypeIcon = getTypeIcon(app.type);

  const handleDelete = async () => {
    if (!confirm(`Delete "${app.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api.deleteApp(app.id);
      onDelete(app.id);
      onClose();
    } catch {
      alert("Failed to delete app");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 40,
      }}
    >
      <div
        style={{
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          width: "100%",
          maxWidth: 600,
          maxHeight: "calc(100vh - 80px)",
          overflow: "auto",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            padding: "20px 24px 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "var(--radius)",
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
              }}
            >
              {app.emoji || "🔧"}
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{app.name}</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 500,
                    padding: "2px 8px",
                    borderRadius: 99,
                    background: `${getTypeColor(app.type)}18`,
                    color: getTypeColor(app.type),
                  }}
                >
                  <TypeIcon size={10} />
                  {getTypeLabel(app.type)}
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    fontSize: 11,
                    color: "var(--text-tertiary)",
                  }}
                >
                  {app.shared ? <Globe size={10} /> : <Lock size={10} />}
                  {app.shared ? "Shared" : "Private"}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              padding: 4,
              cursor: "pointer",
              color: "var(--text-secondary)",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 24px 24px" }}>
          {app.description && (
            <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 16px", lineHeight: 1.5 }}>
              {app.description}
            </p>
          )}

          {/* Creator */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              background: "var(--bg-secondary)",
              borderRadius: "var(--radius-sm)",
              marginBottom: 12,
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: "var(--radius-sm)",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
              }}
            >
              {app.employeeEmoji || app.employeeName?.charAt(0) || "?"}
            </div>
            <div>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{app.employeeName}</span>
              <span style={{ fontSize: 12, color: "var(--text-tertiary)", marginLeft: 6 }}>
                {app.employeeJobTitle}
              </span>
            </div>
          </div>

          {/* URL */}
          {app.url && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", marginBottom: 4, letterSpacing: "0.02em" }}>URL</div>
              <a
                href={app.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 13,
                  color: "var(--blue, #2563eb)",
                  textDecoration: "none",
                }}
              >
                {app.url} <ExternalLink size={12} />
              </a>
            </div>
          )}

          {/* Workspace Path */}
          {app.workspacePath && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", marginBottom: 4, letterSpacing: "0.02em" }}>WORKSPACE PATH</div>
              <code
                style={{
                  fontSize: 12,
                  background: "var(--bg-secondary)",
                  padding: "4px 8px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                }}
              >
                {app.workspacePath}
              </code>
            </div>
          )}

          {/* Instructions */}
          {app.instructions && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", marginBottom: 4, letterSpacing: "0.02em" }}>HOW TO USE</div>
              <div
                style={{
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: "var(--text)",
                  background: "var(--bg-secondary)",
                  padding: "12px 14px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {app.instructions}
              </div>
            </div>
          )}

          {/* Meta */}
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 16 }}>
            Created {formatDate(app.createdAt)}
            {app.updatedAt !== app.createdAt && ` · Updated ${formatDate(app.updatedAt)}`}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8 }}>
            {app.url && (
              <a
                href={app.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 14px",
                  background: "var(--text)",
                  color: "var(--bg)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 13,
                  fontWeight: 500,
                  textDecoration: "none",
                  cursor: "pointer",
                }}
              >
                <ExternalLink size={14} /> Open App
              </a>
            )}
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 14px",
                background: "none",
                color: "var(--red, #dc2626)",
                border: "1px solid var(--red, #dc2626)",
                borderRadius: "var(--radius-sm)",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                opacity: deleting ? 0.5 : 1,
              }}
            >
              {deleting ? <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> : <Trash2 size={14} />}
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ────────────────────────────────────────────────── */

export default function AppsPage() {
  const router = useRouter();
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [viewingApp, setViewingApp] = useState<App | null>(null);

  useEffect(() => {
    api
      .listApps()
      .then((res) => setApps(res.apps || []))
      .catch((err: any) => {
        if (err.status === 401) router.push("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  const filtered = apps.filter((app) => {
    if (filter !== "all" && app.type !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        app.name.toLowerCase().includes(q) ||
        (app.description || "").toLowerCase().includes(q) ||
        (app.employeeName || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const types = Array.from(new Set(apps.map((a) => a.type)));

  const handleDelete = (id: string) => {
    setApps((prev) => prev.filter((a) => a.id !== id));
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 400 }}>
        <Loader2 size={32} style={{ color: "var(--blue)", animation: "spin 2s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* App Detail Modal */}
      {viewingApp && (
        <AppDetail
          app={viewingApp}
          onClose={() => setViewingApp(null)}
          onDelete={handleDelete}
        />
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Apps</h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" }}>
            Tools and apps created by your employees. Shared across the team.
          </p>
        </div>
      </div>

      {/* Search + Filter */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search
            size={14}
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-tertiary)",
            }}
          />
          <input
            type="text"
            placeholder="Search apps..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px 8px 34px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              fontSize: 13,
              background: "var(--bg)",
              color: "var(--text)",
              outline: "none",
            }}
          />
        </div>
        {types.length > 1 && (
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => setFilter("all")}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 500,
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                background: filter === "all" ? "var(--text)" : "var(--bg)",
                color: filter === "all" ? "var(--bg)" : "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              All
            </button>
            {types.map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 500,
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  background: filter === type ? "var(--text)" : "var(--bg)",
                  color: filter === type ? "var(--bg)" : "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                {getTypeLabel(type)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Apps Grid */}
      {filtered.length === 0 ? (
        <div className="card" style={{ padding: 60, textAlign: "center" }}>
          <Blocks size={36} style={{ color: "var(--text-tertiary)", marginBottom: 12 }} />
          <p style={{ color: "var(--text-secondary)", margin: 0, fontSize: 14 }}>
            {search
              ? "No apps match your search."
              : "No apps yet. When your employees build tools or apps, they\u2019ll appear here."}
          </p>
          {!search && (
            <p style={{ color: "var(--text-tertiary)", margin: "8px 0 0", fontSize: 12 }}>
              Employees can register apps by using the app registration API in their workspace.
            </p>
          )}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 12,
          }}
        >
          {filtered.map((app) => {
            const TypeIcon = getTypeIcon(app.type);
            return (
              <div
                key={app.id}
                className="card"
                onClick={() => setViewingApp(app)}
                style={{
                  padding: 16,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--text-tertiary)";
                  e.currentTarget.style.boxShadow = "var(--shadow-sm)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                {/* Top row */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "var(--radius)",
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 20,
                      flexShrink: 0,
                    }}
                  >
                    {app.emoji || "🔧"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{app.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 3,
                          fontSize: 11,
                          fontWeight: 500,
                          padding: "1px 6px",
                          borderRadius: 99,
                          background: `${getTypeColor(app.type)}18`,
                          color: getTypeColor(app.type),
                        }}
                      >
                        <TypeIcon size={9} />
                        {getTypeLabel(app.type)}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 2 }}>
                        {app.shared ? <Globe size={9} /> : <Lock size={9} />}
                        {app.shared ? "Shared" : "Private"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                {app.description && (
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--text-secondary)",
                      margin: "0 0 10px",
                      lineHeight: 1.4,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical" as const,
                    }}
                  >
                    {app.description}
                  </p>
                )}

                {/* Footer */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: 11,
                    color: "var(--text-tertiary)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 12 }}>{app.employeeEmoji || "🤖"}</span>
                    <span>{app.employeeName}</span>
                  </div>
                  <span>{formatDate(app.createdAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
