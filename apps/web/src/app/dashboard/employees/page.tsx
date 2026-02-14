"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Plus, Users, ChevronRight, MessageCircle } from "lucide-react";

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
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
        <p
          style={{
            color: "#dc2626",
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          {error}
        </p>
        <button
          onClick={fetchEmployees}
          style={{
            height: 36,
            padding: "0 16px",
            fontSize: 13,
            fontWeight: 500,
            color: "#fff",
            background: "var(--text, #0a0a0a)",
            border: "none",
            borderRadius: "var(--radius-md, 8px)",
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "var(--text, #0a0a0a)",
              letterSpacing: "-0.02em",
              lineHeight: 1.3,
              margin: 0,
            }}
          >
            Employees
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-tertiary, #a3a3a3)",
              margin: "4px 0 0 0",
            }}
          >
            {employees.length} team member{employees.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/dashboard/hire"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            height: 36,
            padding: "0 14px",
            fontSize: 13,
            fontWeight: 500,
            color: "#fff",
            background: "var(--text, #0a0a0a)",
            border: "none",
            borderRadius: "var(--radius-md, 8px)",
            textDecoration: "none",
            cursor: "pointer",
            boxShadow: "var(--shadow-xs, 0 1px 2px rgba(0,0,0,0.05))",
          }}
        >
          <Plus size={15} strokeWidth={2} />
          Hire Employee
        </Link>
      </div>

      {/* Employee List */}
      {employees.length === 0 ? (
        <div
          style={{
            padding: "56px 40px",
            textAlign: "center",
            background: "#fff",
            border: "1px dashed var(--border, #e5e5e5)",
            borderRadius: "var(--radius-lg, 10px)",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "var(--radius-lg, 10px)",
              background: "var(--bg-secondary, #f5f5f5)",
              border: "1px solid var(--border, #e5e5e5)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <Users
              size={24}
              strokeWidth={1.5}
              style={{ color: "var(--text-tertiary, #a3a3a3)" }}
            />
          </div>
          <h3
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "var(--text, #0a0a0a)",
              margin: "0 0 6px 0",
            }}
          >
            No employees yet
          </h3>
          <p
            style={{
              color: "var(--text-secondary, #525252)",
              fontSize: 13,
              lineHeight: 1.5,
              maxWidth: 280,
              margin: "0 auto 20px",
            }}
          >
            Hire your first AI employee to get started
          </p>
          <Link
            href="/dashboard/hire"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 36,
              padding: "0 14px",
              fontSize: 13,
              fontWeight: 500,
              color: "#fff",
              background: "var(--text, #0a0a0a)",
              border: "none",
              borderRadius: "var(--radius-md, 8px)",
              textDecoration: "none",
              cursor: "pointer",
              boxShadow: "var(--shadow-xs, 0 1px 2px rgba(0,0,0,0.05))",
            }}
          >
            <Plus size={15} strokeWidth={2} />
            Hire Your First Employee
          </Link>
        </div>
      ) : (
        <div
          style={{
            border: "1px solid var(--border, #e5e5e5)",
            borderRadius: "var(--radius-lg, 10px)",
            background: "#fff",
            overflow: "hidden",
            boxShadow: "var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06))",
          }}
        >
          {employees.map((emp, i) => (
            <Link
              key={emp.id}
              href={`/dashboard/employees/${emp.id}`}
              style={{
                textDecoration: "none",
                color: "inherit",
                display: "block",
              }}
            >
              <div
                style={{
                  padding: "12px 16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderBottom:
                    i < employees.length - 1
                      ? "1px solid var(--border, #e5e5e5)"
                      : "none",
                  transition: "background 0.12s ease",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background =
                    "var(--bg-secondary, #f5f5f5)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background =
                    "transparent";
                }}
              >
                {/* Left: Avatar + Info */}
                <div
                  style={{ display: "flex", alignItems: "center", gap: 12 }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "var(--radius-md, 8px)",
                      background: "var(--bg-secondary, #f5f5f5)",
                      border: "1px solid var(--border, #e5e5e5)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 18,
                      flexShrink: 0,
                    }}
                  >
                    {emp.emoji || "A"}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 500,
                        fontSize: 14,
                        color: "var(--text, #0a0a0a)",
                        letterSpacing: "-0.01em",
                        lineHeight: 1.3,
                      }}
                    >
                      {emp.name}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--text-secondary, #525252)",
                        lineHeight: 1.3,
                        marginTop: 1,
                      }}
                    >
                      {emp.jobTitle}
                    </div>
                  </div>
                </div>

                {/* Right: Chat + Status + Chevron */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexShrink: 0,
                  }}
                >
                  {emp.status === "active" && (
                    <Link
                      href={`/dashboard/employees/${emp.id}/chat`}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 32,
                        height: 32,
                        borderRadius: "var(--radius-sm, 6px)",
                        background: "rgba(37, 99, 235, 0.06)",
                        border: "1px solid rgba(37, 99, 235, 0.12)",
                        color: "var(--blue, #2563eb)",
                        transition: "all 0.12s ease",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLAnchorElement).style.background =
                          "rgba(37, 99, 235, 0.1)";
                        (e.currentTarget as HTMLAnchorElement).style.borderColor =
                          "rgba(37, 99, 235, 0.2)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLAnchorElement).style.background =
                          "rgba(37, 99, 235, 0.06)";
                        (e.currentTarget as HTMLAnchorElement).style.borderColor =
                          "rgba(37, 99, 235, 0.12)";
                      }}
                    >
                      <MessageCircle size={14} />
                    </Link>
                  )}
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      height: 24,
                      padding: "0 8px",
                      fontSize: 12,
                      fontWeight: 500,
                      borderRadius: "var(--radius-sm, 6px)",
                      textTransform: "capitalize" as const,
                      ...(emp.status === "active"
                        ? {
                            color: "var(--green, #16a34a)",
                            background: "rgba(22, 163, 74, 0.06)",
                            border: "1px solid rgba(22, 163, 74, 0.14)",
                          }
                        : emp.status === "provisioning"
                          ? {
                              color: "#d97706",
                              background: "rgba(217, 119, 6, 0.06)",
                              border: "1px solid rgba(217, 119, 6, 0.14)",
                            }
                          : {
                              color: "var(--text-tertiary, #a3a3a3)",
                              background: "var(--bg-secondary, #f5f5f5)",
                              border: "1px solid var(--border, #e5e5e5)",
                            }),
                    }}
                  >
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: "currentColor",
                        flexShrink: 0,
                      }}
                    />
                    {emp.status}
                  </span>
                  <ChevronRight
                    size={15}
                    strokeWidth={1.5}
                    style={{ color: "var(--text-tertiary, #a3a3a3)" }}
                  />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
