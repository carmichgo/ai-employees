"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronRight, Download, Chrome } from "lucide-react";

/* ─── Scroll-reveal hook ──────────────────────────── */
function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); io.unobserve(el); } },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, visible };
}

function Reveal({ children, className = "", delay = 0, direction = "up" }: {
  children: React.ReactNode; className?: string; delay?: number; direction?: "up" | "down" | "left" | "right" | "scale";
}) {
  const { ref, visible } = useReveal(0.1);
  const transforms: Record<string, string> = {
    up: "translateY(40px)", down: "translateY(-40px)",
    left: "translateX(-40px)", right: "translateX(40px)",
    scale: "scale(0.95)",
  };
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : transforms[direction],
        transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}

/* ─── Animated counter ────────────────────────────── */
function Counter({ end, suffix = "", duration = 2000 }: { end: number; suffix?: string; duration?: number }) {
  const { ref, visible } = useReveal(0.3);
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!visible) return;
    let start = 0;
    const step = Math.ceil(end / (duration / 16));
    const timer = setInterval(() => {
      start += step;
      if (start >= end) { setCount(end); clearInterval(timer); }
      else setCount(start);
    }, 16);
    return () => clearInterval(timer);
  }, [visible, end, duration]);
  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

/* ─── Typing animation ────────────────────────────── */
function TypingText({ texts }: { texts: string[] }) {
  const [idx, setIdx] = useState(0);
  const [displayed, setDisplayed] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const current = texts[idx];
    if (!deleting && displayed.length < current.length) {
      const t = setTimeout(() => setDisplayed(current.slice(0, displayed.length + 1)), 60);
      return () => clearTimeout(t);
    }
    if (!deleting && displayed.length === current.length) {
      const t = setTimeout(() => setDeleting(true), 2000);
      return () => clearTimeout(t);
    }
    if (deleting && displayed.length > 0) {
      const t = setTimeout(() => setDisplayed(displayed.slice(0, -1)), 30);
      return () => clearTimeout(t);
    }
    if (deleting && displayed.length === 0) {
      setDeleting(false);
      setIdx((i) => (i + 1) % texts.length);
    }
  }, [displayed, deleting, idx, texts]);

  return (
    <span className="lp-gradient-text">
      {displayed}
      <span className="lp-cursor">|</span>
    </span>
  );
}

/* ─── Data ────────────────────────────────────────── */
const ROLES = [
  { emoji: "📣", title: "Marketing Manager", desc: "Runs campaigns, writes copy, analyzes performance metrics, and grows your brand across every channel.", tier: "Expert" },
  { emoji: "🎧", title: "Customer Support", desc: "Resolves issues fast, builds knowledge bases, turns frustrated customers into loyal advocates.", tier: "Expert" },
  { emoji: "💼", title: "Sales Rep", desc: "Finds prospects, writes outreach that gets replies, qualifies leads, and fills the pipeline.", tier: "Expert" },
  { emoji: "⚙️", title: "COO", desc: "Runs the machine — designs processes, coordinates teams, tracks KPIs, and turns strategy into execution.", tier: "Expert" },
  { emoji: "👨‍💻", title: "Software Engineer", desc: "Writes clean, tested code. Reviews PRs, debugs issues, and makes sound architecture decisions.", tier: "Expert" },
  { emoji: "📊", title: "Data Analyst", desc: "Turns raw data into insights that drive decisions. Builds dashboards and tells the story behind the numbers.", tier: "Expert" },
  { emoji: "✍️", title: "Content Writer", desc: "Writes blog posts, articles, emails, and social content that engages readers and ranks in search.", tier: "Senior" },
  { emoji: "📋", title: "Executive Assistant", desc: "Manages calendars, handles communications, organizes information, and keeps everything on schedule.", tier: "Senior" },
  { emoji: "🔍", title: "SEO Manager", desc: "Drives organic traffic through technical SEO, content strategy, and search-first thinking.", tier: "Expert" },
  { emoji: "🔬", title: "Research Analyst", desc: "Conducts deep research, analyzes markets, and synthesizes complex information into actionable reports.", tier: "Expert" },
];

const CAPABILITIES = [
  { icon: "🌐", title: "Web Browsing", desc: "Visit websites, fill forms, extract data" },
  { icon: "📧", title: "Email", desc: "Read inbox, compose emails, manage threads" },
  { icon: "💬", title: "Slack & Teams", desc: "Join channels, respond to messages, collaborate" },
  { icon: "📱", title: "WhatsApp", desc: "Send messages, handle customer conversations" },
  { icon: "🔍", title: "Internet Search", desc: "Find information, news, and answers online" },
  { icon: "💻", title: "Code Execution", desc: "Execute scripts, install packages, use terminal" },
  { icon: "📄", title: "Documents & PDFs", desc: "Generate reports, read documents, organize files" },
  { icon: "🖼️", title: "Image Generation", desc: "Generate, edit, and analyze visual content" },
  { icon: "📹", title: "Video Generation", desc: "Create AI-generated video clips from text prompts" },
  { icon: "📞", title: "Phone Calls", desc: "Place and receive voice calls autonomously" },
  { icon: "📅", title: "Scheduling", desc: "Set up automated routines and reminders" },
  { icon: "🧠", title: "Memory", desc: "Recall conversations, contacts, and context" },
];

const TIERS = [
  {
    name: "Junior",
    price: 99,
    model: "Claude Haiku 4.5",
    subtitle: "Fast & affordable",
    credits: 25,
    features: ["Email & Slack included", "Web browsing & search", "File management", "25 credits/month"],
  },
  {
    name: "Senior",
    price: 299,
    model: "Claude Sonnet 4.5",
    subtitle: "Balanced power",
    credits: 100,
    popular: true,
    features: ["Everything in Junior", "Code execution", "PDF generation", "Telegram & Discord free", "100 credits/month"],
  },
  {
    name: "Expert",
    price: 799,
    model: "Claude Opus 4.6",
    subtitle: "Maximum capability",
    credits: 300,
    features: ["Everything in Senior", "Image & video generation", "All channels included", "All expertise unlocked", "300 credits/month"],
  },
];

const STATS = [
  { value: 24, suffix: "/7", label: "Always working" },
  { value: 10, suffix: "+", label: "Role templates" },
  { value: 12, suffix: "+", label: "Integrations" },
  { value: 2, suffix: "min", label: "To deploy" },
];

/* ─── Page ────────────────────────────────────────── */
export default function LandingPage() {
  const [navScrolled, setNavScrolled] = useState(false);
  useEffect(() => {
    const h = () => setNavScrolled(window.scrollY > 20);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);

  return (
    <div className="lp-root">
      {/* ── Nav ───────────────────────────────── */}
      <nav className={`lp-nav ${navScrolled ? "lp-nav-scrolled" : ""}`}>
        <div className="lp-nav-inner">
          <Link href="/" className="lp-logo">
            <div className="lp-logo-mark">B</div>
            <span className="lp-logo-text">Blitzer</span>
          </Link>
          <div className="lp-nav-links">
            <a href="#roles" className="lp-nav-link">Roles</a>
            <a href="#capabilities" className="lp-nav-link">Capabilities</a>
            <a href="#pricing" className="lp-nav-link">Pricing</a>
          </div>
          <div className="lp-nav-actions">
            <a href="/api/extension/download" className="lp-nav-link" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Chrome size={14} /> Extension
            </a>
            <Link href="/login" className="lp-nav-link">Sign In</Link>
            <Link href="/register" className="lp-btn-primary">
              Get Started <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-hero-glow" />
        <div className="lp-hero-grid" />
        <div className="lp-hero-content">
          <Reveal delay={0}>
            <div className="lp-badge">
              <span className="lp-badge-dot" />
              Powered by OpenClaw
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <h1 className="lp-hero-title">
              Hire an AI<br />
              <TypingText texts={[
                "Marketing Manager",
                "Software Engineer",
                "Sales Rep",
                "Data Analyst",
                "Customer Support",
                "Executive Assistant",
              ]} />
            </h1>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="lp-hero-sub">
              Each AI employee gets their own isolated workstation — complete with email,
              browser, Slack, and every tool they need. They work 24/7, learn your business,
              and scale instantly.
            </p>
          </Reveal>
          <Reveal delay={0.3}>
            <div className="lp-hero-actions">
              <Link href="/register" className="lp-btn-primary lp-btn-lg">
                Start Hiring <ArrowRight size={16} />
              </Link>
              <a href="#how-it-works" className="lp-btn-secondary lp-btn-lg">
                See How It Works
              </a>
            </div>
          </Reveal>
          <Reveal delay={0.4}>
            <p className="lp-hero-note">No credit card required. Deploy in under 2 minutes.</p>
          </Reveal>
        </div>

        {/* Floating role cards */}
        <div className="lp-hero-float">
          <Reveal delay={0.5} direction="scale">
            <div className="lp-float-card lp-float-1">
              <span className="lp-float-emoji">📣</span>
              <div>
                <div className="lp-float-name">Marketing Manager</div>
                <div className="lp-float-status"><span className="lp-status-dot-green" /> Active</div>
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.6} direction="scale">
            <div className="lp-float-card lp-float-2">
              <span className="lp-float-emoji">👨‍💻</span>
              <div>
                <div className="lp-float-name">Software Engineer</div>
                <div className="lp-float-status"><span className="lp-status-dot-green" /> Active</div>
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.7} direction="scale">
            <div className="lp-float-card lp-float-3">
              <span className="lp-float-emoji">💼</span>
              <div>
                <div className="lp-float-name">Sales Rep</div>
                <div className="lp-float-status"><span className="lp-status-dot-green" /> Active</div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Stats bar ─────────────────────────── */}
      <section className="lp-stats">
        {STATS.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.1} className="lp-stat">
            <div className="lp-stat-value"><Counter end={s.value} suffix={s.suffix} /></div>
            <div className="lp-stat-label">{s.label}</div>
          </Reveal>
        ))}
      </section>

      {/* ── How it works ──────────────────────── */}
      <section className="lp-section" id="how-it-works">
        <Reveal>
          <div className="lp-section-header">
            <span className="lp-section-label">How It Works</span>
            <h2 className="lp-section-title">Three steps to your AI workforce</h2>
            <p className="lp-section-sub">From choosing a role to a fully operational employee in under two minutes.</p>
          </div>
        </Reveal>
        <div className="lp-steps">
          {[
            { num: "01", title: "Choose a Role", desc: "Pick from 10+ pre-built role templates — Marketing Manager, Software Engineer, Sales Rep, and more. Each comes with a crafted persona, goals, and personality." },
            { num: "02", title: "Customize & Equip", desc: "Select a tier (Junior, Senior, Expert), add channels like Slack, email, WhatsApp, and enable capabilities like code execution, image generation, or scheduling." },
            { num: "03", title: "Deploy & Scale", desc: "Your AI employee gets their own isolated workstation and starts working immediately. Add more employees anytime — billing adjusts automatically." },
          ].map((step, i) => (
            <Reveal key={step.num} delay={i * 0.15} className="lp-step">
              <div className="lp-step-num">{step.num}</div>
              <h3 className="lp-step-title">{step.title}</h3>
              <p className="lp-step-desc">{step.desc}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Roles ─────────────────────────────── */}
      <section className="lp-section lp-section-alt" id="roles">
        <Reveal>
          <div className="lp-section-header">
            <span className="lp-section-label">Pre-built Roles</span>
            <h2 className="lp-section-title">An employee for every function</h2>
            <p className="lp-section-sub">Each role comes with a crafted persona, domain expertise, goals, and personality. Choose one and deploy instantly.</p>
          </div>
        </Reveal>
        <div className="lp-roles-grid">
          {ROLES.map((role, i) => (
            <Reveal key={role.title} delay={i * 0.06} direction="up" className="lp-role-card">
              <div className="lp-role-emoji">{role.emoji}</div>
              <div className="lp-role-name">{role.title}</div>
              <div className="lp-role-desc">{role.desc}</div>
              <div className="lp-role-footer">
                <span className="lp-role-tier">{role.tier}</span>
                <ChevronRight size={14} className="lp-role-arrow" />
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Capabilities ──────────────────────── */}
      <section className="lp-section" id="capabilities">
        <Reveal>
          <div className="lp-section-header">
            <span className="lp-section-label">Capabilities</span>
            <h2 className="lp-section-title">Everything they need, built in</h2>
            <p className="lp-section-sub">Every employee gets their own isolated environment with real tools — not just chat. They browse the web, send emails, write code, and more.</p>
          </div>
        </Reveal>
        <div className="lp-cap-grid">
          {CAPABILITIES.map((cap, i) => (
            <Reveal key={cap.title} delay={i * 0.05} direction="up" className="lp-cap-card">
              <div className="lp-cap-icon">{cap.icon}</div>
              <div className="lp-cap-title">{cap.title}</div>
              <div className="lp-cap-desc">{cap.desc}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Big feature: Isolation ────────────── */}
      <section className="lp-section lp-section-alt">
        <div className="lp-feature-split">
          <Reveal direction="left" className="lp-feature-text">
            <span className="lp-section-label">Full Isolation</span>
            <h2 className="lp-feature-title">Each employee gets their own computer</h2>
            <p className="lp-feature-desc">
              Every AI employee runs in a fully isolated environment — their own filesystem,
              browser, email client, and terminal. No shared state, no cross-contamination.
              Just like giving a new hire their own laptop on day one.
            </p>
            <ul className="lp-feature-list">
              <li><Check size={16} /> Dedicated isolated workstation</li>
              <li><Check size={16} /> Persistent memory across conversations</li>
              <li><Check size={16} /> Secure — no data leaks between employees</li>
              <li><Check size={16} /> Full internet access and tool usage</li>
            </ul>
          </Reveal>
          <Reveal direction="right" delay={0.2} className="lp-feature-visual">
            <div className="lp-terminal">
              <div className="lp-terminal-bar">
                <span className="lp-terminal-dot lp-dot-red" />
                <span className="lp-terminal-dot lp-dot-yellow" />
                <span className="lp-terminal-dot lp-dot-green" />
                <span className="lp-terminal-title">marketing-manager@blitzer</span>
              </div>
              <div className="lp-terminal-body">
                <div className="lp-terminal-line"><span className="lp-t-prompt">$</span> checking inbox...</div>
                <div className="lp-terminal-line lp-t-dim">  3 new emails from leads</div>
                <div className="lp-terminal-line"><span className="lp-t-prompt">$</span> drafting campaign brief...</div>
                <div className="lp-terminal-line lp-t-dim">  Q1 launch campaign ready</div>
                <div className="lp-terminal-line"><span className="lp-t-prompt">$</span> posting to Slack #marketing...</div>
                <div className="lp-terminal-line lp-t-success">  Sent campaign brief for review</div>
                <div className="lp-terminal-line"><span className="lp-t-prompt">$</span> analyzing SEO metrics...</div>
                <div className="lp-terminal-line lp-t-dim">  Organic traffic up 23% MoM</div>
                <div className="lp-terminal-line lp-terminal-cursor"><span className="lp-t-prompt">$</span> <span className="lp-blink">_</span></div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Big feature: Always On ────────────── */}
      <section className="lp-section">
        <div className="lp-feature-split lp-feature-reverse">
          <Reveal direction="right" className="lp-feature-text">
            <span className="lp-section-label">Always On</span>
            <h2 className="lp-feature-title">24/7 workforce that never stops</h2>
            <p className="lp-feature-desc">
              Your AI employees work around the clock. No sick days, no vacations,
              no timezone constraints. They respond to customers at 3am, process leads
              while you sleep, and ship code over the weekend.
            </p>
            <ul className="lp-feature-list">
              <li><Check size={16} /> No downtime — ever</li>
              <li><Check size={16} /> Responds in seconds, not hours</li>
              <li><Check size={16} /> Scales from 1 to 100 employees instantly</li>
              <li><Check size={16} /> Proactive — finds work, doesn&apos;t wait</li>
            </ul>
          </Reveal>
          <Reveal direction="left" delay={0.2} className="lp-feature-visual">
            <div className="lp-clock-visual">
              <div className="lp-clock-ring">
                <div className="lp-clock-glow" />
                {[...Array(24)].map((_, i) => (
                  <div
                    key={i}
                    className="lp-clock-tick"
                    style={{ transform: `rotate(${i * 15}deg)` }}
                  />
                ))}
                <div className="lp-clock-center">
                  <div className="lp-clock-value">24<span>/7</span></div>
                  <div className="lp-clock-label">Always Active</div>
                </div>
              </div>
              <div className="lp-clock-items">
                <div className="lp-clock-item lp-ci-1">Replying to customer email</div>
                <div className="lp-clock-item lp-ci-2">Analyzing weekly metrics</div>
                <div className="lp-clock-item lp-ci-3">Pushing PR to GitHub</div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Pricing ───────────────────────────── */}
      <section className="lp-section lp-section-alt" id="pricing">
        <Reveal>
          <div className="lp-section-header">
            <span className="lp-section-label">Pricing</span>
            <h2 className="lp-section-title">Simple, per-employee pricing</h2>
            <p className="lp-section-sub">One subscription per company. Add or remove employees anytime — billing adjusts automatically with prorated charges.</p>
          </div>
        </Reveal>
        <div className="lp-pricing-grid">
          {TIERS.map((tier, i) => (
            <Reveal key={tier.name} delay={i * 0.12} direction="up" className={`lp-price-card ${tier.popular ? "lp-price-popular" : ""}`}>
              {tier.popular && <div className="lp-price-badge">Most Popular</div>}
              <div className="lp-price-name">{tier.name}</div>
              <div className="lp-price-model">{tier.model}</div>
              <div className="lp-price-subtitle">{tier.subtitle}</div>
              <div className="lp-price-amount">
                <span className="lp-price-dollar">$</span>
                <span className="lp-price-num">{tier.price}</span>
                <span className="lp-price-period">/mo</span>
              </div>
              <div className="lp-price-per">per employee</div>
              <Link href="/register" className={`lp-btn-price ${tier.popular ? "lp-btn-price-primary" : ""}`}>
                Get Started <ArrowRight size={14} />
              </Link>
              <ul className="lp-price-features">
                {tier.features.map((f) => (
                  <li key={f}><Check size={14} /> {f}</li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>

        {/* Add-ons */}
        <Reveal>
          <div className="lp-addons">
            <div className="lp-addons-title">Customize with add-ons</div>
            <div className="lp-addons-subtitle">Extend any employee with extra channels, capabilities, and expertise. Higher tiers include more for free.</div>
            <div className="lp-addons-grid">
              <div className="lp-addon-group">
                <div className="lp-addon-group-title">Channels</div>
                {[
                  { name: "Slack & Email", price: "Included" },
                  { name: "Telegram & Discord", price: "Free w/ Senior+" },
                  { name: "WhatsApp & Teams", price: "From $19/mo" },
                  { name: "Signal & Matrix", price: "From $19/mo" },
                ].map((a) => (
                  <div key={a.name} className="lp-addon-item">
                    <span className="lp-addon-name">{a.name}</span>
                    <span className={`lp-addon-price ${a.price === "Included" ? "lp-addon-free" : ""}`}>{a.price}</span>
                  </div>
                ))}
              </div>
              <div className="lp-addon-group">
                <div className="lp-addon-group-title">Capabilities</div>
                {[
                  { name: "Web, Search & Files", price: "Included" },
                  { name: "Code Execution & PDFs", price: "Free w/ Senior+" },
                  { name: "Image Generation", price: "From $19/mo" },
                  { name: "Video & Phone Calls", price: "From $29/mo" },
                ].map((a) => (
                  <div key={a.name} className="lp-addon-item">
                    <span className="lp-addon-name">{a.name}</span>
                    <span className={`lp-addon-price ${a.price === "Included" ? "lp-addon-free" : ""}`}>{a.price}</span>
                  </div>
                ))}
              </div>
              <div className="lp-addon-group">
                <div className="lp-addon-group-title">Expertise</div>
                {[
                  { name: "Research & Writing", price: "Included" },
                  { name: "Data & Support", price: "Free w/ Senior+" },
                  { name: "Code & Social Media", price: "From $19/mo" },
                  { name: "Sales, Design & Ops", price: "From $19/mo" },
                ].map((a) => (
                  <div key={a.name} className="lp-addon-item">
                    <span className="lp-addon-name">{a.name}</span>
                    <span className={`lp-addon-price ${a.price === "Included" ? "lp-addon-free" : ""}`}>{a.price}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Chrome Extension ──────────────────── */}
      <section className="lp-section lp-section-alt" id="extension">
        <div className="lp-feature-split">
          <Reveal direction="left" className="lp-feature-text">
            <span className="lp-section-label">Chrome Extension</span>
            <h2 className="lp-feature-title">Connect your real browser</h2>
            <p className="lp-feature-desc">
              Install the Blitzer AI Chrome extension to let your AI employees browse the web
              using your real browser session. They can bypass bot detection, use your logged-in
              accounts, and interact with any website — just like you would.
            </p>
            <ul className="lp-feature-list">
              <li><Check size={16} /> Uses your real Chrome session</li>
              <li><Check size={16} /> Bypasses bot detection &amp; CAPTCHAs</li>
              <li><Check size={16} /> Access sites behind your logins</li>
              <li><Check size={16} /> One-click connect from the dashboard</li>
            </ul>
            <div style={{ marginTop: 24 }}>
              <a href="/api/extension/download" className="lp-btn-primary lp-btn-lg" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <Download size={16} /> Download Chrome Extension
              </a>
            </div>
          </Reveal>
          <Reveal direction="right" delay={0.2} className="lp-feature-visual">
            <div className="lp-terminal">
              <div className="lp-terminal-bar">
                <span className="lp-terminal-dot lp-dot-red" />
                <span className="lp-terminal-dot lp-dot-yellow" />
                <span className="lp-terminal-dot lp-dot-green" />
                <span className="lp-terminal-title">Chrome Extension</span>
              </div>
              <div className="lp-terminal-body">
                <div className="lp-terminal-line"><span className="lp-t-prompt">1.</span> Download the extension (.zip)</div>
                <div className="lp-terminal-line"><span className="lp-t-prompt">2.</span> Unzip and open <span className="lp-t-success">chrome://extensions</span></div>
                <div className="lp-terminal-line"><span className="lp-t-prompt">3.</span> Enable &quot;Developer mode&quot;</div>
                <div className="lp-terminal-line"><span className="lp-t-prompt">4.</span> Click &quot;Load unpacked&quot; → select folder</div>
                <div className="lp-terminal-line"><span className="lp-t-prompt">5.</span> Copy the Extension ID</div>
                <div className="lp-terminal-line lp-t-dim" style={{ marginTop: 8 }}>Then in the dashboard:</div>
                <div className="lp-terminal-line"><span className="lp-t-prompt">6.</span> Go to employee → Browser Relay</div>
                <div className="lp-terminal-line"><span className="lp-t-prompt">7.</span> Click &quot;Connect Chrome Extension&quot;</div>
                <div className="lp-terminal-line lp-t-success" style={{ marginTop: 8 }}>  ✓ Connected — browsing with your session</div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────── */}
      <section className="lp-cta">
        <div className="lp-cta-glow" />
        <Reveal>
          <h2 className="lp-cta-title">Ready to build your AI team?</h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="lp-cta-sub">
            Deploy your first AI employee in under 2 minutes.<br />
            No credit card required.
          </p>
        </Reveal>
        <Reveal delay={0.2}>
          <div className="lp-cta-actions">
            <Link href="/register" className="lp-btn-primary lp-btn-xl">
              Start Hiring Free <ArrowRight size={18} />
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ── Footer ────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <div className="lp-logo">
              <div className="lp-logo-mark">B</div>
              <span className="lp-logo-text">Blitzer</span>
            </div>
            <p className="lp-footer-tagline">The AI workforce platform.<br />Powered by OpenClaw.</p>
          </div>
          <div className="lp-footer-links">
            <div className="lp-footer-col">
              <div className="lp-footer-heading">Product</div>
              <a href="#roles">Roles</a>
              <a href="#capabilities">Capabilities</a>
              <a href="#pricing">Pricing</a>
            </div>
            <div className="lp-footer-col">
              <div className="lp-footer-heading">Company</div>
              <Link href="/login">Sign In</Link>
              <Link href="/register">Get Started</Link>
            </div>
          </div>
        </div>
        <div className="lp-footer-bottom">
          <p>&copy; {new Date().getFullYear()} Blitzer. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
