"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await api.forgotPassword(email);
      setSubmitted(true);
      if (res.resetLink) {
        setResetLink(res.resetLink);
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "var(--bg)",
      }}
    >
      <div className="animate-scale-in" style={{ maxWidth: 400, width: "100%" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: "var(--text)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 15,
              fontWeight: 700,
              color: "var(--bg)",
              letterSpacing: "-0.02em",
              marginBottom: 20,
            }}
          >
            AI
          </div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-0.025em",
              color: "var(--text)",
              marginBottom: 6,
              lineHeight: 1.2,
            }}
          >
            Reset your password
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: 0 }}>
            Enter your email and we&apos;ll send you a reset link
          </p>
        </div>

        {/* Form Card */}
        <div
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: 28,
            boxShadow: "var(--shadow-md)",
          }}
        >
          {error && (
            <div
              style={{
                background: "var(--red-muted)",
                borderRadius: "var(--radius-sm)",
                padding: "10px 14px",
                marginBottom: 20,
                color: "var(--red)",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          {submitted ? (
            <div>
              <div
                style={{
                  background: "var(--green-muted, rgba(34,197,94,0.1))",
                  borderRadius: "var(--radius-sm)",
                  padding: "10px 14px",
                  marginBottom: 16,
                  color: "var(--green, #22c55e)",
                  fontSize: 13,
                }}
              >
                If an account exists with that email, a password reset link has been generated.
              </div>
              {resetLink && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
                    Use this link to reset your password:
                  </p>
                  <Link
                    href={resetLink}
                    style={{
                      fontSize: 13,
                      color: "var(--blue)",
                      wordBreak: "break-all",
                      textDecoration: "none",
                      fontWeight: 500,
                    }}
                  >
                    Click here to reset your password
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label className="input-label">Email</label>
                <input
                  className="input"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={loading}
                style={{ width: "100%", marginTop: 4, height: 36 }}
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
            </form>
          )}
        </div>

        {/* Footer link */}
        <p style={{
          textAlign: "center",
          marginTop: 20,
          fontSize: 13,
          color: "var(--text-secondary)",
        }}>
          Remember your password?{" "}
          <Link
            href="/login"
            style={{
              color: "var(--blue)",
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
