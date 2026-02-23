"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Plus, Users, Zap, AlertTriangle, Pause, ArrowRight } from "lucide-react";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function getFirstName(fullName: string | undefined): string {
  if (!fullName) return "";
  return fullName.split(" ")[0];
}

export default function DashboardOverview() {
  const [data, setData] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [activityMap, setActivityMap] = useState<Record<string, { activityStatus: string; currentTask: string | null; inProgressCount: number }>>({});

  const fetchActivity = () => {
    api.getEmployeeActivity().then((res) => {
      const map: typeof activityMap = {};
      for (const a of res.activity) {
        map[a.employeeId] = { activityStatus: a.activityStatus, currentTask: a.currentTask, inProgressCount: a.inProgressCount };
      }
      setActivityMap(map);
    }).catch(() => {});
  };

  useEffect(() => {
    api.getDashboard().then(setData).catch((err) => {
      setError(err.message || "Failed to load dashboard");
    });
    api.listEmployees().then((res) => setEmployees(res.employees)).catch(() => {});
    api.me().then((res) => {
      setUser(res.user);
      setCompany(res.company);
    }).catch(() => {});
    fetchActivity();
    const interval = setInterval(fetchActivity, 15_000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div style={{ textAlign: "center", paddingTop: 120 }}>
        <p style={{
          color: "var(--red)",
          marginBottom: 16,
          fontSize: 14,
        }}>
          {error}
        </p>
        <button
          onClick={() => {
            setError(null);
            api.getDashboard().then(setData).catch((err) => {
              setError(err.message || "Failed to load dashboard");
            });
            api.listEmployees().then((res) => setEmployees(res.employees)).catch(() => {});
          }}
          style={{
            height: 36,
            padding: "0 16px",
            fontSize: 13,
            fontWeight: 500,
            color: "#fff",
            background: "var(--text)",
            border: "none",
            borderRadius: "var(--radius-md)",
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "60vh",
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            border: "2px solid var(--border)",
            borderTopColor: "var(--text-tertiary)",
            borderRadius: "50%",
            animation: "spin 0.7s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  const stats = [
    { label: "Total", value: data.employees.total, icon: Users, color: "var(--text)" },
    { label: "Active", value: data.employees.active, icon: Zap, color: "var(--green)" },
    { label: "Paused", value: data.employees.paused, icon: Pause, color: "var(--orange)" },
    { label: "Errors", value: data.employees.error, icon: AlertTriangle, color: "var(--red)" },
  ];

  return (
    <div>
      {/* Header / Greeting */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontSize: 24,
          fontWeight: 600,
          color: "var(--text)",
          letterSpacing: "-0.02em",
          marginBottom: 4,
          lineHeight: 1.3,
        }}>
          {getGreeting()}{user ? `, ${getFirstName(user.name)}` : ""}
        </h1>
        <p style={{
          fontSize: 14,
          color: "var(--text-tertiary)",
          margin: 0,
        }}>
          {company ? company.name : "Your workspace"}
        </p>
      </div>

      {/* Stat cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 12,
        marginBottom: 40,
      }}>
        {stats.map((stat) => (
          <div
            key={stat.label}
            style={{
              background: "#fff",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              padding: "16px 20px",
            }}
          >
            <div style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--text-tertiary)",
              marginBottom: 8,
              letterSpacing: "0.01em",
            }}>
              {stat.label}
            </div>
            <div style={{
              fontSize: 28,
              fontWeight: 600,
              color: stat.color,
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Your Team header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 16,
      }}>
        <h2 style={{
          fontSize: 15,
          fontWeight: 600,
          color: "var(--text)",
          letterSpacing: "-0.01em",
          margin: 0,
        }}>
          Your Team
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {employees.length > 0 && (
            <Link
              href="/dashboard/employees"
              style={{
                fontSize: 13,
                color: "var(--text-tertiary)",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              View all
              <ArrowRight size={12} />
            </Link>
          )}
          <Link
            href="/dashboard/hire"
            style={{
              height: 32,
              padding: "0 12px",
              fontSize: 13,
              fontWeight: 500,
              color: "#fff",
              background: "var(--text)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <Plus size={14} strokeWidth={2} />
            Hire
          </Link>
        </div>
      </div>

      {/* Employee grid */}
      {employees.length === 0 ? (
        <div
          style={{
            padding: "56px 40px",
            textAlign: "center",
            background: "#fff",
            border: "1px dashed var(--border)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "var(--bg-secondary)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <Users size={24} strokeWidth={1.5} style={{ color: "var(--text-tertiary)" }} />
          </div>
          <h3 style={{
            fontSize: 15,
            fontWeight: 600,
            color: "var(--text)",
            marginBottom: 6,
          }}>
            No employees yet
          </h3>
          <p style={{
            color: "var(--text-tertiary)",
            fontSize: 13,
            maxWidth: 300,
            margin: "0 auto 20px",
            lineHeight: 1.5,
          }}>
            Hire your first AI employee to get started
          </p>
          <Link
            href="/dashboard/hire"
            style={{
              height: 36,
              padding: "0 16px",
              fontSize: 13,
              fontWeight: 500,
              color: "#fff",
              background: "var(--text)",
              border: "none",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Plus size={14} />
            Hire Employee
          </Link>
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 12,
        }}>
          {employees.map((emp) => {
            const statusColors: Record<string, { bg: string; text: string; dot: string }> = {
              active: { bg: "#f0fdf4", text: "var(--green)", dot: "var(--green)" },
              paused: { bg: "#fff7ed", text: "var(--orange)", dot: "var(--orange)" },
              error: { bg: "#fef2f2", text: "var(--red)", dot: "var(--red)" },
              provisioning: { bg: "#eff6ff", text: "var(--blue)", dot: "var(--blue)" },
              onboarding: { bg: "#eff6ff", text: "var(--blue)", dot: "var(--blue)" },
              terminated: { bg: "var(--bg-secondary)", text: "var(--text-tertiary)", dot: "var(--text-tertiary)" },
            };
            const sc = statusColors[emp.status] || statusColors.active;
            const act = activityMap[emp.id];
            const actColors: Record<string, { dot: string; bg: string; text: string }> = {
              working: { dot: "#16a34a", bg: "rgba(22, 163, 74, 0.08)", text: "#16a34a" },
              may_be_stuck: { dot: "#dc2626", bg: "rgba(220, 38, 38, 0.08)", text: "#dc2626" },
              idle: { dot: "#d97706", bg: "rgba(217, 119, 6, 0.08)", text: "#d97706" },
              offline: { dot: "#a3a3a3", bg: "rgba(163, 163, 163, 0.08)", text: "#a3a3a3" },
            };
            const ac = act ? actColors[act.activityStatus] || actColors.offline : null;

            return (
              <Link
                key={emp.id}
                href={`/dashboard/employees/${emp.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-lg)",
                    padding: "16px 20px",
                    cursor: "pointer",
                    transition: "box-shadow 0.15s ease, border-color 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = "var(--shadow-sm)";
                    e.currentTarget.style.borderColor = "#d4d4d4";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = "none";
                    e.currentTarget.style.borderColor = "var(--border)";
                  }}
                >
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 12,
                  }}>
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 10,
                          background: "var(--bg-secondary)",
                          border: "1px solid var(--border)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 20,
                        }}
                      >
                        {emp.emoji || "A"}
                      </div>
                      {emp.status === "active" && act && (
                        <>
                          <span style={{
                            position: "absolute", bottom: -2, right: -2,
                            width: 10, height: 10, borderRadius: "50%",
                            background: ac!.dot, border: "2px solid #fff", zIndex: 1,
                          }} />
                          {act.activityStatus === "working" && (
                            <span className="dash-pulse" style={{
                              position: "absolute", bottom: -2, right: -2,
                              width: 10, height: 10, borderRadius: "50%",
                              background: ac!.dot, opacity: 0.4, zIndex: 0,
                            }} />
                          )}
                          {act.activityStatus === "may_be_stuck" && (
                            <span className="dash-blink" style={{
                              position: "absolute", bottom: -2, right: -2,
                              width: 10, height: 10, borderRadius: "50%",
                              background: ac!.dot, zIndex: 0,
                            }} />
                          )}
                        </>
                      )}
                    </div>
                    <div style={{ overflow: "hidden", flex: 1 }}>
                      <div style={{
                        fontWeight: 600,
                        fontSize: 14,
                        color: "var(--text)",
                        letterSpacing: "-0.01em",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}>
                        {emp.name}
                      </div>
                      <div style={{
                        fontSize: 12,
                        color: act?.activityStatus === "working" ? "#16a34a"
                          : act?.activityStatus === "may_be_stuck" ? "#dc2626"
                          : "var(--text-tertiary)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}>
                        {act?.activityStatus === "working" && act.currentTask
                          ? act.currentTask
                          : act?.activityStatus === "may_be_stuck" && act.currentTask
                            ? `Stuck: ${act.currentTask}`
                            : emp.jobTitle}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 500,
                      color: sc.text,
                      background: sc.bg,
                      padding: "3px 10px",
                      borderRadius: 99,
                    }}>
                      <span style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: sc.dot,
                        flexShrink: 0,
                      }} />
                      <span style={{ textTransform: "capitalize" }}>{emp.status}</span>
                    </div>
                    {emp.status === "active" && act && (
                      <div style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 11,
                        fontWeight: 500,
                        color: ac!.text,
                        background: ac!.bg,
                        padding: "3px 8px",
                        borderRadius: 99,
                      }}>
                        <span style={{
                          width: 5, height: 5, borderRadius: "50%",
                          background: ac!.dot, flexShrink: 0,
                        }} />
                        {act.activityStatus === "working"
                          ? `Working (${act.inProgressCount})`
                          : act.activityStatus === "may_be_stuck"
                            ? `Stuck (${act.inProgressCount})`
                            : act.activityStatus === "idle"
                              ? "Idle"
                              : "Offline"}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
          <style>{`
            @keyframes dashPulse {
              0% { transform: scale(1); opacity: 0.4; }
              50% { transform: scale(2); opacity: 0; }
              100% { transform: scale(1); opacity: 0; }
            }
            .dash-pulse { animation: dashPulse 2s ease-in-out infinite; }
            @keyframes dashBlink {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.3; }
            }
            .dash-blink { animation: dashBlink 1.5s ease-in-out infinite; }
          `}</style>
        </div>
      )}
    </div>
  );
}
