"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

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
    return <div style={{ color: "var(--text-muted)", padding: 40 }}>Loading...</div>;
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 32 }}>Settings</h1>

      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Company</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 14 }}>
          <div>
            <span style={{ color: "var(--text-muted)" }}>Name: </span>
            {company.name}
          </div>
          <div>
            <span style={{ color: "var(--text-muted)" }}>Slug: </span>
            {company.slug}
          </div>
          <div>
            <span style={{ color: "var(--text-muted)" }}>Plan: </span>
            <span style={{ textTransform: "capitalize" }}>{company.plan}</span>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)" }}>Max Employees: </span>
            {company.maxEmployees}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Account</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 14 }}>
          <div>
            <span style={{ color: "var(--text-muted)" }}>Name: </span>
            {user.name}
          </div>
          <div>
            <span style={{ color: "var(--text-muted)" }}>Email: </span>
            {user.email}
          </div>
          <div>
            <span style={{ color: "var(--text-muted)" }}>Role: </span>
            <span style={{ textTransform: "capitalize" }}>{user.role}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
