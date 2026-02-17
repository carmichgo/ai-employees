"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  CreditCard,
  Receipt,
  Users,
  ExternalLink,
  Download,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";

const TIER_LABELS: Record<string, string> = {
  junior: "Junior",
  senior: "Senior",
  expert: "Expert",
};

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: "#f0fdf4", text: "#16a34a", label: "Active" },
  trialing: { bg: "#eff6ff", text: "#2563eb", label: "Trial" },
  past_due: { bg: "#fff7ed", text: "#d97706", label: "Past Due" },
  unpaid: { bg: "#fef2f2", text: "#dc2626", label: "Unpaid" },
  canceled: { bg: "var(--bg-secondary)", text: "var(--text-tertiary)", label: "Canceled" },
  incomplete: { bg: "#fff7ed", text: "#d97706", label: "Incomplete" },
};

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function BillingPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    api
      .getBillingOverview()
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleManageBilling = async () => {
    setPortalLoading(true);
    try {
      const { url } = await api.createPortalSession();
      window.location.href = url;
    } catch (err: any) {
      alert(err.message || "Failed to open billing portal");
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <div
          style={{
            width: 20,
            height: 20,
            border: "2px solid var(--border)",
            borderTopColor: "var(--text-tertiary)",
            borderRadius: "50%",
            animation: "spin 0.7s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: "center", paddingTop: 120 }}>
        <p style={{ color: "var(--red)", fontSize: 14 }}>{error}</p>
      </div>
    );
  }

  const sub = data?.subscription;
  const emps = data?.employees || [];
  const activeEmps = emps.filter((e: any) => e.status !== "terminated");
  const paymentMethods = data?.paymentMethods || [];
  const invoices = data?.invoices || [];
  const monthlyTotal = data?.monthlyTotal || 0;

  const subStatus = sub ? STATUS_BADGE[sub.status] || STATUS_BADGE.active : null;

  /* ---- shared styles ---- */
  const card: React.CSSProperties = {
    background: "#fff",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    overflow: "hidden",
  };

  const cardHeader: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    borderBottom: "1px solid var(--border)",
  };

  const cardTitle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text)",
    letterSpacing: "-0.01em",
  };

  const btnPrimary: React.CSSProperties = {
    height: 32,
    padding: "0 14px",
    fontSize: 12,
    fontWeight: 500,
    background: "var(--text)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    transition: "opacity 0.15s ease",
  };

  const btnSecondary: React.CSSProperties = {
    height: 32,
    padding: "0 14px",
    fontSize: 12,
    fontWeight: 500,
    background: "#fff",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    transition: "all 0.15s ease",
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--text)",
            letterSpacing: "-0.02em",
            marginBottom: 4,
          }}>
            Billing
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0 }}>
            Manage your subscription, payment methods, and invoices
          </p>
        </div>
        {sub && (
          <button
            onClick={handleManageBilling}
            disabled={portalLoading}
            style={{ ...btnPrimary, ...(portalLoading ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
          >
            <ExternalLink size={13} />
            {portalLoading ? "Loading..." : "Manage in Stripe"}
          </button>
        )}
      </div>

      {/* Summary cards row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        {/* Monthly spend */}
        <div style={{
          ...card,
          padding: "20px",
          display: "flex",
          flexDirection: "column",
        }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-tertiary)", marginBottom: 8 }}>
            Monthly Spend
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1 }}>
            ${monthlyTotal}
            <span style={{ fontSize: 14, fontWeight: 400, color: "var(--text-tertiary)" }}>/mo</span>
          </div>
        </div>

        {/* Active employees */}
        <div style={{
          ...card,
          padding: "20px",
          display: "flex",
          flexDirection: "column",
        }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-tertiary)", marginBottom: 8 }}>
            Active Employees
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1 }}>
            {activeEmps.length}
          </div>
        </div>

        {/* Subscription status */}
        <div style={{
          ...card,
          padding: "20px",
          display: "flex",
          flexDirection: "column",
        }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-tertiary)", marginBottom: 8 }}>
            Subscription
          </div>
          {sub ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 13,
                fontWeight: 600,
                color: subStatus?.text,
                background: subStatus?.bg,
                padding: "4px 10px",
                borderRadius: 99,
              }}>
                {sub.status === "active" && <CheckCircle2 size={12} />}
                {sub.status === "past_due" && <AlertTriangle size={12} />}
                {sub.status === "canceled" && <XCircle size={12} />}
                {subStatus?.label}
              </span>
            </div>
          ) : (
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-tertiary)" }}>
              No subscription
            </div>
          )}
        </div>
      </div>

      {/* Past due warning */}
      {sub && (sub.status === "past_due" || sub.status === "unpaid") && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 16px",
          background: "#fff7ed",
          border: "1px solid rgba(217,119,6,0.2)",
          borderRadius: "var(--radius-md)",
          marginBottom: 20,
          fontSize: 13,
          color: "#92400e",
        }}>
          <AlertTriangle size={16} style={{ color: "#d97706", flexShrink: 0 }} />
          <div>
            <strong>Payment past due.</strong> Your employees have been paused. Please update your payment method to resume service.
          </div>
          <button onClick={handleManageBilling} style={{ ...btnSecondary, marginLeft: "auto", flexShrink: 0 }}>
            Update Payment
          </button>
        </div>
      )}

      {/* Subscription details */}
      {sub && (
        <div style={{ ...card, marginBottom: 20 }}>
          <div style={cardHeader}>
            <div style={cardTitle}>
              <CreditCard size={15} style={{ color: "var(--text-tertiary)" }} />
              Subscription Details
            </div>
            {sub.cancelAtPeriodEnd && (
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#d97706",
                background: "#fff7ed",
                padding: "3px 8px",
                borderRadius: "var(--radius-sm)",
              }}>
                Cancels {formatDate(sub.currentPeriodEnd)}
              </span>
            )}
          </div>
          <div style={{ padding: "16px 20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Current Period
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                  {formatDate(sub.currentPeriodStart)} — {formatDate(sub.currentPeriodEnd)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Next Invoice
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                  {sub.cancelAtPeriodEnd ? "None (canceling)" : formatDate(sub.currentPeriodEnd)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Monthly Total
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                  ${monthlyTotal}/mo
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment methods */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={cardHeader}>
          <div style={cardTitle}>
            <CreditCard size={15} style={{ color: "var(--text-tertiary)" }} />
            Payment Methods
          </div>
          {sub && (
            <button onClick={handleManageBilling} style={btnSecondary}>
              {paymentMethods.length > 0 ? "Manage" : "Add Payment Method"}
            </button>
          )}
        </div>
        <div style={{ padding: paymentMethods.length > 0 ? 0 : "24px 20px" }}>
          {paymentMethods.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
              {sub ? "No payment methods on file. Click Manage to add one." : "Hire an employee to set up billing."}
            </div>
          ) : (
            <div>
              {paymentMethods.map((pm: any, i: number) => (
                <div
                  key={pm.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 20px",
                    borderBottom: i < paymentMethods.length - 1 ? "1px solid var(--border)" : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 40,
                      height: 28,
                      borderRadius: 4,
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--text-secondary)",
                      textTransform: "uppercase",
                    }}>
                      {pm.brand === "visa" ? "VISA" :
                       pm.brand === "mastercard" ? "MC" :
                       pm.brand === "amex" ? "AMEX" :
                       pm.brand.slice(0, 4).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                        <span style={{ textTransform: "capitalize" }}>{pm.brand}</span> ending in {pm.last4}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                        Expires {pm.expMonth}/{pm.expYear}
                      </div>
                    </div>
                  </div>
                  {pm.isDefault && (
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#16a34a",
                      background: "#f0fdf4",
                      padding: "3px 8px",
                      borderRadius: "var(--radius-sm)",
                    }}>
                      Default
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Employee costs */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={cardHeader}>
          <div style={cardTitle}>
            <Users size={15} style={{ color: "var(--text-tertiary)" }} />
            Employee Costs
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
            ${monthlyTotal}/mo
          </div>
        </div>
        <div style={{ padding: activeEmps.length > 0 ? 0 : "24px 20px" }}>
          {activeEmps.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
              No active employees
            </div>
          ) : (
            <div>
              {/* Table header */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 100px 100px 100px",
                padding: "8px 20px",
                borderBottom: "1px solid var(--border)",
                background: "var(--bg-secondary)",
              }}>
                {["Employee", "Tier", "Status", "Cost"].map((h) => (
                  <div key={h} style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--text-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    textAlign: h === "Cost" ? "right" : "left",
                  }}>
                    {h}
                  </div>
                ))}
              </div>
              {/* Rows */}
              {activeEmps.map((emp: any, i: number) => {
                const empStatus: Record<string, { color: string }> = {
                  active: { color: "#16a34a" },
                  paused: { color: "#d97706" },
                  provisioning: { color: "#2563eb" },
                  error: { color: "#dc2626" },
                };
                const sc = empStatus[emp.status] || { color: "var(--text-tertiary)" };
                return (
                  <div
                    key={emp.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 100px 100px 100px",
                      padding: "12px 20px",
                      alignItems: "center",
                      borderBottom: i < activeEmps.length - 1 ? "1px solid var(--border)" : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
                      <span style={{ fontSize: 18, flexShrink: 0 }}>{emp.emoji || "A"}</span>
                      <div style={{ overflow: "hidden" }}>
                        <div style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: "var(--text)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}>
                          {emp.name}
                        </div>
                        <div style={{
                          fontSize: 12,
                          color: "var(--text-tertiary)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}>
                          {emp.jobTitle}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>
                      {TIER_LABELS[emp.tier] || emp.tier}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: sc.color,
                        flexShrink: 0,
                      }} />
                      <span style={{ fontSize: 12, fontWeight: 500, color: sc.color, textTransform: "capitalize" }}>
                        {emp.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", textAlign: "right" }}>
                      {emp.priceMonthly ? `$${emp.priceMonthly}/mo` : "—"}
                    </div>
                  </div>
                );
              })}
              {/* Total row */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 100px 100px 100px",
                padding: "12px 20px",
                background: "var(--bg-secondary)",
                borderTop: "1px solid var(--border)",
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                  Total ({activeEmps.length} employee{activeEmps.length !== 1 ? "s" : ""})
                </div>
                <div />
                <div />
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", textAlign: "right" }}>
                  ${monthlyTotal}/mo
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Invoices */}
      <div style={card}>
        <div style={cardHeader}>
          <div style={cardTitle}>
            <Receipt size={15} style={{ color: "var(--text-tertiary)" }} />
            Invoices
          </div>
        </div>
        <div style={{ padding: invoices.length > 0 ? 0 : "24px 20px" }}>
          {invoices.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
              No invoices yet
            </div>
          ) : (
            <div>
              {/* Table header */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "140px 1fr 100px 100px 80px",
                padding: "8px 20px",
                borderBottom: "1px solid var(--border)",
                background: "var(--bg-secondary)",
              }}>
                {["Invoice", "Date", "Amount", "Status", ""].map((h) => (
                  <div key={h || "actions"} style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--text-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    textAlign: h === "Amount" ? "right" : "left",
                  }}>
                    {h}
                  </div>
                ))}
              </div>
              {invoices.map((inv: any, i: number) => {
                const invStatus: Record<string, { bg: string; text: string; label: string }> = {
                  paid: { bg: "#f0fdf4", text: "#16a34a", label: "Paid" },
                  open: { bg: "#eff6ff", text: "#2563eb", label: "Open" },
                  draft: { bg: "var(--bg-secondary)", text: "var(--text-tertiary)", label: "Draft" },
                  void: { bg: "var(--bg-secondary)", text: "var(--text-tertiary)", label: "Void" },
                  uncollectible: { bg: "#fef2f2", text: "#dc2626", label: "Failed" },
                };
                const is = invStatus[inv.status] || invStatus.draft;
                return (
                  <div
                    key={inv.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "140px 1fr 100px 100px 80px",
                      padding: "12px 20px",
                      alignItems: "center",
                      borderBottom: i < invoices.length - 1 ? "1px solid var(--border)" : "none",
                    }}
                  >
                    <div style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--text)",
                      fontFamily: "'SF Mono', 'Fira Code', monospace",
                    }}>
                      {inv.number || "—"}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                      {formatDate(inv.created)}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", textAlign: "right" }}>
                      {formatCurrency(inv.amountDue)}
                    </div>
                    <div>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: is.text,
                        background: is.bg,
                        padding: "3px 8px",
                        borderRadius: "var(--radius-sm)",
                      }}>
                        {is.label}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      {inv.hostedUrl && (
                        <a
                          href={inv.hostedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--border)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "var(--text-tertiary)",
                            textDecoration: "none",
                            background: "#fff",
                          }}
                          title="View invoice"
                        >
                          <ExternalLink size={12} />
                        </a>
                      )}
                      {inv.pdfUrl && (
                        <a
                          href={inv.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--border)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "var(--text-tertiary)",
                            textDecoration: "none",
                            background: "#fff",
                          }}
                          title="Download PDF"
                        >
                          <Download size={12} />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
