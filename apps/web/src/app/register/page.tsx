"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    companyName: "",
    companySlug: "",
    name: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api.register(form);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Registration failed");
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
      }}
    >
      <div className="card" style={{ padding: 40, maxWidth: 440, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>Create Your Company</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 8 }}>
            Set up your account and start hiring AI employees
          </p>
        </div>

        {error && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 20,
              color: "var(--error)",
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>
              Company Name
            </label>
            <input
              className="input"
              placeholder="Acme Inc"
              value={form.companyName}
              onChange={(e) => {
                const name = e.target.value;
                setForm({
                  ...form,
                  companyName: name,
                  companySlug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
                });
              }}
              required
            />
          </div>

          <div>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>
              Company URL
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
              <input
                className="input"
                style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                placeholder="acme"
                value={form.companySlug}
                onChange={(e) => setForm({ ...form, companySlug: e.target.value })}
                required
              />
              <span
                style={{
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--border)",
                  borderLeft: "none",
                  borderRadius: "0 8px 8px 0",
                  padding: "10px 14px",
                  color: "var(--text-muted)",
                  fontSize: 14,
                  whiteSpace: "nowrap",
                }}
              >
                .aiemployees.com
              </span>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>
              Your Name
            </label>
            <input
              className="input"
              placeholder="Jane Smith"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>
              Email
            </label>
            <input
              className="input"
              type="email"
              placeholder="jane@acme.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>

          <div>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>
              Password
            </label>
            <input
              className="input"
              type="password"
              placeholder="Min 8 characters"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={8}
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
            style={{ marginTop: 8, fontSize: 16, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Creating Account..." : "Create Account"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: 24, fontSize: 14, color: "var(--text-secondary)" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "var(--accent)" }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
