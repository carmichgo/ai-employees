"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  ListTodo,
  Settings,
  LogOut,
  ChevronDown,
  MessageCircle,
  Server,
  Link2,
  Menu,
  X,
} from "lucide-react";

const NAV_SECTIONS = [
  {
    label: "Configure",
    items: [
      { href: "/dashboard/employees", label: "Employees", icon: Users },
      { href: "/dashboard/hire", label: "Hire Employee", icon: UserPlus },
      { href: "/dashboard/tasks", label: "Tasks", icon: ListTodo },
    ],
  },
  {
    label: "Monitor",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/dashboard/settings", label: "Settings", icon: Settings },
    ],
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [company, setCompany] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const token = api.getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    api
      .me()
      .then((data) => {
        setCompany(data.company);
        setUser(data.user);
      })
      .catch(() => {
        api.clearToken();
        router.push("/login");
      });
  }, [router]);

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <style>{`
        @media (max-width: 768px) {
          .dashboard-sidebar {
            transform: translateX(-100%);
            transition: transform 0.25s ease;
          }
          .dashboard-sidebar.open {
            transform: translateX(0);
          }
          .dashboard-main {
            margin-left: 0 !important;
          }
          .dashboard-main-inner {
            padding: 16px !important;
          }
          .mobile-header {
            display: flex !important;
          }
          .sidebar-overlay {
            display: block !important;
          }
        }
        @media (min-width: 769px) {
          .mobile-header {
            display: none !important;
          }
          .sidebar-overlay {
            display: none !important;
          }
        }
      `}</style>

      {/* Mobile header */}
      <div
        className="mobile-header"
        style={{
          display: "none",
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          height: 52,
          padding: "0 16px",
          alignItems: "center",
          justifyContent: "space-between",
          background: "var(--bg-sidebar)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              background: "var(--text)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              color: "var(--bg)",
            }}
          >
            AI
          </div>
          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>
            AI Employees
          </span>
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            background: "none",
            border: "none",
            padding: 8,
            cursor: "pointer",
            color: "var(--text)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Sidebar overlay for mobile */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          style={{
            display: "none",
            position: "fixed",
            inset: 0,
            zIndex: 45,
            background: "rgba(0,0,0,0.3)",
          }}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`dashboard-sidebar ${sidebarOpen ? "open" : ""}`}
        style={{
          width: 220,
          background: "var(--bg-sidebar)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 50,
        }}
      >
        {/* Logo + Company */}
        <div style={{ padding: "16px 16px 8px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 8px",
              borderRadius: "var(--radius-md)",
              cursor: "default",
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: "var(--text)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                color: "var(--bg)",
                flexShrink: 0,
              }}
            >
              AI
            </div>
            <span
              style={{
                fontWeight: 600,
                fontSize: 13,
                letterSpacing: "-0.01em",
                color: "var(--text)",
              }}
            >
              AI Employees
            </span>
          </div>
        </div>

        {/* Workspace selector */}
        {company && (
          <div style={{ padding: "0 16px", marginBottom: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 8px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                background: "var(--bg)",
                fontSize: 12,
                color: "var(--text-secondary)",
                cursor: "default",
              }}
            >
              <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {company.name}
              </span>
              <ChevronDown size={12} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav style={{ flex: 1, padding: "4px 8px", overflow: "auto" }}>
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: "var(--text-tertiary)",
                  padding: "0 8px",
                  marginBottom: 4,
                  letterSpacing: "0.02em",
                }}
              >
                {section.label}
              </div>
              {section.items.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 8px",
                      margin: "1px 0",
                      color: active ? "var(--text)" : "var(--text-secondary)",
                      textDecoration: "none",
                      fontSize: 13,
                      fontWeight: active ? 500 : 400,
                      background: active ? "var(--bg)" : "transparent",
                      borderRadius: "var(--radius-sm)",
                      transition: "all 0.1s ease",
                      boxShadow: active ? "var(--shadow-xs)" : "none",
                    }}
                  >
                    <Icon size={15} strokeWidth={active ? 2 : 1.5} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom */}
        <div style={{ padding: "8px", borderTop: "1px solid var(--border)" }}>
          {user && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                marginBottom: 4,
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  flexShrink: 0,
                }}
              >
                {user.name?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <div style={{ overflow: "hidden" }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {user.name}
                </div>
              </div>
            </div>
          )}
          <button
            onClick={() => {
              api.clearToken();
              router.push("/login");
            }}
            style={{
              width: "100%",
              padding: "6px 8px",
              fontSize: 12,
              color: "var(--text-tertiary)",
              background: "none",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.1s ease",
            }}
          >
            <LogOut size={13} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main
        className="dashboard-main"
        style={{
          flex: 1,
          marginLeft: 220,
          minHeight: "100vh",
        }}
      >
        <div
          className="dashboard-main-inner"
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "24px 32px",
            paddingTop: undefined,
          }}
        >
          <style>{`
            @media (max-width: 768px) {
              .dashboard-main-inner {
                padding-top: 68px !important;
              }
            }
          `}</style>
          {children}
        </div>
      </main>
    </div>
  );
}
