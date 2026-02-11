"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Plus, Users, ChevronRight, MessageCircle } from "lucide-react";

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listEmployees().then((res) => {
      setEmployees(res.employees);
      setLoading(false);
    }).catch((err) => {
      setError(err.message || "Failed to load employees");
      setLoading(false);
    });
  }, []);

  if (loading) {
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

  if (error) {
    return (
      <div className="animate-in" style={{ textAlign: "center", paddingTop: 80 }}>
        <p style={{ color: "var(--red)", marginBottom: 16 }}>{error}</p>
        <button
          className="btn-primary"
          onClick={() => {
            setLoading(true);
            setError(null);
            api.listEmployees().then((res) => {
              setEmployees(res.employees);
              setLoading(false);
            }).catch((err) => {
              setError(err.message || "Failed to load employees");
              setLoading(false);
            });
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="animate-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <h1 className="heading-1" style={{ marginBottom: 4 }}>Employees</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            {employees.length} team member{employees.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link href="/dashboard/hire" className="btn-primary" style={{ textDecoration: "none", gap: 6 }}>
          <Plus size={16} />
          Hire Employee
        </Link>
      </div>

      {employees.length === 0 ? (
        <div
          className="card"
          style={{ padding: "64px 40px", textAlign: "center", borderStyle: "dashed" }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "rgba(255,255,255,0.04)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 20,
            }}
          >
            <Users size={28} strokeWidth={1} style={{ color: "var(--text-tertiary)" }} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No employees yet</h3>
          <p style={{ color: "var(--text-secondary)", marginBottom: 24, fontSize: 14, maxWidth: 320, margin: "0 auto 24px" }}>
            Hire your first AI employee to get started
          </p>
          <Link href="/dashboard/hire" className="btn-primary" style={{ textDecoration: "none", gap: 6 }}>
            <Plus size={16} />
            Hire Your First Employee
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {employees.map((emp, i) => (
            <Link
              key={emp.id}
              href={`/dashboard/employees/${emp.id}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div
                className={`card card-interactive animate-in animate-in-delay-${(i % 4) + 1}`}
                style={{
                  padding: "16px 20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 20,
                    }}
                  >
                    {emp.emoji || "A"}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15, letterSpacing: "-0.01em" }}>
                      {emp.name}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                      {emp.jobTitle}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
                        borderRadius: 8,
                        background: "rgba(93, 121, 223, 0.1)",
                        border: "1px solid rgba(93, 121, 223, 0.2)",
                        color: "var(--blue)",
                        transition: "all 0.15s",
                      }}
                    >
                      <MessageCircle size={14} />
                    </Link>
                  )}
                  <div className={`status-badge status-${emp.status}`}>
                    <span className="status-dot" />
                    <span style={{ textTransform: "capitalize" }}>{emp.status}</span>
                  </div>
                  <ChevronRight size={16} style={{ color: "var(--text-tertiary)" }} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
