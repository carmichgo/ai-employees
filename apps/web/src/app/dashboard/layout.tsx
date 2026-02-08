"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { LayoutDashboard, Users, UserPlus, Settings, LogOut, ChevronRight } from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/employees", label: "Employees", icon: Users },
  { href: "/dashboard/hire", label: "Hire New", icon: UserPlus },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
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
          background: "var(--bg-elevated)",
          borderRight: "1px solid var(--border)",
          padding: "20px 0",
          display: "flex",
          flexDirection: "column",
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 50,
        }}
      >
        <div style={{ padding: "0 20px", marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "linear-gradient(135deg, #5D79DF, #A94BD2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              A
            </div>
            <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: "-0.02em" }}>
              AI Employees
            </span>
          </div>
          {company && (
            <div
              style={{
                fontSize: 12,
                color: "var(--text-tertiary)",
                padding: "8px 12px",
                background: "rgba(255,255,255,0.03)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
              }}
            >
              {company.name}
            </div>
          )}
        </div>

        <nav style={{ flex: 1, padding: "0 8px" }}>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  margin: "2px 0",
                  color: isActive ? "var(--text)" : "var(--text-secondary)",
                  textDecoration: "none",
                  fontSize: 14,
                  fontWeight: isActive ? 500 : 400,
                  background: isActive ? "rgba(255,255,255,0.06)" : "transparent",
                  borderRadius: "var(--radius-sm)",
                  transition: "all 0.15s",
                }}
              >
                <Icon size={16} strokeWidth={isActive ? 2 : 1.5} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ padding: "0 8px" }}>
          <button
            onClick={() => {
              api.clearToken();
              router.push("/login");
            }}
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 13,
              color: "var(--text-tertiary)",
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "all 0.15s",
            }}
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main
        style={{
          flex: 1,
          marginLeft: 240,
          padding: "32px 40px",
          minHeight: "100vh",
        }}
      >
        {children}
      </main>
    </div>
  );
}
