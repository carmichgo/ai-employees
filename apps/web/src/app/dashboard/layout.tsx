"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
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
  Inbox,
  CreditCard,
  FolderOpen,
  Database,
  Blocks,
  Menu,
  X,
} from "lucide-react";

// ── Inbox notification helpers ──────────────────
const LAST_SEEN_KEY = "inbox_last_seen"; // JSON: Record<employeeId, ISO timestamp>

function getLastSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LAST_SEEN_KEY) || "{}");
  } catch {
    return {};
  }
}

function setLastSeenNow(employeeId: string) {
  const prev = getLastSeen();
  prev[employeeId] = new Date().toISOString();
  localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(prev));
}

const NAV_SECTIONS = [
  {
    label: "Configure",
    items: [
      { href: "/dashboard/employees", label: "Employees", icon: Users },
      { href: "/dashboard/hire", label: "Hire Employee", icon: UserPlus },
      { href: "/dashboard/inbox", label: "Inbox", icon: Inbox },
      { href: "/dashboard/tasks", label: "Tasks", icon: ListTodo },
      { href: "/dashboard/documents", label: "Documents", icon: FolderOpen },
      { href: "/dashboard/tables", label: "Bases", icon: Database },
      { href: "/dashboard/apps", label: "Apps", icon: Blocks },
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
      { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
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

  // Inbox notification state
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState<Array<{ id: number; name: string; message: string }>>([]);
  const toastIdRef = useRef(0);
  const knownLastMsgRef = useRef<Record<string, string>>({}); // employeeId → last message id

  // Request browser notification permission on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const sendBrowserNotification = useCallback((name: string, message: string) => {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      Notification.permission !== "granted" ||
      document.hasFocus()
    ) return;
    try {
      const n = new Notification(name, {
        body: message.slice(0, 200),
        icon: "/favicon.ico",
        tag: `inbox-${name}`, // dedup per employee
      });
      n.onclick = () => {
        window.focus();
        window.location.href = "/dashboard/inbox";
        n.close();
      };
    } catch {}
  }, []);

  const addToast = useCallback((name: string, message: string) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev.slice(-2), { id, name, message }]); // keep max 3
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
    sendBrowserNotification(name, message);
  }, [sendBrowserNotification]);

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

  // Poll for new inbox messages every 30s
  useEffect(() => {
    let cancelled = false;

    async function checkInbox() {
      try {
        const res = await api.listEmployees();
        const emps = (res.employees || []).filter(
          (e: any) => e.status !== "terminated" && e.dropletIp,
        );

        const lastSeen = getLastSeen();
        let newUnread = 0;

        await Promise.all(
          emps.map(async (emp: any) => {
            try {
              const historyRes = await api.getChatHistory(emp.id);
              const msgs = historyRes.messages || [];
              if (msgs.length === 0) return;

              // Find the last assistant message
              const lastAssistant = [...msgs].reverse().find((m: any) => m.role === "assistant");
              if (!lastAssistant) return;

              // Check if there are unread assistant messages
              const seenTs = lastSeen[emp.id];
              if (!seenTs || new Date(lastAssistant.createdAt) > new Date(seenTs)) {
                newUnread++;
              }

              // Show toast for brand-new messages (not on first load)
              const prevLastId = knownLastMsgRef.current[emp.id];
              if (prevLastId && lastAssistant.id !== prevLastId && lastAssistant.role === "assistant") {
                // Only toast if we're not already on the inbox page viewing this employee
                if (!pathname.startsWith("/dashboard/inbox") && !cancelled) {
                  addToast(emp.name, lastAssistant.content?.slice(0, 100) || "New message");
                }
              }
              knownLastMsgRef.current[emp.id] = lastAssistant.id;
            } catch {
              // Skip failed employee
            }
          }),
        );

        if (!cancelled) setUnreadCount(newUnread);
      } catch {
        // Silently fail
      }
    }

    checkInbox();
    const interval = setInterval(checkInbox, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pathname, addToast]);

  // Mark messages as seen when visiting inbox
  useEffect(() => {
    if (pathname.startsWith("/dashboard/inbox")) {
      // Mark all as seen after a short delay (let the page load)
      const timeout = setTimeout(async () => {
        try {
          const res = await api.listEmployees();
          const emps = (res.employees || []).filter(
            (e: any) => e.status !== "terminated" && e.dropletIp,
          );
          for (const emp of emps) {
            setLastSeenNow(emp.id);
          }
          setUnreadCount(0);
        } catch {}
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [pathname]);

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  const isFullWidth = pathname.startsWith("/dashboard/inbox") || pathname.startsWith("/dashboard/tables");

  return (
    <div style={{ display: "flex", minHeight: "100vh", position: "relative", isolation: "isolate" }}>
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
            padding-top: 68px !important;
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
            B
          </div>
          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>
            Blitzer
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
              B
            </div>
            <span
              style={{
                fontWeight: 600,
                fontSize: 13,
                letterSpacing: "-0.01em",
                color: "var(--text)",
              }}
            >
              Blitzer
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
                const isInbox = item.href === "/dashboard/inbox";
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
                    {isInbox && unreadCount > 0 && (
                      <span
                        style={{
                          marginLeft: "auto",
                          background: "#ef4444",
                          color: "#fff",
                          fontSize: 10,
                          fontWeight: 600,
                          borderRadius: 9,
                          minWidth: 18,
                          height: 18,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "0 5px",
                          lineHeight: 1,
                        }}
                      >
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
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
          position: "relative",
          zIndex: 1,
          overflow: "hidden",
        }}
      >
        <div
          className="dashboard-main-inner"
          style={
            isFullWidth
              ? { padding: "24px 32px", height: "100vh", overflow: "hidden" }
              : { maxWidth: 1100, margin: "0 auto", padding: "24px 32px" }
          }
        >
          {children}
        </div>
      </main>

      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {toasts.map((toast) => (
            <Link
              key={toast.id}
              href="/dashboard/inbox"
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "12px 16px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                maxWidth: 320,
                textDecoration: "none",
                color: "var(--text)",
                animation: "slideIn 0.3s ease",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: "var(--text)" }}>
                {toast.name}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {toast.message}
              </div>
            </Link>
          ))}
          <style>{`@keyframes slideIn { from { transform: translateY(20px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }`}</style>
        </div>
      )}
    </div>
  );
}
