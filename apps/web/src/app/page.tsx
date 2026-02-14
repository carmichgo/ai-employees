"use client";

import Link from "next/link";
import { ArrowRight, Zap, Shield, Globe, MessageSquare, Mail, Monitor } from "lucide-react";

const ROLES = [
  { icon: "📣", title: "Marketing Manager", desc: "Campaigns, SEO, content strategy", delay: 1 },
  { icon: "🎧", title: "Support Lead", desc: "24/7 customer support", delay: 2 },
  { icon: "💼", title: "Sales Rep", desc: "Outreach & pipeline management", delay: 3 },
  { icon: "⚙️", title: "COO", desc: "Operations & process optimization", delay: 1 },
  { icon: "👨‍💻", title: "Engineer", desc: "Code, debug, ship features", delay: 2 },
  { icon: "📊", title: "Data Analyst", desc: "Insights & reporting", delay: 3 },
];

const FEATURES = [
  {
    icon: <Shield size={20} />,
    title: "Full Isolation",
    desc: "Each employee runs in their own secure, isolated environment — like having their own computer.",
  },
  {
    icon: <Zap size={20} />,
    title: "Always On",
    desc: "Your AI employees work 24/7. No sick days, no vacations, no downtime.",
  },
  {
    icon: <Globe size={20} />,
    title: "Connected",
    desc: "Email, Slack, WhatsApp, Telegram, browser — everything they need from day one.",
  },
];

export default function LandingPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Nav */}
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          padding: "0 32px",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "var(--bg)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: "var(--text)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              color: "var(--bg)",
              letterSpacing: "-0.02em",
            }}
          >
            AI
          </div>
          <span style={{ fontWeight: 600, fontSize: 14, letterSpacing: "-0.02em", color: "var(--text)" }}>
            AI Employees
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link
            href="/login"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 32,
              padding: "0 14px",
              background: "var(--bg)",
              color: "var(--text)",
              fontSize: 13,
              fontWeight: 500,
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              textDecoration: "none",
              transition: "all 0.15s ease",
            }}
          >
            Sign In
          </Link>
          <Link href="/register" className="btn-primary btn-sm">
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "100px 24px 80px",
          textAlign: "center",
        }}
      >
        <div className="animate-in" style={{ maxWidth: 680 }}>
          {/* Badge */}
          <div
            className="animate-in"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 14px",
              borderRadius: 100,
              border: "1px solid var(--border)",
              fontSize: 12,
              fontWeight: 500,
              color: "var(--text-secondary)",
              marginBottom: 28,
              background: "var(--bg-secondary)",
            }}
          >
            <span style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--green)",
            }} />
            Powered by OpenClaw
          </div>

          <h1
            className="animate-in animate-in-delay-1"
            style={{
              fontSize: "clamp(2.25rem, 5vw, 3.25rem)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
              color: "var(--text)",
              margin: 0,
            }}
          >
            Hire AI Employees
            <br />
            That Actually Work
          </h1>

          <p
            className="animate-in animate-in-delay-2"
            style={{
              maxWidth: 500,
              margin: "20px auto 40px",
              fontSize: 16,
              lineHeight: 1.6,
              color: "var(--text-secondary)",
            }}
          >
            Each employee gets their own isolated workstation with email, browser, Slack,
            and more. They work 24/7 and scale instantly.
          </p>

          <div
            className="animate-in animate-in-delay-3"
            style={{ display: "flex", gap: 10, justifyContent: "center" }}
          >
            <Link
              href="/register"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                height: 36,
                padding: "0 18px",
                background: "var(--text)",
                color: "var(--bg)",
                fontSize: 13,
                fontWeight: 500,
                border: "none",
                borderRadius: "var(--radius-md)",
                textDecoration: "none",
                transition: "all 0.15s ease",
              }}
            >
              Start Hiring
              <ArrowRight size={15} />
            </Link>
            <Link
              href="/login"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                height: 36,
                padding: "0 18px",
                background: "var(--bg)",
                color: "var(--text)",
                fontSize: 13,
                fontWeight: 500,
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                textDecoration: "none",
                transition: "all 0.15s ease",
              }}
            >
              Sign In
            </Link>
          </div>
        </div>

        {/* Tool icons row */}
        <div
          className="animate-in animate-in-delay-4"
          style={{
            display: "flex",
            gap: 20,
            marginTop: 64,
            color: "var(--text-tertiary)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
            <Mail size={13} /> Email
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
            <MessageSquare size={13} /> Slack
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
            <Monitor size={13} /> Browser
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
            <Globe size={13} /> WhatsApp
          </div>
        </div>
      </section>

      {/* Roles Grid */}
      <section style={{ padding: "64px 24px 96px", maxWidth: 920, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--text-tertiary)",
              marginBottom: 10,
            }}
          >
            Pre-built Roles
          </p>
          <h2
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: "-0.025em",
              color: "var(--text)",
              lineHeight: 1.2,
              margin: 0,
            }}
          >
            Choose a role, we handle the rest
          </h2>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
          }}
        >
          {ROLES.map((role) => (
            <div
              key={role.title}
              className={`animate-in animate-in-delay-${role.delay}`}
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: 24,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = "var(--shadow-sm)";
                e.currentTarget.style.borderColor = "var(--border-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.borderColor = "var(--border)";
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 14 }}>{role.icon}</div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  marginBottom: 4,
                  letterSpacing: "-0.01em",
                  color: "var(--text)",
                }}
              >
                {role.title}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                {role.desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section
        style={{
          padding: "64px 24px",
          maxWidth: 920,
          margin: "0 auto",
          borderTop: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 28 }}>
          {FEATURES.map((f) => (
            <div key={f.title} style={{ padding: "4px 0" }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-secondary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text-secondary)",
                  marginBottom: 14,
                }}
              >
                {f.icon}
              </div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  marginBottom: 6,
                  letterSpacing: "-0.01em",
                  color: "var(--text)",
                }}
              >
                {f.title}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                }}
              >
                {f.desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section
        style={{
          padding: "64px 24px 96px",
          textAlign: "center",
          borderTop: "1px solid var(--border)",
        }}
      >
        <h2
          style={{
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: "-0.025em",
            color: "var(--text)",
            marginBottom: 12,
            lineHeight: 1.2,
          }}
        >
          Ready to scale your team?
        </h2>
        <p
          style={{
            fontSize: 15,
            lineHeight: 1.6,
            color: "var(--text-secondary)",
            marginBottom: 32,
            maxWidth: 440,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          Deploy your first AI employee in under 2 minutes.
        </p>
        <Link
          href="/register"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            height: 36,
            padding: "0 18px",
            background: "var(--text)",
            color: "var(--bg)",
            fontSize: 13,
            fontWeight: 500,
            border: "none",
            borderRadius: "var(--radius-md)",
            textDecoration: "none",
            transition: "all 0.15s ease",
          }}
        >
          Get Started Free
          <ArrowRight size={15} />
        </Link>
      </section>
    </div>
  );
}
