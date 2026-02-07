"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: "📊" },
  { href: "/dashboard/employees", label: "Employees", icon: "🤖" },
  { href: "/dashboard/hire", label: "Hire New", icon: "➕" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙️" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [company, setCompany] = useState<any>(null);

  useEffect(() => {
    const token = api.getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    api.me().then((data) => setCompany(data.company)).catch(() => {
      api.clearToken();
      router.push("/login");
    });
  }, [router]);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Sidebar */}
      <aside
        style={{
          width: 240,
          background: "var(--bg-secondary)",
          borderRight: "1px solid var(--border)",
          padding: "24px 0",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "0 20px", marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>🤖</span>
            <span style={{ fontWeight: 700, fontSize: 16 }}>AI Employees</span>
          </div>
          {company && (
            <div
              style={{
                marginTop: 12,
                fontSize: 13,
                color: "var(--text-secondary)",
                padding: "6px 10px",
                background: "var(--bg-tertiary)",
                borderRadius: 6,
              }}
            >
              {company.name}
            </div>
          )}
        </div>

        <nav style={{ flex: 1 }}>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 20px",
                  color: isActive ? "var(--accent)" : "var(--text-secondary)",
                  textDecoration: "none",
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 400,
                  background: isActive ? "rgba(99, 102, 241, 0.08)" : "transparent",
                  borderRight: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                  transition: "all 0.15s",
                }}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ padding: "0 20px" }}>
          <button
            onClick={() => {
              api.clearToken();
              router.push("/login");
            }}
            style={{
              width: "100%",
              padding: "8px 14px",
              fontSize: 13,
              color: "var(--text-muted)",
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, padding: 32, overflowY: "auto" }}>{children}</main>
    </div>
  );
}
