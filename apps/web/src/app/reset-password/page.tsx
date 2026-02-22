"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      await api.resetPassword(token, password);
      setSuccess(true);
      setTimeout(() => router.push("/login"), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div
        style={{
          background: "var(--red-muted)",
          borderRadius: "var(--radius-sm)",
          padding: "10px 14px",
          color: "var(--red)",
          fontSize: 13,
        }}
      >
        Invalid or missing reset token. Please request a new password reset.
      </div>
    );
  }

  return (
    <>
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

      {success ? (
        <div
          style={{
            background: "var(--green-muted, rgba(34,197,94,0.1))",
            borderRadius: "var(--radius-sm)",
            padding: "10px 14px",
            color: "var(--green, #22c55e)",
            fontSize: 13,
          }}
        >
          Password reset successfully! Redirecting to login...
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label className="input-label">New Password</label>
            <input
              className="input"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          <div>
            <label className="input-label">Confirm Password</label>
            <input
              className="input"
              type="password"
              placeholder="Repeat your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
            style={{ width: "100%", marginTop: 4, height: 36 }}
          >
            {loading ? "Resetting..." : "Reset Password"}
          </button>
        </form>
      )}
    </>
  );
}

export default function ResetPasswordPage() {
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
            Set new password
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: 0 }}>
            Choose a strong password for your account
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
          <Suspense fallback={<div style={{ color: "var(--text-secondary)", fontSize: 13 }}>Loading...</div>}>
            <ResetPasswordForm />
          </Suspense>
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
