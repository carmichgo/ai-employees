"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listEmployees().then((res) => {
      setEmployees(res.employees);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div style={{ color: "var(--text-muted)", padding: 40 }}>Loading...</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>Employees</h1>
          <p style={{ color: "var(--text-secondary)", marginTop: 4 }}>
            {employees.length} team member{employees.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link href="/dashboard/hire" className="btn-primary" style={{ textDecoration: "none" }}>
          + Hire Employee
        </Link>
      </div>

      {employees.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No employees yet</h3>
          <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>
            Hire your first AI employee to get started
          </p>
          <Link href="/dashboard/hire" className="btn-primary" style={{ textDecoration: "none" }}>
            Hire Your First Employee
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {employees.map((emp) => (
            <Link
              key={emp.id}
              href={`/dashboard/employees/${emp.id}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div
                className="card"
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
                      background: "var(--bg-tertiary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 20,
                    }}
                  >
                    {emp.emoji || "🤖"}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{emp.name}</div>
                    <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                      {emp.jobTitle}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className={`status-dot status-${emp.status}`} />
                    <span
                      style={{
                        fontSize: 13,
                        color: "var(--text-secondary)",
                        textTransform: "capitalize",
                      }}
                    >
                      {emp.status}
                    </span>
                  </div>
                  <span style={{ color: "var(--text-muted)", fontSize: 18 }}>→</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
