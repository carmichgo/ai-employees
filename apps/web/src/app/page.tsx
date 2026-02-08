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
    <div style={{ minHeight: "100vh", overflow: "hidden" }}>
      {/* Nav */}
      <nav
        className="glass"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          padding: "0 32px",
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "linear-gradient(135deg, #5D79DF, #A94BD2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
            }}
          >
            A
          </div>
          <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: "-0.02em" }}>
            AI Employees
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            href="/login"
            style={{
              color: "var(--text-secondary)",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 500,
              padding: "8px 16px",
              borderRadius: "var(--radius-sm)",
              transition: "color 0.2s",
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
          padding: "120px 24px 80px",
          textAlign: "center",
          position: "relative",
        }}
      >
        {/* Background glow */}
        <div
          style={{
            position: "absolute",
            top: "20%",
            left: "50%",
            transform: "translateX(-50%)",
            width: 600,
            height: 400,
            background: "radial-gradient(ellipse, rgba(93, 121, 223, 0.08) 0%, rgba(169, 75, 210, 0.04) 40%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        <div className="animate-in" style={{ maxWidth: 720, position: "relative" }}>
          {/* Badge */}
          <div
            className="animate-in"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 16px",
              borderRadius: 100,
              border: "1px solid var(--border)",
              fontSize: 13,
              color: "var(--text-secondary)",
              marginBottom: 32,
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <span style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--green)",
              boxShadow: "0 0 8px var(--green)",
            }} />
            Powered by OpenClaw
          </div>

          <h1 className="display gradient-text animate-in animate-in-delay-1">
            Hire AI Employees
            <br />
            That Actually Work
          </h1>

          <p
            className="body-lg animate-in animate-in-delay-2"
            style={{
              maxWidth: 520,
              margin: "24px auto 48px",
            }}
          >
            Each employee gets their own isolated workstation with email, browser, Slack,
            and more. They work 24/7 and scale instantly.
          </p>

          <div
            className="animate-in animate-in-delay-3"
            style={{ display: "flex", gap: 12, justifyContent: "center" }}
          >
            <Link href="/register" className="btn-primary" style={{ gap: 8 }}>
              Start Hiring
              <ArrowRight size={16} />
            </Link>
            <Link href="/login" className="btn-secondary">
              Sign In
            </Link>
          </div>
        </div>

        {/* Tool icons row */}
        <div
          className="animate-in animate-in-delay-4"
          style={{
            display: "flex",
            gap: 24,
            marginTop: 80,
            color: "var(--text-tertiary)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <Mail size={14} /> Email
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <MessageSquare size={14} /> Slack
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <Monitor size={14} /> Browser
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <Globe size={14} /> WhatsApp
          </div>
        </div>
      </section>

      {/* Roles Grid */}
      <section style={{ padding: "80px 24px 120px", maxWidth: 960, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <p className="label" style={{ marginBottom: 12 }}>Pre-built Roles</p>
          <h2 className="heading-1 gradient-text">Choose a role, we handle the rest</h2>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
          }}
        >
          {ROLES.map((role) => (
            <div
              key={role.title}
              className={`card card-interactive animate-in animate-in-delay-${role.delay}`}
              style={{ padding: 28 }}
            >
              <div style={{ fontSize: 36, marginBottom: 16 }}>{role.icon}</div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 15,
                  marginBottom: 6,
                  letterSpacing: "-0.01em",
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
          padding: "80px 24px",
          maxWidth: 960,
          margin: "0 auto",
          borderTop: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32 }}>
          {FEATURES.map((f) => (
            <div key={f.title} style={{ padding: "8px 0" }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text-secondary)",
                  marginBottom: 16,
                }}
              >
                {f.icon}
              </div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 15,
                  marginBottom: 8,
                  letterSpacing: "-0.01em",
                }}
              >
                {f.title}
              </div>
              <div
                style={{
                  fontSize: 14,
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
          padding: "80px 24px 120px",
          textAlign: "center",
          borderTop: "1px solid var(--border)",
        }}
      >
        <h2 className="heading-1" style={{ marginBottom: 16 }}>
          Ready to scale your team?
        </h2>
        <p className="body-lg" style={{ marginBottom: 40, maxWidth: 480, margin: "0 auto 40px" }}>
          Deploy your first AI employee in under 2 minutes.
        </p>
        <Link href="/register" className="btn-primary" style={{ gap: 8 }}>
          Get Started Free
          <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  );
}
