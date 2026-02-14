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
        background: "var(--bg)",
      }}
    >
      <div className="animate-scale-in" style={{ maxWidth: 420, width: "100%" }}>
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
            Create your account
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: 0 }}>
            Set up your company and start hiring AI employees
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

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
                  style={{
                    borderTopRightRadius: 0,
                    borderBottomRightRadius: 0,
                    borderRight: "none",
                  }}
                  placeholder="acme"
                  value={form.companySlug}
                  onChange={(e) => setForm({ ...form, companySlug: e.target.value })}
                  required
                />
                <span
                  style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border)",
                    borderLeft: "none",
                    borderRadius: "0 var(--radius-md) var(--radius-md) 0",
                    padding: "0 12px",
                    height: 36,
                    display: "flex",
                    alignItems: "center",
                    color: "var(--text-tertiary)",
                    fontSize: 12,
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
              style={{ width: "100%", marginTop: 4, height: 36 }}
            >
              {loading ? "Creating Account..." : "Create Account"}
            </button>
          </form>
        </div>

        {/* Footer link */}
        <p style={{
          textAlign: "center",
          marginTop: 20,
          fontSize: 13,
          color: "var(--text-secondary)",
        }}>
          Already have an account?{" "}
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
