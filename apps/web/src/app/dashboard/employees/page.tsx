"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Plus, Users, MessageCircle, Search, Mail, Cpu, Calendar } from "lucide-react";

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

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

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

  // Filter employees
  const filtered = employees.filter((emp) => {
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
          onClick={fetchEmployees}
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
            {employees.length} team member{employees.length !== 1 ? "s" : ""}
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
          {/* Search + Filters */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
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
                const count = opt.value === "all" ? employees.length : (statusCounts[opt.value] || 0);
                if (opt.value !== "all" && count === 0) return null;
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
          </div>

          {/* Results count when filtering */}
          {(search || statusFilter !== "all") && (
            <p style={{ fontSize: 12, color: "var(--text-tertiary, #a3a3a3)", margin: "0 0 12px 0" }}>
              Showing {filtered.length} of {employees.length} employee{employees.length !== 1 ? "s" : ""}
              {search && <> matching &ldquo;{search}&rdquo;</>}
            </p>
          )}

          {/* Employee Cards Grid */}
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
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 12,
            }}>
              {filtered.map((emp) => (
                <EmployeeCard key={emp.id} emp={emp} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EmployeeCard({ emp }: { emp: any }) {
  const [hovered, setHovered] = useState(false);
  const model = getModelLabel(emp.modelConfig);
  const tier = TIER_LABELS[emp.tier] || emp.tier;

  const statusStyle = emp.status === "active"
    ? { color: "#16a34a", bg: "rgba(22, 163, 74, 0.06)", border: "rgba(22, 163, 74, 0.14)" }
    : emp.status === "provisioning" || emp.status === "onboarding"
      ? { color: "#d97706", bg: "rgba(217, 119, 6, 0.06)", border: "rgba(217, 119, 6, 0.14)" }
      : emp.status === "error"
        ? { color: "#dc2626", bg: "rgba(220, 38, 38, 0.06)", border: "rgba(220, 38, 38, 0.14)" }
        : { color: "#a3a3a3", bg: "#f5f5f5", border: "#e5e5e5" };

  return (
    <Link
      href={`/dashboard/employees/${emp.id}`}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          padding: 16,
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
          <div
            style={{
              width: 42, height: 42, borderRadius: "var(--radius-md, 8px)",
              background: "var(--bg-secondary, #f5f5f5)",
              border: "1px solid var(--border, #e5e5e5)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, flexShrink: 0,
            }}
          >
            {emp.emoji || "A"}
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
          {/* Status badge */}
          <span
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              height: 22, padding: "0 7px", fontSize: 11, fontWeight: 500,
              borderRadius: "var(--radius-sm, 6px)", textTransform: "capitalize",
              color: statusStyle.color, background: statusStyle.bg,
              border: `1px solid ${statusStyle.border}`, flexShrink: 0, whiteSpace: "nowrap",
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", flexShrink: 0 }} />
            {emp.status}
          </span>
        </div>

        {/* Info row */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: "6px 14px",
          fontSize: 12, color: "var(--text-tertiary, #a3a3a3)", lineHeight: 1.4,
        }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Cpu size={12} strokeWidth={1.5} />
            {tier} &middot; {model}
          </span>
          {emp.emailAddress && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Mail size={12} strokeWidth={1.5} />
              {emp.emailAddress}
            </span>
          )}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Calendar size={12} strokeWidth={1.5} />
            Hired {timeAgo(emp.createdAt)}
          </span>
        </div>

        {/* Actions row */}
        {emp.status === "active" && (
          <div style={{ display: "flex", gap: 6, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border, #e5e5e5)" }}>
            <Link
              href={`/dashboard/employees/${emp.id}/chat`}
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
          </div>
        )}
      </div>
    </Link>
  );
}
