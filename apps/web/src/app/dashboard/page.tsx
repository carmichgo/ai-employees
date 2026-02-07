"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

export default function DashboardOverview() {
  const [data, setData] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);

  useEffect(() => {
    api.getDashboard().then(setData);
    api.listEmployees().then((res) => setEmployees(res.employees));
  }, []);

  if (!data) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "50vh" }}>
        <div style={{ color: "var(--text-muted)" }}>Loading...</div>
      </div>
    );
  }

  const stats = [
    { label: "Total Employees", value: data.employees.total, color: "var(--text-primary)" },
    { label: "Active", value: data.employees.active, color: "var(--success)" },
    { label: "Paused", value: data.employees.paused, color: "var(--warning)" },
    { label: "Errors", value: data.employees.error, color: "var(--error)" },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>Dashboard</h1>
          <p style={{ color: "var(--text-secondary)", marginTop: 4 }}>
            Manage your AI workforce
          </p>
        </div>
        <Link href="/dashboard/hire" className="btn-primary" style={{ textDecoration: "none" }}>
          + Hire Employee
        </Link>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
        {stats.map((stat) => (
          <div key={stat.label} className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
              {stat.label}
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, color: stat.color }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Employee list */}
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Your Team</h2>

      {employees.length === 0 ? (
        <div
          className="card"
          style={{
            padding: 48,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            No employees yet
          </h3>
          <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>
            Hire your first AI employee to get started
          </p>
          <Link href="/dashboard/hire" className="btn-primary" style={{ textDecoration: "none" }}>
            Hire Your First Employee
          </Link>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {employees.map((emp) => (
            <Link
              key={emp.id}
              href={`/dashboard/employees/${emp.id}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      background: "var(--bg-tertiary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 22,
                    }}
                  >
                    {emp.emoji || "🤖"}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{emp.name}</div>
                    <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                      {emp.jobTitle}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className={`status-dot status-${emp.status}`} />
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      textTransform: "capitalize",
                    }}
                  >
                    {emp.status}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
