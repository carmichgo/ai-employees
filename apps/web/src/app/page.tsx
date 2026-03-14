"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Download,
  Chrome,
  Shield,
  Zap,
  Globe,
  Clock,
  Users,
  BarChart3,
  MessageSquare,
  Star,
  ChevronDown,
  Play,
  Monitor,
  Lock,
  Server,
  Cpu,
  Mail,
  Code,
  FileText,
  Image,
  Video,
  Phone,
  Calendar,
  Brain,
  Search,
  Smartphone,
  Building2,
  Rocket,
  TrendingUp,
  HeadphonesIcon,
  Megaphone,
  PenTool,
  ClipboardList,
  LineChart,
  Microscope,
  Settings,
  Layers,
  X,
} from "lucide-react";

/* ─── Scroll-reveal hook ──────────────────────────── */
function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          io.unobserve(el);
        }
      },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, visible };
}

function Reveal({
  children,
  className = "",
  delay = 0,
  direction = "up",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "down" | "left" | "right" | "scale";
}) {
  const { ref, visible } = useReveal(0.1);
  const transforms: Record<string, string> = {
    up: "translateY(40px)",
    down: "translateY(-40px)",
    left: "translateX(-40px)",
    right: "translateX(40px)",
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
function Counter({
  end,
  suffix = "",
  duration = 2000,
}: {
  end: number;
  suffix?: string;
  duration?: number;
}) {
  const { ref, visible } = useReveal(0.3);
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!visible) return;
    let start = 0;
    const step = Math.ceil(end / (duration / 16));
    const timer = setInterval(() => {
      start += step;
      if (start >= end) {
        setCount(end);
        clearInterval(timer);
      } else setCount(start);
    }, 16);
    return () => clearInterval(timer);
  }, [visible, end, duration]);
  return (
    <span ref={ref}>
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}

/* ─── Typing animation ────────────────────────────── */
function TypingText({ texts }: { texts: string[] }) {
  const [idx, setIdx] = useState(0);
  const [displayed, setDisplayed] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const current = texts[idx];
    if (!deleting && displayed.length < current.length) {
      const t = setTimeout(
        () => setDisplayed(current.slice(0, displayed.length + 1)),
        60
      );
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

/* ─── FAQ Accordion ────────────────────────────────── */
function FAQItem({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`lp-faq-item ${open ? "lp-faq-open" : ""}`}>
      <button className="lp-faq-question" onClick={() => setOpen(!open)}>
        <span>{question}</span>
        <ChevronDown size={18} className="lp-faq-chevron" />
      </button>
      <div className="lp-faq-answer">
        <p>{answer}</p>
      </div>
    </div>
  );
}

/* ─── Data ────────────────────────────────────────── */
const ROLES = [
  {
    icon: <Megaphone size={22} />,
    title: "Marketing Manager",
    desc: "Runs campaigns, writes copy, analyzes performance metrics, and grows your brand across every channel.",
    tier: "Expert",
    color: "var(--purple)",
  },
  {
    icon: <HeadphonesIcon size={22} />,
    title: "Customer Support",
    desc: "Resolves issues fast, builds knowledge bases, turns frustrated customers into loyal advocates.",
    tier: "Expert",
    color: "var(--blue)",
  },
  {
    icon: <TrendingUp size={22} />,
    title: "Sales Rep",
    desc: "Finds prospects, writes outreach that gets replies, qualifies leads, and fills the pipeline.",
    tier: "Expert",
    color: "var(--green)",
  },
  {
    icon: <Settings size={22} />,
    title: "COO",
    desc: "Runs the machine — designs processes, coordinates teams, tracks KPIs, and turns strategy into execution.",
    tier: "Expert",
    color: "var(--orange)",
  },
  {
    icon: <Code size={22} />,
    title: "Software Engineer",
    desc: "Writes clean, tested code. Reviews PRs, debugs issues, and makes sound architecture decisions.",
    tier: "Expert",
    color: "var(--text)",
  },
  {
    icon: <BarChart3 size={22} />,
    title: "Data Analyst",
    desc: "Turns raw data into insights that drive decisions. Builds dashboards and tells the story behind the numbers.",
    tier: "Expert",
    color: "var(--blue)",
  },
  {
    icon: <PenTool size={22} />,
    title: "Content Writer",
    desc: "Writes blog posts, articles, emails, and social content that engages readers and ranks in search.",
    tier: "Senior",
    color: "var(--purple)",
  },
  {
    icon: <ClipboardList size={22} />,
    title: "Executive Assistant",
    desc: "Manages calendars, handles communications, organizes information, and keeps everything on schedule.",
    tier: "Senior",
    color: "var(--green)",
  },
  {
    icon: <Search size={22} />,
    title: "SEO Manager",
    desc: "Drives organic traffic through technical SEO, content strategy, and search-first thinking.",
    tier: "Expert",
    color: "var(--orange)",
  },
  {
    icon: <Microscope size={22} />,
    title: "Research Analyst",
    desc: "Conducts deep research, analyzes markets, and synthesizes complex information into actionable reports.",
    tier: "Expert",
    color: "var(--red)",
  },
];

const CAPABILITIES = [
  {
    icon: <Globe size={20} />,
    title: "Web Browsing",
    desc: "Visit websites, fill forms, extract data",
  },
  {
    icon: <Mail size={20} />,
    title: "Email",
    desc: "Read inbox, compose emails, manage threads",
  },
  {
    icon: <MessageSquare size={20} />,
    title: "Slack & Teams",
    desc: "Join channels, respond to messages, collaborate",
  },
  {
    icon: <Smartphone size={20} />,
    title: "WhatsApp",
    desc: "Send messages, handle customer conversations",
  },
  {
    icon: <Search size={20} />,
    title: "Internet Search",
    desc: "Find information, news, and answers online",
  },
  {
    icon: <Code size={20} />,
    title: "Code Execution",
    desc: "Execute scripts, install packages, use terminal",
  },
  {
    icon: <FileText size={20} />,
    title: "Documents & PDFs",
    desc: "Generate reports, read documents, organize files",
  },
  {
    icon: <Image size={20} />,
    title: "Image Generation",
    desc: "Generate, edit, and analyze visual content",
  },
  {
    icon: <Video size={20} />,
    title: "Video Generation",
    desc: "Create AI-generated video clips from text prompts",
  },
  {
    icon: <Phone size={20} />,
    title: "Phone Calls",
    desc: "Place and receive voice calls autonomously",
  },
  {
    icon: <Calendar size={20} />,
    title: "Scheduling",
    desc: "Set up automated routines and reminders",
  },
  {
    icon: <Brain size={20} />,
    title: "Memory",
    desc: "Recall conversations, contacts, and context",
  },
];

const TIERS = [
  {
    name: "Junior",
    price: 99,
    model: "Claude Haiku 4.5",
    subtitle: "Fast & affordable",
    credits: 25,
    features: [
      "Email & Slack included",
      "Web browsing & search",
      "File management",
      "25 credits/month",
    ],
  },
  {
    name: "Senior",
    price: 299,
    model: "Claude Sonnet 4.5",
    subtitle: "Balanced power",
    credits: 100,
    popular: true,
    features: [
      "Everything in Junior",
      "Code execution",
      "PDF generation",
      "Telegram & Discord free",
      "100 credits/month",
    ],
  },
  {
    name: "Expert",
    price: 799,
    model: "Claude Opus 4.6",
    subtitle: "Maximum capability",
    credits: 300,
    features: [
      "Everything in Senior",
      "Image & video generation",
      "All channels included",
      "All expertise unlocked",
      "300 credits/month",
    ],
  },
];

const STATS = [
  { value: 24, suffix: "/7", label: "Always working" },
  { value: 10, suffix: "+", label: "Role templates" },
  { value: 12, suffix: "+", label: "Integrations" },
  { value: 2, suffix: "min", label: "To deploy" },
];

const TESTIMONIALS = [
  {
    quote:
      "We replaced three contractor roles with Blitzer employees. They work around the clock, never miss a deadline, and cost a fraction of what we were paying.",
    name: "Sarah Chen",
    role: "VP of Operations",
    company: "Meridian Labs",
  },
  {
    quote:
      "Our AI sales rep qualifies more leads before 9am than our human team does all day. The ROI was obvious within the first week.",
    name: "James Rodriguez",
    role: "Head of Sales",
    company: "Vantage Growth",
  },
  {
    quote:
      "The isolation model is what sold us. Each employee has their own environment — no data leaks, no cross-contamination. It&apos;s exactly what we needed for compliance.",
    name: "Priya Sharma",
    role: "CTO",
    company: "SecureFlow",
  },
];

const FAQS = [
  {
    question: "What exactly is an AI employee?",
    answer:
      "An AI employee is a fully autonomous AI agent that gets its own isolated workstation — complete with email, browser, Slack, terminal, and file system. It works 24/7, learns your business context, and performs real tasks just like a human employee would. Each employee is powered by Anthropic's Claude models and runs on our OpenClaw isolation platform.",
  },
  {
    question: "How is this different from ChatGPT or other AI tools?",
    answer:
      "Unlike chatbots that only respond when prompted, Blitzer employees are always-on agents with persistent memory and real tools. They have their own computer environment, can browse the web, send emails, write code, make phone calls, and more. They don't just chat — they work.",
  },
  {
    question: "Is my data secure?",
    answer:
      "Absolutely. Each AI employee runs in a fully isolated environment with no shared state between employees or companies. We use enterprise-grade encryption, dedicated compute instances per company, and strict access controls. Your data never leaves your employee's isolated workstation.",
  },
  {
    question: "Can I try it before committing?",
    answer:
      "Yes. You can deploy your first AI employee without a credit card and explore the platform freely. When you're ready to scale, choose a plan that fits your needs. You can add or remove employees at any time — billing adjusts automatically with prorated charges.",
  },
  {
    question: "What happens if I need to scale up quickly?",
    answer:
      "Scaling is instant. You can add new AI employees in under 2 minutes, each with their own role, capabilities, and workstation. There's no onboarding period, no training time — they're productive from minute one. Billing adjusts automatically.",
  },
  {
    question: "Do AI employees work with my existing tools?",
    answer:
      "Yes. Blitzer employees integrate with Slack, Microsoft Teams, email, WhatsApp, Telegram, Discord, and more. They can browse any website, use your Chrome session via our extension, execute code, generate documents, and interact with virtually any web-based tool your team uses.",
  },
];

const USE_CASES = [
  {
    icon: <Megaphone size={24} />,
    title: "Marketing & Growth",
    desc: "Run campaigns across channels, write SEO-optimized content, analyze performance metrics, and manage your social presence — all on autopilot.",
    stats: "3x content output",
  },
  {
    icon: <HeadphonesIcon size={24} />,
    title: "Customer Support",
    desc: "Respond to tickets in seconds, build knowledge bases, handle multi-channel support, and turn frustrated customers into advocates — 24/7.",
    stats: "90% faster response",
  },
  {
    icon: <TrendingUp size={24} />,
    title: "Sales & Outreach",
    desc: "Prospect on LinkedIn, write personalized outreach, qualify inbound leads, update your CRM, and fill the pipeline while your team sleeps.",
    stats: "5x more leads",
  },
  {
    icon: <Code size={24} />,
    title: "Engineering",
    desc: "Write and review code, fix bugs, manage pull requests, run tests, and ship features faster with an AI engineer that never takes a break.",
    stats: "2x ship speed",
  },
];

/* ─── Page ────────────────────────────────────────── */
export default function LandingPage() {
  const [navScrolled, setNavScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
            <a href="#use-cases" className="lp-nav-link">
              Use Cases
            </a>
            <a href="#roles" className="lp-nav-link">
              Roles
            </a>
            <a href="#capabilities" className="lp-nav-link">
              Capabilities
            </a>
            <a href="#pricing" className="lp-nav-link">
              Pricing
            </a>
            <a href="#faq" className="lp-nav-link">
              FAQ
            </a>
          </div>
          <div className="lp-nav-actions">
            <a
              href="/blitzer-chrome-extension.zip"
              download
              className="lp-nav-link"
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <Chrome size={14} /> Extension
            </a>
            <Link href="/login" className="lp-nav-link">
              Sign In
            </Link>
            <Link href="/register" className="lp-btn-primary">
              Start Free <ArrowRight size={14} />
            </Link>
          </div>
          <button
            className="lp-mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Layers size={20} />}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="lp-mobile-menu">
            <a href="#use-cases" className="lp-mobile-link" onClick={() => setMobileMenuOpen(false)}>Use Cases</a>
            <a href="#roles" className="lp-mobile-link" onClick={() => setMobileMenuOpen(false)}>Roles</a>
            <a href="#capabilities" className="lp-mobile-link" onClick={() => setMobileMenuOpen(false)}>Capabilities</a>
            <a href="#pricing" className="lp-mobile-link" onClick={() => setMobileMenuOpen(false)}>Pricing</a>
            <a href="#faq" className="lp-mobile-link" onClick={() => setMobileMenuOpen(false)}>FAQ</a>
            <hr className="lp-mobile-divider" />
            <Link href="/login" className="lp-mobile-link" onClick={() => setMobileMenuOpen(false)}>Sign In</Link>
            <Link href="/register" className="lp-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={() => setMobileMenuOpen(false)}>
              Start Free <ArrowRight size={14} />
            </Link>
          </div>
        )}
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
              Hire an AI
              <br />
              <TypingText
                texts={[
                  "Marketing Manager",
                  "Software Engineer",
                  "Sales Rep",
                  "Data Analyst",
                  "Customer Support",
                  "Executive Assistant",
                ]}
              />
            </h1>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="lp-hero-sub">
              Deploy autonomous AI employees that get their own workstation,
              tools, and credentials. They work 24/7, learn your business, and
              scale instantly — from one employee to one hundred.
            </p>
          </Reveal>
          <Reveal delay={0.3}>
            <div className="lp-hero-actions">
              <Link href="/register" className="lp-btn-primary lp-btn-lg">
                Start Hiring Free <ArrowRight size={16} />
              </Link>
              <a href="#how-it-works" className="lp-btn-secondary lp-btn-lg">
                <Play size={14} /> Watch Demo
              </a>
            </div>
          </Reveal>
          <Reveal delay={0.4}>
            <p className="lp-hero-note">
              No credit card required &middot; Deploy in under 2 minutes &middot; Cancel
              anytime
            </p>
          </Reveal>
        </div>

        {/* Floating role cards */}
        <div className="lp-hero-float">
          <Reveal delay={0.5} direction="scale">
            <div className="lp-float-card lp-float-1">
              <div className="lp-float-icon-wrap" style={{ background: "var(--purple-muted)", color: "var(--purple)" }}>
                <Megaphone size={18} />
              </div>
              <div>
                <div className="lp-float-name">Marketing Manager</div>
                <div className="lp-float-status">
                  <span className="lp-status-dot-green" /> Active &middot; 3 tasks
                  running
                </div>
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.6} direction="scale">
            <div className="lp-float-card lp-float-2">
              <div className="lp-float-icon-wrap" style={{ background: "rgba(10,10,10,0.06)", color: "var(--text)" }}>
                <Code size={18} />
              </div>
              <div>
                <div className="lp-float-name">Software Engineer</div>
                <div className="lp-float-status">
                  <span className="lp-status-dot-green" /> Active &middot; Reviewing
                  PR #47
                </div>
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.7} direction="scale">
            <div className="lp-float-card lp-float-3">
              <div className="lp-float-icon-wrap" style={{ background: "var(--green-muted)", color: "var(--green)" }}>
                <TrendingUp size={18} />
              </div>
              <div>
                <div className="lp-float-name">Sales Rep</div>
                <div className="lp-float-status">
                  <span className="lp-status-dot-green" /> Active &middot; 12 leads
                  qualified
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Social proof bar ──────────────────── */}
      <section className="lp-social-proof">
        <Reveal>
          <p className="lp-proof-label">
            Trusted by forward-thinking teams worldwide
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="lp-proof-logos">
            {[
              "Meridian Labs",
              "Vantage Growth",
              "SecureFlow",
              "NovaTech",
              "Apex Digital",
              "Stratos AI",
            ].map((name) => (
              <div key={name} className="lp-proof-logo">
                {name}
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ── Stats bar ─────────────────────────── */}
      <section className="lp-stats">
        {STATS.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.1} className="lp-stat">
            <div className="lp-stat-value">
              <Counter end={s.value} suffix={s.suffix} />
            </div>
            <div className="lp-stat-label">{s.label}</div>
          </Reveal>
        ))}
      </section>

      {/* ── How it works ──────────────────────── */}
      <section className="lp-section" id="how-it-works">
        <Reveal>
          <div className="lp-section-header">
            <span className="lp-section-label">How It Works</span>
            <h2 className="lp-section-title">
              Three steps to your AI workforce
            </h2>
            <p className="lp-section-sub">
              From choosing a role to a fully operational employee in under two
              minutes.
            </p>
          </div>
        </Reveal>
        <div className="lp-steps">
          {[
            {
              num: "01",
              icon: <Users size={28} />,
              title: "Choose a Role",
              desc: "Pick from 10+ pre-built role templates — Marketing Manager, Software Engineer, Sales Rep, and more. Each comes with a crafted persona, goals, and personality.",
            },
            {
              num: "02",
              icon: <Settings size={28} />,
              title: "Customize & Equip",
              desc: "Select a tier (Junior, Senior, Expert), add channels like Slack, email, WhatsApp, and enable capabilities like code execution, image generation, or scheduling.",
            },
            {
              num: "03",
              icon: <Rocket size={28} />,
              title: "Deploy & Scale",
              desc: "Your AI employee gets their own isolated workstation and starts working immediately. Add more employees anytime — billing adjusts automatically.",
            },
          ].map((step, i) => (
            <Reveal key={step.num} delay={i * 0.15} className="lp-step">
              <div className="lp-step-icon">{step.icon}</div>
              <div className="lp-step-num">{step.num}</div>
              <h3 className="lp-step-title">{step.title}</h3>
              <p className="lp-step-desc">{step.desc}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Use Cases ─────────────────────────── */}
      <section className="lp-section lp-section-alt" id="use-cases">
        <Reveal>
          <div className="lp-section-header">
            <span className="lp-section-label">Use Cases</span>
            <h2 className="lp-section-title">
              Built for every team, every workflow
            </h2>
            <p className="lp-section-sub">
              From marketing to engineering, Blitzer employees handle the work
              that keeps your business moving forward.
            </p>
          </div>
        </Reveal>
        <div className="lp-use-cases-grid">
          {USE_CASES.map((uc, i) => (
            <Reveal
              key={uc.title}
              delay={i * 0.1}
              direction="up"
              className="lp-use-case-card"
            >
              <div className="lp-use-case-icon">{uc.icon}</div>
              <h3 className="lp-use-case-title">{uc.title}</h3>
              <p className="lp-use-case-desc">{uc.desc}</p>
              <div className="lp-use-case-stat">
                <Zap size={14} />
                {uc.stats}
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Dashboard Preview ─────────────────── */}
      <section className="lp-section">
        <Reveal>
          <div className="lp-section-header">
            <span className="lp-section-label">The Platform</span>
            <h2 className="lp-section-title">
              Everything you need to manage your AI team
            </h2>
            <p className="lp-section-sub">
              A purpose-built dashboard to hire, configure, monitor, and
              communicate with your AI employees.
            </p>
          </div>
        </Reveal>
        <Reveal delay={0.15} direction="scale">
          <div className="lp-dashboard-preview">
            <div className="lp-dash-sidebar">
              <div className="lp-dash-sidebar-logo">
                <div
                  className="lp-logo-mark"
                  style={{ width: 24, height: 24, fontSize: 9, borderRadius: 6 }}
                >
                  B
                </div>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Blitzer</span>
              </div>
              <div className="lp-dash-sidebar-nav">
                <div className="lp-dash-nav-item lp-dash-nav-active">
                  <Users size={14} /> Employees
                </div>
                <div className="lp-dash-nav-item">
                  <MessageSquare size={14} /> Inbox
                </div>
                <div className="lp-dash-nav-item">
                  <ClipboardList size={14} /> Tasks
                </div>
                <div className="lp-dash-nav-item">
                  <FileText size={14} /> Documents
                </div>
                <div className="lp-dash-nav-item">
                  <BarChart3 size={14} /> Analytics
                </div>
              </div>
            </div>
            <div className="lp-dash-main">
              <div className="lp-dash-header">
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.02em" }}>
                    Your Employees
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                    3 active &middot; 1 paused
                  </div>
                </div>
                <div
                  className="lp-btn-primary"
                  style={{ height: 32, padding: "0 14px", fontSize: 12 }}
                >
                  + Hire Employee
                </div>
              </div>
              <div className="lp-dash-employees">
                {[
                  {
                    name: "Marketing Manager",
                    icon: <Megaphone size={16} />,
                    status: "Active",
                    tasks: "Writing blog post",
                    color: "var(--purple)",
                  },
                  {
                    name: "Software Engineer",
                    icon: <Code size={16} />,
                    status: "Active",
                    tasks: "Reviewing PR #47",
                    color: "var(--text)",
                  },
                  {
                    name: "Sales Rep",
                    icon: <TrendingUp size={16} />,
                    status: "Active",
                    tasks: "Qualifying 5 leads",
                    color: "var(--green)",
                  },
                  {
                    name: "Data Analyst",
                    icon: <BarChart3 size={16} />,
                    status: "Paused",
                    tasks: "—",
                    color: "var(--blue)",
                  },
                ].map((emp) => (
                  <div key={emp.name} className="lp-dash-emp-row">
                    <div className="lp-dash-emp-info">
                      <div
                        className="lp-dash-emp-icon"
                        style={{ color: emp.color }}
                      >
                        {emp.icon}
                      </div>
                      <div>
                        <div className="lp-dash-emp-name">{emp.name}</div>
                        <div className="lp-dash-emp-task">{emp.tasks}</div>
                      </div>
                    </div>
                    <div
                      className={`lp-dash-emp-status ${emp.status === "Active" ? "lp-dash-status-active" : "lp-dash-status-paused"}`}
                    >
                      <span className="lp-dash-status-dot" />
                      {emp.status}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Roles ─────────────────────────────── */}
      <section className="lp-section lp-section-alt" id="roles">
        <Reveal>
          <div className="lp-section-header">
            <span className="lp-section-label">Pre-built Roles</span>
            <h2 className="lp-section-title">
              An employee for every function
            </h2>
            <p className="lp-section-sub">
              Each role comes with a crafted persona, domain expertise, goals,
              and personality. Choose one and deploy instantly.
            </p>
          </div>
        </Reveal>
        <div className="lp-roles-grid">
          {ROLES.map((role, i) => (
            <Reveal
              key={role.title}
              delay={i * 0.06}
              direction="up"
              className="lp-role-card"
            >
              <div
                className="lp-role-icon"
                style={{ color: role.color }}
              >
                {role.icon}
              </div>
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
            <h2 className="lp-section-title">
              Everything they need, built in
            </h2>
            <p className="lp-section-sub">
              Every employee gets their own isolated environment with real tools
              — not just chat. They browse the web, send emails, write code, and
              more.
            </p>
          </div>
        </Reveal>
        <div className="lp-cap-grid">
          {CAPABILITIES.map((cap, i) => (
            <Reveal
              key={cap.title}
              delay={i * 0.05}
              direction="up"
              className="lp-cap-card"
            >
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
            <h2 className="lp-feature-title">
              Each employee gets their own computer
            </h2>
            <p className="lp-feature-desc">
              Every AI employee runs in a fully isolated environment — their own
              filesystem, browser, email client, and terminal. No shared state,
              no cross-contamination. Just like giving a new hire their own
              laptop on day one.
            </p>
            <ul className="lp-feature-list">
              <li>
                <Check size={16} /> Dedicated isolated workstation
              </li>
              <li>
                <Check size={16} /> Persistent memory across conversations
              </li>
              <li>
                <Check size={16} /> Secure — no data leaks between employees
              </li>
              <li>
                <Check size={16} /> Full internet access and tool usage
              </li>
            </ul>
          </Reveal>
          <Reveal direction="right" delay={0.2} className="lp-feature-visual">
            <div className="lp-terminal">
              <div className="lp-terminal-bar">
                <span className="lp-terminal-dot lp-dot-red" />
                <span className="lp-terminal-dot lp-dot-yellow" />
                <span className="lp-terminal-dot lp-dot-green" />
                <span className="lp-terminal-title">
                  marketing-manager@blitzer
                </span>
              </div>
              <div className="lp-terminal-body">
                <div className="lp-terminal-line">
                  <span className="lp-t-prompt">$</span> checking inbox...
                </div>
                <div className="lp-terminal-line lp-t-dim">
                  &nbsp;&nbsp;3 new emails from leads
                </div>
                <div className="lp-terminal-line">
                  <span className="lp-t-prompt">$</span> drafting campaign
                  brief...
                </div>
                <div className="lp-terminal-line lp-t-dim">
                  &nbsp;&nbsp;Q1 launch campaign ready
                </div>
                <div className="lp-terminal-line">
                  <span className="lp-t-prompt">$</span> posting to Slack
                  #marketing...
                </div>
                <div className="lp-terminal-line lp-t-success">
                  &nbsp;&nbsp;Sent campaign brief for review
                </div>
                <div className="lp-terminal-line">
                  <span className="lp-t-prompt">$</span> analyzing SEO
                  metrics...
                </div>
                <div className="lp-terminal-line lp-t-dim">
                  &nbsp;&nbsp;Organic traffic up 23% MoM
                </div>
                <div className="lp-terminal-line lp-terminal-cursor">
                  <span className="lp-t-prompt">$</span>{" "}
                  <span className="lp-blink">_</span>
                </div>
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
            <h2 className="lp-feature-title">
              24/7 workforce that never stops
            </h2>
            <p className="lp-feature-desc">
              Your AI employees work around the clock. No sick days, no
              vacations, no timezone constraints. They respond to customers at
              3am, process leads while you sleep, and ship code over the
              weekend.
            </p>
            <ul className="lp-feature-list">
              <li>
                <Check size={16} /> No downtime — ever
              </li>
              <li>
                <Check size={16} /> Responds in seconds, not hours
              </li>
              <li>
                <Check size={16} /> Scales from 1 to 100 employees instantly
              </li>
              <li>
                <Check size={16} /> Proactive — finds work, doesn&apos;t wait
              </li>
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
                  <div className="lp-clock-value">
                    24<span>/7</span>
                  </div>
                  <div className="lp-clock-label">Always Active</div>
                </div>
              </div>
              <div className="lp-clock-items">
                <div className="lp-clock-item lp-ci-1">
                  Replying to customer email
                </div>
                <div className="lp-clock-item lp-ci-2">
                  Analyzing weekly metrics
                </div>
                <div className="lp-clock-item lp-ci-3">
                  Pushing PR to GitHub
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Security & Trust ──────────────────── */}
      <section className="lp-section lp-section-alt" id="security">
        <Reveal>
          <div className="lp-section-header">
            <span className="lp-section-label">Security & Trust</span>
            <h2 className="lp-section-title">
              Enterprise-grade security, built in
            </h2>
            <p className="lp-section-sub">
              Your data stays yours. Every AI employee runs in a hardened,
              isolated environment with no shared state.
            </p>
          </div>
        </Reveal>
        <div className="lp-security-grid">
          {[
            {
              icon: <Shield size={24} />,
              title: "Fully Isolated Environments",
              desc: "Each employee runs in its own sandboxed workstation. No data leaks between employees or companies.",
            },
            {
              icon: <Lock size={24} />,
              title: "Encrypted at Rest & In Transit",
              desc: "All data is encrypted using industry-standard protocols. Communications are secured end-to-end.",
            },
            {
              icon: <Server size={24} />,
              title: "Dedicated Compute",
              desc: "Each company gets dedicated infrastructure. No multi-tenant compute, no shared resources.",
            },
            {
              icon: <Cpu size={24} />,
              title: "Powered by OpenClaw",
              desc: "Our custom isolation runtime ensures each AI employee operates in a fully contained environment.",
            },
          ].map((item, i) => (
            <Reveal
              key={item.title}
              delay={i * 0.1}
              direction="up"
              className="lp-security-card"
            >
              <div className="lp-security-icon">{item.icon}</div>
              <h3 className="lp-security-title">{item.title}</h3>
              <p className="lp-security-desc">{item.desc}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Testimonials ──────────────────────── */}
      <section className="lp-section" id="testimonials">
        <Reveal>
          <div className="lp-section-header">
            <span className="lp-section-label">Testimonials</span>
            <h2 className="lp-section-title">
              Loved by teams who ship fast
            </h2>
            <p className="lp-section-sub">
              See what leaders across industries say about their AI workforce.
            </p>
          </div>
        </Reveal>
        <div className="lp-testimonials-grid">
          {TESTIMONIALS.map((t, i) => (
            <Reveal
              key={t.name}
              delay={i * 0.12}
              direction="up"
              className="lp-testimonial-card"
            >
              <div className="lp-testimonial-stars">
                {[...Array(5)].map((_, j) => (
                  <Star key={j} size={14} fill="currentColor" />
                ))}
              </div>
              <p className="lp-testimonial-quote">&ldquo;{t.quote}&rdquo;</p>
              <div className="lp-testimonial-author">
                <div className="lp-testimonial-avatar">
                  {t.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </div>
                <div>
                  <div className="lp-testimonial-name">{t.name}</div>
                  <div className="lp-testimonial-role">
                    {t.role}, {t.company}
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Pricing ───────────────────────────── */}
      <section className="lp-section lp-section-alt" id="pricing">
        <Reveal>
          <div className="lp-section-header">
            <span className="lp-section-label">Pricing</span>
            <h2 className="lp-section-title">
              Simple, per-employee pricing
            </h2>
            <p className="lp-section-sub">
              One subscription per company. Add or remove employees anytime —
              billing adjusts automatically with prorated charges.
            </p>
          </div>
        </Reveal>
        <div className="lp-pricing-grid">
          {TIERS.map((tier, i) => (
            <Reveal
              key={tier.name}
              delay={i * 0.12}
              direction="up"
              className={`lp-price-card ${tier.popular ? "lp-price-popular" : ""}`}
            >
              {tier.popular && (
                <div className="lp-price-badge">Most Popular</div>
              )}
              <div className="lp-price-name">{tier.name}</div>
              <div className="lp-price-model">{tier.model}</div>
              <div className="lp-price-subtitle">{tier.subtitle}</div>
              <div className="lp-price-amount">
                <span className="lp-price-dollar">$</span>
                <span className="lp-price-num">{tier.price}</span>
                <span className="lp-price-period">/mo</span>
              </div>
              <div className="lp-price-per">per employee</div>
              <Link
                href="/register"
                className={`lp-btn-price ${tier.popular ? "lp-btn-price-primary" : ""}`}
              >
                Get Started <ArrowRight size={14} />
              </Link>
              <ul className="lp-price-features">
                {tier.features.map((f) => (
                  <li key={f}>
                    <Check size={14} /> {f}
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>

        {/* Add-ons */}
        <Reveal>
          <div className="lp-addons">
            <div className="lp-addons-title">Customize with add-ons</div>
            <div className="lp-addons-subtitle">
              Extend any employee with extra channels, capabilities, and
              expertise. Higher tiers include more for free.
            </div>
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
                    <span
                      className={`lp-addon-price ${a.price === "Included" ? "lp-addon-free" : ""}`}
                    >
                      {a.price}
                    </span>
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
                    <span
                      className={`lp-addon-price ${a.price === "Included" ? "lp-addon-free" : ""}`}
                    >
                      {a.price}
                    </span>
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
                    <span
                      className={`lp-addon-price ${a.price === "Included" ? "lp-addon-free" : ""}`}
                    >
                      {a.price}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Comparison ────────────────────────── */}
      <section className="lp-section" id="comparison">
        <Reveal>
          <div className="lp-section-header">
            <span className="lp-section-label">Why Blitzer</span>
            <h2 className="lp-section-title">
              How we compare
            </h2>
            <p className="lp-section-sub">
              Blitzer isn&apos;t a chatbot. It&apos;s a fully autonomous workforce platform
              that replaces the need for contractors, part-time hires, and manual
              grunt work.
            </p>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="lp-comparison-table">
            <div className="lp-comp-header">
              <div className="lp-comp-feature">Feature</div>
              <div className="lp-comp-col lp-comp-highlight">Blitzer</div>
              <div className="lp-comp-col">Chatbots</div>
              <div className="lp-comp-col">Freelancers</div>
            </div>
            {[
              {
                feature: "24/7 availability",
                blitzer: true,
                chatbots: true,
                freelancers: false,
              },
              {
                feature: "Own workstation & tools",
                blitzer: true,
                chatbots: false,
                freelancers: false,
              },
              {
                feature: "Persistent memory",
                blitzer: true,
                chatbots: false,
                freelancers: true,
              },
              {
                feature: "Proactive task execution",
                blitzer: true,
                chatbots: false,
                freelancers: true,
              },
              {
                feature: "Multi-channel (email, Slack, etc.)",
                blitzer: true,
                chatbots: false,
                freelancers: true,
              },
              {
                feature: "Instant scaling",
                blitzer: true,
                chatbots: true,
                freelancers: false,
              },
              {
                feature: "Under $1/hour effective cost",
                blitzer: true,
                chatbots: true,
                freelancers: false,
              },
              {
                feature: "Isolated & secure",
                blitzer: true,
                chatbots: false,
                freelancers: false,
              },
            ].map((row) => (
              <div key={row.feature} className="lp-comp-row">
                <div className="lp-comp-feature">{row.feature}</div>
                <div className="lp-comp-col lp-comp-highlight">
                  {row.blitzer ? (
                    <Check size={16} className="lp-comp-check" />
                  ) : (
                    <X size={16} className="lp-comp-x" />
                  )}
                </div>
                <div className="lp-comp-col">
                  {row.chatbots ? (
                    <Check size={16} className="lp-comp-check" />
                  ) : (
                    <X size={16} className="lp-comp-x" />
                  )}
                </div>
                <div className="lp-comp-col">
                  {row.freelancers ? (
                    <Check size={16} className="lp-comp-check" />
                  ) : (
                    <X size={16} className="lp-comp-x" />
                  )}
                </div>
              </div>
            ))}
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
              Install the Blitzer AI Chrome extension to let your AI employees
              browse the web using your real browser session. They can bypass bot
              detection, use your logged-in accounts, and interact with any
              website — just like you would.
            </p>
            <ul className="lp-feature-list">
              <li>
                <Check size={16} /> Uses your real Chrome session
              </li>
              <li>
                <Check size={16} /> Bypasses bot detection &amp; CAPTCHAs
              </li>
              <li>
                <Check size={16} /> Access sites behind your logins
              </li>
              <li>
                <Check size={16} /> One-click connect from the dashboard
              </li>
            </ul>
            <div style={{ marginTop: 24 }}>
              <a
                href="/blitzer-chrome-extension.zip"
                download
                className="lp-btn-primary lp-btn-lg"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Download size={16} /> Download Extension
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
                <div className="lp-terminal-line">
                  <span className="lp-t-prompt">1.</span> Download the extension
                  (.zip)
                </div>
                <div className="lp-terminal-line">
                  <span className="lp-t-prompt">2.</span> Unzip and open{" "}
                  <span className="lp-t-success">chrome://extensions</span>
                </div>
                <div className="lp-terminal-line">
                  <span className="lp-t-prompt">3.</span> Enable &quot;Developer
                  mode&quot;
                </div>
                <div className="lp-terminal-line">
                  <span className="lp-t-prompt">4.</span> Click &quot;Load
                  unpacked&quot; → select folder
                </div>
                <div className="lp-terminal-line">
                  <span className="lp-t-prompt">5.</span> Copy the Extension ID
                </div>
                <div
                  className="lp-terminal-line lp-t-dim"
                  style={{ marginTop: 8 }}
                >
                  Then in the dashboard:
                </div>
                <div className="lp-terminal-line">
                  <span className="lp-t-prompt">6.</span> Go to employee →
                  Browser Relay
                </div>
                <div className="lp-terminal-line">
                  <span className="lp-t-prompt">7.</span> Click &quot;Connect
                  Chrome Extension&quot;
                </div>
                <div
                  className="lp-terminal-line lp-t-success"
                  style={{ marginTop: 8 }}
                >
                  &nbsp;&nbsp;✓ Connected — browsing with your session
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────── */}
      <section className="lp-section" id="faq">
        <Reveal>
          <div className="lp-section-header">
            <span className="lp-section-label">FAQ</span>
            <h2 className="lp-section-title">Frequently asked questions</h2>
            <p className="lp-section-sub">
              Everything you need to know about Blitzer and AI employees.
            </p>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="lp-faq-list">
            {FAQS.map((faq) => (
              <FAQItem
                key={faq.question}
                question={faq.question}
                answer={faq.answer}
              />
            ))}
          </div>
        </Reveal>
      </section>

      {/* ── Final CTA ─────────────────────────── */}
      <section className="lp-cta">
        <div className="lp-cta-glow" />
        <Reveal>
          <h2 className="lp-cta-title">Ready to build your AI team?</h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="lp-cta-sub">
            Deploy your first AI employee in under 2 minutes.
            <br />
            No credit card required. Cancel anytime.
          </p>
        </Reveal>
        <Reveal delay={0.2}>
          <div className="lp-cta-actions">
            <Link href="/register" className="lp-btn-primary lp-btn-xl">
              Start Hiring Free <ArrowRight size={18} />
            </Link>
          </div>
        </Reveal>
        <Reveal delay={0.3}>
          <div className="lp-cta-trust">
            <div className="lp-cta-trust-item">
              <Shield size={14} /> Enterprise-grade security
            </div>
            <div className="lp-cta-trust-item">
              <Clock size={14} /> Deploy in 2 minutes
            </div>
            <div className="lp-cta-trust-item">
              <Users size={14} /> Scale to 100+ employees
            </div>
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
            <p className="lp-footer-tagline">
              The AI workforce platform.
              <br />
              Hire autonomous employees that work 24/7.
              <br />
              Powered by OpenClaw.
            </p>
          </div>
          <div className="lp-footer-links">
            <div className="lp-footer-col">
              <div className="lp-footer-heading">Product</div>
              <a href="#roles">Roles</a>
              <a href="#capabilities">Capabilities</a>
              <a href="#pricing">Pricing</a>
              <a href="#extension">Chrome Extension</a>
            </div>
            <div className="lp-footer-col">
              <div className="lp-footer-heading">Resources</div>
              <a href="#how-it-works">How It Works</a>
              <a href="#use-cases">Use Cases</a>
              <a href="#faq">FAQ</a>
              <a href="#comparison">Compare</a>
            </div>
            <div className="lp-footer-col">
              <div className="lp-footer-heading">Company</div>
              <Link href="/login">Sign In</Link>
              <Link href="/register">Get Started</Link>
              <a href="#security">Security</a>
              <a href="#testimonials">Customers</a>
            </div>
          </div>
        </div>
        <div className="lp-footer-bottom">
          <p>
            &copy; {new Date().getFullYear()} Blitzer. All rights reserved.
          </p>
          <div className="lp-footer-bottom-links">
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
            <a href="#">Cookie Policy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
