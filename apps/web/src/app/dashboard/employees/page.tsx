"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Plus, Users, MessageCircle, Search, Mail, Cpu, Calendar, LayoutGrid, List, ChevronRight, Activity } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "provisioning", label: "Provisioning" },
  { value: "paused", label: "Paused" },
  { value: "terminated", label: "Terminated" },
  { value: "error", label: "Error" },
];

const TIER_LABELS: Record<string, string> = {
  junior: "Junior",
  senior: "Senior",
  expert: "Expert",
};

const MODEL_SHORT: Record<string, string> = {
  "anthropic/claude-opus-4-6": "Opus 4.6",
  "anthropic/claude-sonnet-4-5-20250929": "Sonnet 4.5",
  "anthropic/claude-haiku-4-5-20251001": "Haiku 4.5",
  "anthropic/claude-sonnet-4-20250514": "Sonnet 4",
  "anthropic/claude-3-5-sonnet-20241022": "Sonnet 3.5",
};

function getModelLabel(config: any): string {
  const model = config?.primary || "";
  return MODEL_SHORT[model] || model.split("/").pop() || "Unknown";
}

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

function getStatusStyle(status: string) {
  if (status === "active") return { color: "#16a34a", bg: "rgba(22, 163, 74, 0.06)", border: "rgba(22, 163, 74, 0.14)" };
  if (status === "provisioning" || status === "onboarding") return { color: "#d97706", bg: "rgba(217, 119, 6, 0.06)", border: "rgba(217, 119, 6, 0.14)" };
  if (status === "error") return { color: "#dc2626", bg: "rgba(220, 38, 38, 0.06)", border: "rgba(220, 38, 38, 0.14)" };
  return { color: "#a3a3a3", bg: "#f5f5f5", border: "#e5e5e5" };
}

type ViewMode = "grid" | "list";

type ActivityStatus = "working" | "idle" | "offline";
type ActivityInfo = {
  activityStatus: ActivityStatus;
  currentTask: string | null;
  inProgressCount: number;
  pendingCount: number;
  lastActiveAt: string | null;
  tasks: Array<{ taskId: string; title: string; lastUpdated: string; minutesSinceUpdate: number }>;
};

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [activityMap, setActivityMap] = useState<Record<string, ActivityInfo>>({});

  const fetchActivity = () => {
    api.getEmployeeActivity().then((res) => {
      const map: Record<string, ActivityInfo> = {};
      for (const a of res.activity) {
        map[a.employeeId] = {
          activityStatus: a.activityStatus,
          currentTask: a.currentTask,
          inProgressCount: a.inProgressCount,
          pendingCount: a.pendingCount || 0,
          lastActiveAt: a.lastActiveAt,
          tasks: a.tasks || [],
        };
      }
      setActivityMap(map);
    }).catch(() => {});
  };

  const fetchEmployees = () => {
    setLoading(true);
    setError(null);
    api
      .listEmployees()
      .then((res) => {
        setEmployees(res.employees);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load employees");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchEmployees();
    fetchActivity();
    // Poll activity every 15 seconds
    const interval = setInterval(fetchActivity, 15_000);
    return () => clearInterval(interval);
  }, []);

  // Auto-poll while any employee is provisioning
  useEffect(() => {
    const hasProvisioning = employees.some((e) => e.status === "provisioning" || e.status === "onboarding");
    if (!hasProvisioning) return;
    const interval = setInterval(() => {
      api.listEmployees().then((res) => {
        setEmployees(res.employees);
      }).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [employees]);

  // Filter employees — "All" hides terminated so they don't clutter the main view
  const filtered = employees.filter((emp) => {
    if (statusFilter === "all" && emp.status === "terminated") return false;
    if (statusFilter !== "all" && emp.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        emp.name?.toLowerCase().includes(q) ||
        emp.jobTitle?.toLowerCase().includes(q) ||
        emp.emailAddress?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Status counts for filter badges
  const statusCounts = employees.reduce((acc: Record<string, number>, emp) => {
    acc[emp.status] = (acc[emp.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <div
          style={{
            width: 20, height: 20,
            border: "2px solid var(--border, #e5e5e5)",
            borderTopColor: "var(--text-tertiary, #a3a3a3)",
            borderRadius: "50%",
            animation: "spin 0.7s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: "center", paddingTop: 80 }}>
        <p style={{ color: "#dc2626", marginBottom: 16, fontSize: 14 }}>{error}</p>
        <button
          onClick={() => fetchEmployees()}
          style={{
            height: 36, padding: "0 16px", fontSize: 13, fontWeight: 500,
            color: "#fff", background: "var(--text, #0a0a0a)",
            border: "none", borderRadius: "var(--radius-md, 8px)", cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--text, #0a0a0a)", letterSpacing: "-0.02em", lineHeight: 1.3, margin: 0 }}>
            Employees
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-tertiary, #a3a3a3)", margin: "4px 0 0 0" }}>
            {employees.filter((e) => e.status !== "terminated").length} team member{employees.filter((e) => e.status !== "terminated").length !== 1 ? "s" : ""}
            {statusCounts.active ? ` \u00b7 ${statusCounts.active} active` : ""}
          </p>
        </div>
        <Link
          href="/dashboard/hire"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            height: 36, padding: "0 14px", fontSize: 13, fontWeight: 500,
            color: "#fff", background: "var(--text, #0a0a0a)", border: "none",
            borderRadius: "var(--radius-md, 8px)", textDecoration: "none", cursor: "pointer",
            boxShadow: "var(--shadow-xs, 0 1px 2px rgba(0,0,0,0.05))",
          }}
        >
          <Plus size={15} strokeWidth={2} />
          Hire Employee
        </Link>
      </div>

      {employees.length === 0 ? (
        <div
          style={{
            padding: "56px 40px", textAlign: "center", background: "#fff",
            border: "1px dashed var(--border, #e5e5e5)", borderRadius: "var(--radius-lg, 10px)",
          }}
        >
          <div
            style={{
              width: 56, height: 56, borderRadius: "var(--radius-lg, 10px)",
              background: "var(--bg-secondary, #f5f5f5)", border: "1px solid var(--border, #e5e5e5)",
              display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16,
            }}
          >
            <Users size={24} strokeWidth={1.5} style={{ color: "var(--text-tertiary, #a3a3a3)" }} />
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text, #0a0a0a)", margin: "0 0 6px 0" }}>
            No employees yet
          </h3>
          <p style={{ color: "var(--text-secondary, #525252)", fontSize: 13, lineHeight: 1.5, maxWidth: 280, margin: "0 auto 20px" }}>
            Hire your first AI employee to get started
          </p>
          <Link
            href="/dashboard/hire"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              height: 36, padding: "0 14px", fontSize: 13, fontWeight: 500,
              color: "#fff", background: "var(--text, #0a0a0a)", border: "none",
              borderRadius: "var(--radius-md, 8px)", textDecoration: "none", cursor: "pointer",
              boxShadow: "var(--shadow-xs, 0 1px 2px rgba(0,0,0,0.05))",
            }}
          >
            <Plus size={15} strokeWidth={2} />
            Hire Your First Employee
          </Link>
        </div>
      ) : (
        <>
          {/* Search + Filters + View Toggle */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            {/* Search */}
            <div style={{ position: "relative", flex: "1 1 200px", minWidth: 200 }}>
              <Search
                size={14} strokeWidth={2}
                style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary, #a3a3a3)", pointerEvents: "none" }}
              />
              <input
                type="text"
                placeholder="Search by name, role, or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: "100%", height: 36, paddingLeft: 32, paddingRight: 12,
                  fontSize: 13, border: "1px solid var(--border, #e5e5e5)",
                  borderRadius: "var(--radius-md, 8px)", background: "#fff",
                  color: "var(--text, #0a0a0a)", outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Status filter pills */}
            <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
              {STATUS_OPTIONS.map((opt) => {
                const count = opt.value === "all"
                  ? employees.filter((e) => e.status !== "terminated").length
                  : (statusCounts[opt.value] || 0);
                // Always show "Terminated" tab so users can find fired employees
                if (opt.value !== "all" && opt.value !== "terminated" && count === 0) return null;
                const active = statusFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setStatusFilter(opt.value)}
                    style={{
                      height: 30, padding: "0 10px", fontSize: 12, fontWeight: 500,
                      border: "1px solid",
                      borderRadius: "var(--radius-sm, 6px)", cursor: "pointer",
                      display: "inline-flex", alignItems: "center", gap: 5,
                      transition: "all 0.12s ease",
                      ...(active
                        ? { background: "var(--text, #0a0a0a)", color: "#fff", borderColor: "var(--text, #0a0a0a)" }
                        : { background: "#fff", color: "var(--text-secondary, #525252)", borderColor: "var(--border, #e5e5e5)" }),
                    }}
                  >
                    {opt.label}
                    <span style={{
                      fontSize: 11, opacity: 0.7,
                      background: active ? "rgba(255,255,255,0.2)" : "var(--bg-secondary, #f5f5f5)",
                      padding: "1px 5px", borderRadius: 4,
                      color: active ? "#fff" : "var(--text-tertiary, #a3a3a3)",
                    }}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* View toggle */}
            <div style={{
              display: "flex", border: "1px solid var(--border, #e5e5e5)",
              borderRadius: "var(--radius-sm, 6px)", overflow: "hidden", flexShrink: 0,
            }}>
              {([["grid", LayoutGrid], ["list", List]] as const).map(([mode, Icon]) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode as ViewMode)}
                  style={{
                    width: 32, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
                    border: "none", cursor: "pointer", transition: "all 0.12s ease",
                    background: viewMode === mode ? "var(--text, #0a0a0a)" : "#fff",
                    color: viewMode === mode ? "#fff" : "var(--text-tertiary, #a3a3a3)",
                  }}
                >
                  <Icon size={14} strokeWidth={2} />
                </button>
              ))}
            </div>
          </div>

          {/* Results count when filtering */}
          {(search || statusFilter !== "all") && (
            <p style={{ fontSize: 12, color: "var(--text-tertiary, #a3a3a3)", margin: "0 0 12px 0" }}>
              Showing {filtered.length} of {employees.length} employee{employees.length !== 1 ? "s" : ""}
              {search && <> matching &ldquo;{search}&rdquo;</>}
            </p>
          )}

          {/* Employee list */}
          {filtered.length === 0 ? (
            <div style={{
              padding: "40px 20px", textAlign: "center",
              background: "#fff", border: "1px solid var(--border, #e5e5e5)",
              borderRadius: "var(--radius-lg, 10px)",
            }}>
              <p style={{ color: "var(--text-tertiary, #a3a3a3)", fontSize: 13, margin: 0 }}>
                No employees match your filters
              </p>
            </div>
          ) : viewMode === "grid" ? (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 12,
            }}>
              {filtered.map((emp) => (
                <EmployeeCard key={emp.id} emp={emp} activity={activityMap[emp.id]} />
              ))}
            </div>
          ) : (
            <div style={{
              border: "1px solid var(--border, #e5e5e5)",
              borderRadius: "var(--radius-lg, 10px)",
              background: "#fff", overflow: "hidden",
              boxShadow: "var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06))",
            }}>
              {filtered.map((emp, i) => (
                <EmployeeRow key={emp.id} emp={emp} isLast={i === filtered.length - 1} activity={activityMap[emp.id]} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Grid Card ──────────────────────────────────────────── */

function EmployeeCard({ emp, activity }: { emp: any; activity?: ActivityInfo }) {
  const [hovered, setHovered] = useState(false);
  const model = getModelLabel(emp.modelConfig);
  const tier = TIER_LABELS[emp.tier] || emp.tier;
  const statusStyle = getStatusStyle(emp.status);
  const act = activity || { activityStatus: "offline" as ActivityStatus, currentTask: null, inProgressCount: 0, pendingCount: 0, lastActiveAt: null, tasks: [] };

  return (
    <Link
      href={`/dashboard/employees/${emp.id}`}
      style={{ textDecoration: "none", color: "inherit", display: "flex", minWidth: 0 }}
    >
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          padding: 16,
          display: "flex", flexDirection: "column",
          flex: 1, overflow: "hidden",
          background: hovered ? "var(--bg-secondary, #fafafa)" : "#fff",
          border: `1px solid ${hovered ? "var(--text-tertiary, #c5c5c5)" : "var(--border, #e5e5e5)"}`,
          borderRadius: "var(--radius-lg, 10px)",
          transition: "all 0.15s ease",
          cursor: "pointer",
          boxShadow: hovered
            ? "var(--shadow-md, 0 4px 12px rgba(0,0,0,0.08))"
            : "var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06))",
        }}
      >
        {/* Top row: avatar + name + status */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div
              style={{
                width: 42, height: 42, borderRadius: "var(--radius-md, 8px)",
                background: "var(--bg-secondary, #f5f5f5)",
                border: "1px solid var(--border, #e5e5e5)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20,
              }}
            >
              {emp.emoji || "A"}
            </div>
            {emp.status === "active" && <ActivityDot status={act.activityStatus} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontWeight: 600, fontSize: 14, color: "var(--text, #0a0a0a)",
              letterSpacing: "-0.01em", lineHeight: 1.3,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {emp.name}
            </div>
            <div style={{
              fontSize: 13, color: "var(--text-secondary, #525252)", lineHeight: 1.3, marginTop: 2,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {emp.jobTitle}
            </div>
          </div>
          <StatusBadge status={emp.status} />
        </div>

        {/* Activity bar — shows current work */}
        {emp.status === "active" && (
          <ActivityBar activityStatus={act.activityStatus} currentTask={act.currentTask} inProgressCount={act.inProgressCount} pendingCount={act.pendingCount} />
        )}

        {/* Info rows — fixed 3 lines so all cards are same height */}
        <div style={{
          display: "flex", flexDirection: "column", gap: 4, flex: 1,
          fontSize: 12, color: "var(--text-tertiary, #a3a3a3)", lineHeight: 1.4,
        }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Cpu size={12} strokeWidth={1.5} style={{ flexShrink: 0 }} />
            {tier} &middot; {model}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, minHeight: 17 }}>
            <Mail size={12} strokeWidth={1.5} style={{ flexShrink: 0, opacity: emp.emailAddress ? 1 : 0.35 }} />
            <span style={{
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              opacity: emp.emailAddress ? 1 : 0.5,
            }}>
              {emp.emailAddress || "No email"}
            </span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Calendar size={12} strokeWidth={1.5} style={{ flexShrink: 0 }} />
            Hired {timeAgo(emp.createdAt)}
          </span>
        </div>

        {/* Actions row — always rendered for consistent height */}
        <div style={{ display: "flex", gap: 6, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border, #e5e5e5)" }}>
          {emp.status === "active" ? (
            <Link
              href={`/dashboard/inbox?employee=${emp.id}`}
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                height: 28, padding: "0 10px", fontSize: 12, fontWeight: 500,
                borderRadius: "var(--radius-sm, 6px)", textDecoration: "none",
                color: "var(--blue, #2563eb)", background: "rgba(37, 99, 235, 0.06)",
                border: "1px solid rgba(37, 99, 235, 0.12)",
                transition: "all 0.12s ease",
              }}
            >
              <MessageCircle size={12} />
              Chat
            </Link>
          ) : (
            <span style={{ height: 28, display: "flex", alignItems: "center", fontSize: 12, color: "var(--text-tertiary, #a3a3a3)" }}>
              {emp.status === "provisioning" ? "Setting up..." : emp.status === "paused" ? "Paused" : emp.status === "error" ? "Needs attention" : "Offline"}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

/* ── List Row ──────────────────────────────────────────── */

function EmployeeRow({ emp, isLast, activity }: { emp: any; isLast: boolean; activity?: ActivityInfo }) {
  const [hovered, setHovered] = useState(false);
  const model = getModelLabel(emp.modelConfig);
  const tier = TIER_LABELS[emp.tier] || emp.tier;
  const act = activity || { activityStatus: "offline" as ActivityStatus, currentTask: null, inProgressCount: 0, pendingCount: 0, lastActiveAt: null, tasks: [] };

  return (
    <Link
      href={`/dashboard/employees/${emp.id}`}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          padding: "10px 16px",
          display: "flex", alignItems: "center", gap: 16,
          borderBottom: isLast ? "none" : "1px solid var(--border, #e5e5e5)",
          background: hovered ? "var(--bg-secondary, #f5f5f5)" : "transparent",
          transition: "background 0.12s ease",
          cursor: "pointer",
        }}
      >
        {/* Avatar with activity dot */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{
            width: 34, height: 34, borderRadius: "var(--radius-md, 8px)",
            background: "var(--bg-secondary, #f5f5f5)",
            border: "1px solid var(--border, #e5e5e5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16,
          }}>
            {emp.emoji || "A"}
          </div>
          {emp.status === "active" && <ActivityDot status={act.activityStatus} />}
        </div>

        {/* Name + role / current task */}
        <div style={{ flex: "1 1 160px", minWidth: 0 }}>
          <div style={{
            fontWeight: 500, fontSize: 13, color: "var(--text, #0a0a0a)",
            lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {emp.name}
          </div>
          <div style={{
            fontSize: 12,
            color: act.activityStatus === "working" ? "#16a34a" : "var(--text-secondary, #525252)",
            lineHeight: 1.3, marginTop: 1,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {act.activityStatus === "working" && act.currentTask
              ? act.currentTask
              : emp.jobTitle}
          </div>
        </div>

        {/* Activity label */}
        {emp.status === "active" && (
          <ActivityLabel activityStatus={act.activityStatus} inProgressCount={act.inProgressCount} pendingCount={act.pendingCount} />
        )}

        {/* Tier + Model */}
        <div style={{
          flex: "0 0 auto", fontSize: 12, color: "var(--text-tertiary, #a3a3a3)",
          display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
        }}>
          <Cpu size={11} strokeWidth={1.5} />
          {tier} &middot; {model}
        </div>

        {/* Status */}
        <StatusBadge status={emp.status} />

        {/* Chat + Chevron */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {emp.status === "active" && (
            <Link
              href={`/dashboard/inbox?employee=${emp.id}`}
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 28, height: 28,
                borderRadius: "var(--radius-sm, 6px)", textDecoration: "none",
                color: "var(--blue, #2563eb)", background: "rgba(37, 99, 235, 0.06)",
                border: "1px solid rgba(37, 99, 235, 0.12)",
                transition: "all 0.12s ease",
              }}
            >
              <MessageCircle size={12} />
            </Link>
          )}
          <ChevronRight size={14} strokeWidth={1.5} style={{ color: "var(--text-tertiary, #a3a3a3)" }} />
        </div>
      </div>
    </Link>
  );
}

/* ── Activity Indicators ──────────────────────────────── */

const ACTIVITY_COLORS: Record<ActivityStatus, { dot: string; bg: string; text: string; label: string }> = {
  working: { dot: "#16a34a", bg: "rgba(22, 163, 74, 0.08)", text: "#16a34a", label: "Working" },
  idle: { dot: "#d97706", bg: "rgba(217, 119, 6, 0.08)", text: "#d97706", label: "Idle" },
  offline: { dot: "#a3a3a3", bg: "rgba(163, 163, 163, 0.08)", text: "#a3a3a3", label: "Offline" },
};

function ActivityDot({ status }: { status: ActivityStatus }) {
  const c = ACTIVITY_COLORS[status];
  return (
    <>
      <span
        style={{
          position: "absolute", bottom: -2, right: -2,
          width: 10, height: 10, borderRadius: "50%",
          background: c.dot, border: "2px solid #fff",
          zIndex: 1,
        }}
      />
      {status === "working" && (
        <span
          className="activity-pulse"
          style={{
            position: "absolute", bottom: -2, right: -2,
            width: 10, height: 10, borderRadius: "50%",
            background: c.dot, opacity: 0.4,
            zIndex: 0,
          }}
        />
      )}
      <style>{`
        @keyframes activityPulse {
          0% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(2); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
        }
        .activity-pulse { animation: activityPulse 2s ease-in-out infinite; }
      `}</style>
    </>
  );
}

function ActivityBar({ activityStatus, currentTask, inProgressCount, pendingCount }: {
  activityStatus: ActivityStatus;
  currentTask: string | null;
  inProgressCount: number;
  pendingCount: number;
}) {
  const isIdleWithTasks = activityStatus === "idle" && pendingCount > 0;
  const c = isIdleWithTasks
    ? { dot: "#dc2626", bg: "rgba(220, 38, 38, 0.06)", text: "#dc2626" }
    : ACTIVITY_COLORS[activityStatus];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "5px 8px", marginBottom: 8,
      borderRadius: "var(--radius-sm, 6px)",
      background: c.bg,
      fontSize: 11, fontWeight: 500, color: c.text,
      lineHeight: 1.3,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: c.dot, flexShrink: 0,
      }} />
      {activityStatus === "working" ? (
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {currentTask || `Working on ${inProgressCount} task${inProgressCount !== 1 ? "s" : ""}`}
        </span>
      ) : activityStatus === "idle" && pendingCount > 0 ? (
        <span>Idle — {pendingCount} task{pendingCount !== 1 ? "s" : ""} pending</span>
      ) : activityStatus === "idle" ? (
        <span>Standing by</span>
      ) : (
        <span>Not reachable</span>
      )}
    </div>
  );
}

function ActivityLabel({ activityStatus, inProgressCount, pendingCount }: {
  activityStatus: ActivityStatus;
  inProgressCount: number;
  pendingCount: number;
}) {
  const isIdleWithTasks = activityStatus === "idle" && pendingCount > 0;
  const c = isIdleWithTasks
    ? { dot: "#dc2626", bg: "rgba(220, 38, 38, 0.06)", text: "#dc2626", label: "Idle" }
    : ACTIVITY_COLORS[activityStatus];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 11, fontWeight: 500, color: c.text,
      padding: "2px 8px", borderRadius: 99,
      background: c.bg, flexShrink: 0, whiteSpace: "nowrap",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
      {isIdleWithTasks ? `${pendingCount} pending` : c.label}
      {activityStatus === "working" && inProgressCount > 0 && (
        <span style={{ opacity: 0.7 }}>({inProgressCount})</span>
      )}
    </span>
  );
}

/* ── Shared Status Badge ──────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const s = getStatusStyle(status);
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        height: 22, padding: "0 7px", fontSize: 11, fontWeight: 500,
        borderRadius: "var(--radius-sm, 6px)", textTransform: "capitalize",
        color: s.color, background: s.bg,
        border: `1px solid ${s.border}`, flexShrink: 0, whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", flexShrink: 0 }} />
      {status}
    </span>
  );
}
