"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api.login(email, password);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Login failed");
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
        position: "relative",
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: "absolute",
          top: "30%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 500,
          height: 300,
          background: "radial-gradient(ellipse, rgba(93, 121, 223, 0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div className="animate-scale-in" style={{ maxWidth: 400, width: "100%", position: "relative" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: "linear-gradient(135deg, #5D79DF, #A94BD2)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              marginBottom: 20,
            }}
          >
            A
          </div>
          <h1 className="heading-1" style={{ marginBottom: 8 }}>Welcome back</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>
            Sign in to manage your AI workforce
          </p>
        </div>

        <div
          className="card"
          style={{
            padding: 32,
            borderRadius: "var(--radius-xl)",
          }}
        >
          {error && (
            <div
              style={{
                background: "var(--red-muted)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
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

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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

            <div>
              <label className="input-label">Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
              style={{ marginTop: 4 }}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>

        <p style={{
          textAlign: "center",
          marginTop: 24,
          fontSize: 14,
          color: "var(--text-secondary)",
        }}>
          Don&apos;t have an account?{" "}
          <Link href="/register" style={{ color: "var(--text)", fontWeight: 500, textDecoration: "none" }}>
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
