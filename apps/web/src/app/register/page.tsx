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
        position: "relative",
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: "absolute",
          top: "25%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 500,
          height: 300,
          background: "radial-gradient(ellipse, rgba(169, 75, 210, 0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div className="animate-scale-in" style={{ maxWidth: 420, width: "100%", position: "relative" }}>
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
          <h1 className="heading-1" style={{ marginBottom: 8 }}>Create your account</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>
            Set up your company and start hiring AI employees
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
              <label className="input-label">Company Name</label>
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
              <label className="input-label">Company URL</label>
              <div style={{ display: "flex", alignItems: "center" }}>
                <input
                  className="input"
                  style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRight: "none" }}
                  placeholder="acme"
                  value={form.companySlug}
                  onChange={(e) => setForm({ ...form, companySlug: e.target.value })}
                  required
                />
                <span
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderLeft: "none",
                    borderRadius: "0 var(--radius-md) var(--radius-md) 0",
                    padding: "0 14px",
                    height: 48,
                    display: "flex",
                    alignItems: "center",
                    color: "var(--text-tertiary)",
                    fontSize: 13,
                    whiteSpace: "nowrap",
                  }}
                >
                  .aiemployees.com
                </span>
              </div>
            </div>

            <div>
              <label className="input-label">Your Name</label>
              <input
                className="input"
                placeholder="Jane Smith"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="input-label">Email</label>
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
              <label className="input-label">Password</label>
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
              style={{ marginTop: 4 }}
            >
              {loading ? "Creating Account..." : "Create Account"}
            </button>
          </form>
        </div>

        <p style={{
          textAlign: "center",
          marginTop: 24,
          fontSize: 14,
          color: "var(--text-secondary)",
        }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "var(--text)", fontWeight: 500, textDecoration: "none" }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
