"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Plus, Users, Zap, AlertTriangle, Pause } from "lucide-react";

export default function DashboardOverview() {
  const [data, setData] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);

  useEffect(() => {
    api.getDashboard().then(setData);
    api.listEmployees().then((res) => setEmployees(res.employees));
  }, []);

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

  const stats = [
    { label: "Total", value: data.employees.total, icon: Users, color: "var(--text)" },
    { label: "Active", value: data.employees.active, icon: Zap, color: "var(--green)" },
    { label: "Paused", value: data.employees.paused, icon: Pause, color: "var(--orange)" },
    { label: "Errors", value: data.employees.error, icon: AlertTriangle, color: "var(--red)" },
  ];

  return (
    <div className="animate-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <h1 className="heading-1" style={{ marginBottom: 4 }}>Dashboard</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            Manage your AI workforce
          </p>
        </div>
        <Link href="/dashboard/hire" className="btn-primary" style={{ textDecoration: "none", gap: 6 }}>
          <Plus size={16} />
          Hire Employee
        </Link>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 40 }}>
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="card" style={{ padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span className="label" style={{ margin: 0 }}>{stat.label}</span>
                <Icon size={14} style={{ color: stat.color, opacity: 0.6 }} />
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: stat.color, letterSpacing: "-0.02em" }}>
                {stat.value}
              </div>
            </div>
          );
        })}
      </div>

      {/* Employee list */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 className="heading-2">Your Team</h2>
        {employees.length > 0 && (
          <Link
            href="/dashboard/employees"
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              textDecoration: "none",
            }}
          >
            View all
          </Link>
        )}
      </div>

      {employees.length === 0 ? (
        <div
          className="card"
          style={{
            padding: "64px 40px",
            textAlign: "center",
            borderStyle: "dashed",
          }}
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
              fontSize: 28,
              marginBottom: 20,
            }}
          >
            <Users size={28} strokeWidth={1} style={{ color: "var(--text-tertiary)" }} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            No employees yet
          </h3>
          <p style={{ color: "var(--text-secondary)", marginBottom: 24, fontSize: 14, maxWidth: 320, margin: "0 auto 24px" }}>
            Hire your first AI employee to get started building your workforce
          </p>
          <Link href="/dashboard/hire" className="btn-primary" style={{ textDecoration: "none", gap: 6 }}>
            <Plus size={16} />
            Hire Your First Employee
          </Link>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {employees.map((emp, i) => (
            <Link
              key={emp.id}
              href={`/dashboard/employees/${emp.id}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div
                className={`card card-interactive animate-in animate-in-delay-${(i % 4) + 1}`}
                style={{ padding: 20 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 22,
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
                <div className={`status-badge status-${emp.status}`}>
                  <span className="status-dot" />
                  <span style={{ textTransform: "capitalize" }}>{emp.status}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
