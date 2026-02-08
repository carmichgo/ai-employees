"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Building2, User } from "lucide-react";

export default function SettingsPage() {
  const [company, setCompany] = useState<any>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    api.me().then((data) => {
      setCompany(data.company);
      setUser(data.user);
    });
  }, []);

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
