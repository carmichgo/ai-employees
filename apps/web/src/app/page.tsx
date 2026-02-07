"use client";

import Link from "next/link";

export default function LandingPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
        background:
          "radial-gradient(ellipse at top, rgba(99, 102, 241, 0.08) 0%, transparent 50%)",
      }}
    >
      <div
        style={{
          maxWidth: 700,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 64,
            marginBottom: 24,
          }}
        >
          🤖
        </div>

        <h1
          style={{
            fontSize: 52,
            fontWeight: 800,
            lineHeight: 1.1,
            marginBottom: 16,
            background: "linear-gradient(135deg, #f0f0f5 0%, #6366f1 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Hire AI Employees
        </h1>

        <p
          style={{
            fontSize: 20,
            color: "var(--text-secondary)",
            marginBottom: 48,
            lineHeight: 1.6,
          }}
        >
          Each AI employee gets their own computer, email, Slack, browser, and
          more. They work 24/7, never call in sick, and scale instantly.
        </p>

        <div
          style={{
            display: "flex",
            gap: 16,
            justifyContent: "center",
            marginBottom: 80,
          }}
        >
          <Link
            href="/register"
            className="btn-primary"
            style={{
              fontSize: 18,
              padding: "14px 36px",
              textDecoration: "none",
            }}
          >
            Start Hiring
          </Link>
          <Link
            href="/login"
            className="btn-secondary"
            style={{
              fontSize: 18,
              padding: "14px 36px",
              textDecoration: "none",
            }}
          >
            Sign In
          </Link>
        </div>

        {/* Role cards preview */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 16,
          }}
        >
          {[
            { emoji: "📣", title: "Marketing Manager", desc: "Campaigns, content, SEO" },
            { emoji: "🎧", title: "Support Lead", desc: "24/7 customer support" },
            { emoji: "💼", title: "Sales Rep", desc: "Outreach & lead gen" },
            { emoji: "⚙️", title: "COO", desc: "Ops & process optimization" },
            { emoji: "👨‍💻", title: "Engineer", desc: "Code, debug, ship" },
            { emoji: "📊", title: "Data Analyst", desc: "Insights & reporting" },
          ].map((role) => (
            <div
              key={role.title}
              className="card"
              style={{
                padding: 20,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>{role.emoji}</div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  marginBottom: 4,
                }}
              >
                {role.title}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                }}
              >
                {role.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
