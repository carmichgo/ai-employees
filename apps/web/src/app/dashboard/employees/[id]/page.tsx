"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import {
  ArrowLeft, Pause, Play, Trash2, Loader2, Server, Mail, Cpu, Clock, Calendar,
  MessageCircle, Save, X, Eye, EyeOff, ChevronDown, Upload, FileText, Zap,
  Webhook, Timer, Plus, ToggleLeft, ToggleRight, Copy, Check, KeyRound, Globe, Edit3,
  MessageSquare, Send, Smartphone, Gamepad2, Shield, MonitorSmartphone, Hash, Radio, Phone, Headphones,
} from "lucide-react";
import Link from "next/link";

const EMAIL_PROVIDERS: Record<string, { label: string; smtpHost: string; smtpPort: number; imapHost: string; imapPort: number; webmail: string; note?: string }> = {
  gmail: { label: "Google / Gmail", smtpHost: "smtp.gmail.com", smtpPort: 587, imapHost: "imap.gmail.com", imapPort: 993, webmail: "https://mail.google.com", note: "Use an App Password (Google Account > Security > App Passwords)" },
  outlook: { label: "Outlook / Hotmail", smtpHost: "smtp-mail.outlook.com", smtpPort: 587, imapHost: "outlook.office365.com", imapPort: 993, webmail: "https://outlook.live.com" },
  yahoo: { label: "Yahoo Mail", smtpHost: "smtp.mail.yahoo.com", smtpPort: 587, imapHost: "imap.mail.yahoo.com", imapPort: 993, webmail: "https://mail.yahoo.com", note: "Generate an App Password in Yahoo Account Security" },
  zoho: { label: "Zoho Mail", smtpHost: "smtp.zoho.com", smtpPort: 587, imapHost: "imap.zoho.com", imapPort: 993, webmail: "https://mail.zoho.com" },
  icloud: { label: "iCloud Mail", smtpHost: "smtp.mail.me.com", smtpPort: 587, imapHost: "imap.mail.me.com", imapPort: 993, webmail: "https://www.icloud.com/mail", note: "Generate an App-Specific Password in Apple ID settings" },
  custom: { label: "Other / Custom", smtpHost: "", smtpPort: 587, imapHost: "", imapPort: 993, webmail: "" },
};

// ── Channel metadata ──────────────────────────────────

const CHANNEL_META: Record<string, {
  label: string;
  icon: any;
  fields: Array<{ key: string; label: string; placeholder: string; type?: string }>;
  helpText: string;
  helpUrl?: string;
}> = {
  telegram: {
    label: "Telegram",
    icon: Send,
    fields: [{ key: "token", label: "Bot Token", placeholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" }],
    helpText: "Create a bot via @BotFather on Telegram, then paste the token here.",
    helpUrl: "https://core.telegram.org/bots#botfather",
  },
  discord: {
    label: "Discord",
    icon: Gamepad2,
    fields: [{ key: "token", label: "Bot Token", placeholder: "MTIzNDU2Nzg5MDEyMzQ1Njc4OQ..." }],
    helpText: "Create a bot at Discord Developer Portal, copy the token from the Bot section.",
    helpUrl: "https://discord.com/developers/applications",
  },
  whatsapp: {
    label: "WhatsApp",
    icon: Smartphone,
    fields: [
      { key: "phoneNumberId", label: "Phone Number ID", placeholder: "1234567890" },
      { key: "accessToken", label: "Access Token", placeholder: "EAABsbCS..." },
    ],
    helpText: "Get credentials from Meta Business Suite > WhatsApp > API Setup. Or scan a QR code if using WhatsApp Web mode.",
    helpUrl: "https://business.facebook.com/",
  },
  signal: {
    label: "Signal",
    icon: Shield,
    fields: [
      { key: "number", label: "Phone Number", placeholder: "+1234567890" },
      { key: "apiUrl", label: "Signal API URL", placeholder: "http://localhost:8080" },
    ],
    helpText: "Requires a signal-cli REST API server running with a registered phone number.",
  },
  teams: {
    label: "Microsoft Teams",
    icon: MonitorSmartphone,
    fields: [
      { key: "appId", label: "Bot App ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
      { key: "appPassword", label: "Bot Password", placeholder: "Enter bot password", type: "password" },
      { key: "tenantId", label: "Tenant ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
    ],
    helpText: "Register a bot in Azure Bot Service, then paste the credentials here.",
    helpUrl: "https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
  },
  "google-chat": {
    label: "Google Chat",
    icon: MessageSquare,
    fields: [
      { key: "serviceAccountJson", label: "Service Account JSON", placeholder: '{"type": "service_account", ...}' },
      { key: "spaceId", label: "Space ID", placeholder: "spaces/AAAA..." },
    ],
    helpText: "Create a Google Chat bot in Google Cloud Console with a service account.",
    helpUrl: "https://console.cloud.google.com/",
  },
  matrix: {
    label: "Matrix",
    icon: Hash,
    fields: [
      { key: "homeserverUrl", label: "Homeserver URL", placeholder: "https://matrix.org" },
      { key: "accessToken", label: "Access Token", placeholder: "syt_..." },
    ],
    helpText: "Get an access token from your Matrix homeserver (Element > Settings > Help & About > Access Token).",
  },
  slack: {
    label: "Slack",
    icon: MessageSquare,
    fields: [],
    helpText: "Slack is connected via your company's Slack integration. No per-employee setup needed.",
  },
  email: {
    label: "Email",
    icon: Mail,
    fields: [],
    helpText: "Email is configured in the Email Account section below.",
  },
  phone: {
    label: "Phone (Twilio)",
    icon: Phone,
    fields: [],
    helpText: "Phone calling is configured in the Phone Number section below.",
  },
  "voice-chat": {
    label: "Web Voice Call",
    icon: Headphones,
    fields: [],
    helpText: "Voice calling through the dashboard — speak and your employee responds with voice in real time.",
  },
};

const TRIGGER_PRESETS = [
  { type: "schedule", name: "Check emails every 30 min", config: { cron: "*/30 * * * *", message: "Check your email inbox for new messages. Read them and respond to any that need a reply." } },
  { type: "schedule", name: "Daily standup report", config: { cron: "0 9 * * 1-5", message: "Prepare a brief daily standup report summarizing what you worked on yesterday, what you plan to do today, and any blockers." } },
  { type: "schedule", name: "Weekly summary", config: { cron: "0 17 * * 5", message: "Prepare a weekly summary of all work completed this week, key metrics, and priorities for next week." } },
  { type: "webhook", name: "GitHub webhook", config: { source: "github", message: "New GitHub event received: {{body}}" } },
  { type: "webhook", name: "Custom webhook", config: { source: "custom", message: "Webhook received: {{body}}" } },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function EmployeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [employee, setEmployee] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [hireBanner, setHireBanner] = useState<{ billed: boolean; price: string } | null>(null);

  // Email config state
  const [emailConfig, setEmailConfig] = useState<any>(null);
  const [emailEditing, setEmailEditing] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailProvider, setEmailProvider] = useState("gmail");
  const [emailAddress, setEmailAddress] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [customSmtp, setCustomSmtp] = useState("");
  const [customImap, setCustomImap] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailNotice, setEmailNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Files state
  const [files, setFiles] = useState<Array<{ name: string; size: number; uploadedAt: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [fileNotice, setFileNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Triggers state
  const [triggersList, setTriggersList] = useState<any[]>([]);
  const [showNewTrigger, setShowNewTrigger] = useState(false);
  const [newTriggerType, setNewTriggerType] = useState("schedule");
  const [newTriggerName, setNewTriggerName] = useState("");
  const [newTriggerCron, setNewTriggerCron] = useState("*/30 * * * *");
  const [newTriggerMessage, setNewTriggerMessage] = useState("");
  const [triggerSaving, setTriggerSaving] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Channels state
  const [channelsList, setChannelsList] = useState<any[]>([]);
  const [setupChannel, setSetupChannel] = useState<string | null>(null);
  const [channelForm, setChannelForm] = useState<Record<string, string>>({});
  const [channelSaving, setChannelSaving] = useState(false);
  const [channelNotice, setChannelNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Credentials state
  const [credentialsList, setCredentialsList] = useState<any[]>([]);
  const [showNewCred, setShowNewCred] = useState(false);
  const [editingCredId, setEditingCredId] = useState<string | null>(null);
  const [credLabel, setCredLabel] = useState("");
  const [credUsername, setCredUsername] = useState("");
  const [credPassword, setCredPassword] = useState("");
  const [credUrl, setCredUrl] = useState("");
  const [credNotes, setCredNotes] = useState("");
  const [showCredPassword, setShowCredPassword] = useState(false);
  const [credSaving, setCredSaving] = useState(false);
  const [credNotice, setCredNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const employeeId = params.id as string;

  // Show hire confirmation banner from URL params
  useEffect(() => {
    if (searchParams.get("hired") === "true") {
      setHireBanner({
        billed: searchParams.get("billed") === "true",
        price: searchParams.get("price") || "",
      });
      // Clean URL params without full reload
      window.history.replaceState({}, "", `/dashboard/employees/${employeeId}`);
    }
  }, [searchParams, employeeId]);

  useEffect(() => {
    api.getEmployee(employeeId).then((res) => {
      setEmployee(res.employee);
      setLoading(false);
    });
    api.getEmployeeEmail(employeeId).then((res) => {
      if (res.email) {
        setEmailConfig(res.email);
        setEmailAddress(res.email.address || "");
        setEmailProvider(res.email.provider || "gmail");
        if (res.email.provider === "custom") {
          setCustomSmtp(res.email.smtpHost || "");
          setCustomImap(res.email.imapHost || "");
        }
      }
    }).catch(() => {});
    api.listFiles(employeeId).then((res) => setFiles(res.files || [])).catch(() => {});
    api.listTriggers(employeeId).then((res) => setTriggersList(res.triggers || [])).catch(() => {});
    api.listCredentials(employeeId).then((res) => setCredentialsList(res.credentials || [])).catch(() => {});
    api.listChannels(employeeId).then((res) => setChannelsList(res.channels || [])).catch(() => {});
  }, [employeeId]);

  // Auto-poll while provisioning, with auto-reprovision for stuck employees
  const reprovisionAttempted = useRef(false);
  const provisioningStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (!employee || (employee.status !== "provisioning" && employee.status !== "onboarding")) {
      provisioningStartRef.current = null;
      reprovisionAttempted.current = false;
      return;
    }
    if (!provisioningStartRef.current) provisioningStartRef.current = Date.now();

    const interval = setInterval(async () => {
      try {
        const res = await api.getEmployee(employeeId);
        setEmployee(res.employee);

        // If still provisioning after 2 minutes, try reprovision once
        if (
          res.employee.status === "provisioning" &&
          !reprovisionAttempted.current &&
          provisioningStartRef.current &&
          Date.now() - provisioningStartRef.current > 120000
        ) {
          reprovisionAttempted.current = true;
          console.log("[auto-reprovision] Attempting reprovision for stuck employee", employeeId);
          fetch(`/api/employees/${employeeId}/reprovision`, { method: "POST" }).catch(() => {});
        }
      } catch {}
    }, 4000);
    return () => clearInterval(interval);
  }, [employee?.status, employeeId]);

  // ── Employee actions ──
  const handlePause = async () => {
    setActionLoading(true);
    const res = await api.pauseEmployee(employeeId);
    setEmployee(res.employee);
    setActionLoading(false);
  };
  const handleResume = async () => {
    setActionLoading(true);
    const res = await api.resumeEmployee(employeeId);
    setEmployee(res.employee);
    setActionLoading(false);
  };
  const handleTerminate = async () => {
    if (!confirm(`Are you sure you want to terminate ${employee.name}? This will shut down their workstation.`)) return;
    setActionLoading(true);
    try {
      await api.terminateEmployee(employeeId);
      router.push("/dashboard/employees");
    } catch (err: any) {
      alert(`Failed to terminate: ${err.message}`);
      setActionLoading(false);
    }
  };

  // ── Email handlers ──
  const handleSaveEmail = async () => {
    setEmailSaving(true);
    setEmailNotice(null);
    try {
      const preset = EMAIL_PROVIDERS[emailProvider];
      const smtpHost = emailProvider === "custom" ? customSmtp : preset.smtpHost;
      const imapHost = emailProvider === "custom" ? customImap : preset.imapHost;
      const res = await api.saveEmployeeEmail(employeeId, {
        provider: emailProvider, address: emailAddress, smtpHost,
        smtpPort: preset.smtpPort, imapHost: imapHost || smtpHost,
        imapPort: preset.imapPort, username: emailAddress, password: emailPassword,
      });
      setEmailConfig(res.email);
      setEmailEditing(false);
      setEmailPassword("");
      setEmailNotice({ type: "success", message: "Email credentials saved" });
      setEmployee((prev: any) => ({ ...prev, emailAddress }));
    } catch (err: any) {
      setEmailNotice({ type: "error", message: err.message });
    } finally {
      setEmailSaving(false);
    }
  };
  const handleRemoveEmail = async () => {
    if (!confirm("Remove email credentials? The employee will lose email access.")) return;
    try {
      await api.removeEmployeeEmail(employeeId);
      setEmailConfig(null); setEmailAddress(""); setEmailPassword(""); setEmailProvider("gmail");
      setCustomSmtp(""); setCustomImap(""); setEmailEditing(false);
      setEmailNotice({ type: "success", message: "Email credentials removed" });
    } catch (err: any) {
      setEmailNotice({ type: "error", message: err.message });
    }
  };

  // ── File handlers ──
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setFileNotice({ type: "error", message: "File too large (max 10MB)" });
      return;
    }
    setUploading(true);
    setFileNotice(null);
    try {
      await api.uploadFile(employeeId, file);
      const res = await api.listFiles(employeeId);
      setFiles(res.files || []);
      setFileNotice({ type: "success", message: `${file.name} uploaded` });
    } catch (err: any) {
      setFileNotice({ type: "error", message: err.message });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };
  const handleFileDelete = async (filename: string) => {
    if (!confirm(`Delete ${filename}?`)) return;
    try {
      await api.deleteFile(employeeId, filename);
      setFiles((prev) => prev.filter((f) => f.name !== filename));
    } catch (err: any) {
      setFileNotice({ type: "error", message: err.message });
    }
  };

  // ── Trigger handlers ──
  const handleCreateTrigger = async () => {
    setTriggerSaving(true);
    try {
      const config: Record<string, unknown> = { message: newTriggerMessage };
      if (newTriggerType === "schedule") config.cron = newTriggerCron;
      const res = await api.createTrigger(employeeId, {
        type: newTriggerType, name: newTriggerName, config,
      });
      setTriggersList((prev) => [...prev, res.trigger]);
      setShowNewTrigger(false);
      setNewTriggerName(""); setNewTriggerMessage(""); setNewTriggerCron("*/30 * * * *");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setTriggerSaving(false);
    }
  };
  const handleToggleTrigger = async (trigger: any) => {
    try {
      const res = await api.updateTrigger(employeeId, trigger.id, { enabled: !trigger.enabled });
      setTriggersList((prev) => prev.map((t) => (t.id === trigger.id ? res.trigger : t)));
    } catch (err: any) {
      alert(err.message);
    }
  };
  const handleDeleteTrigger = async (triggerId: string) => {
    if (!confirm("Delete this trigger?")) return;
    try {
      await api.deleteTrigger(employeeId, triggerId);
      setTriggersList((prev) => prev.filter((t) => t.id !== triggerId));
    } catch (err: any) {
      alert(err.message);
    }
  };
  const handleApplyPreset = (preset: typeof TRIGGER_PRESETS[0]) => {
    setNewTriggerType(preset.type);
    setNewTriggerName(preset.name);
    setNewTriggerMessage(preset.config.message);
    if (preset.config.cron) setNewTriggerCron(preset.config.cron);
    setShowNewTrigger(true);
  };
  // ── Channel handlers ──
  const handleConnectChannel = async (channelType: string) => {
    setChannelSaving(true);
    setChannelNotice(null);
    try {
      await api.connectChannel(employeeId, channelType, channelForm);
      setChannelsList((prev) =>
        prev.map((c) =>
          c.channelType === channelType ? { ...c, status: "connected", hasCredentials: true } : c,
        ),
      );
      setSetupChannel(null);
      setChannelForm({});
      setChannelNotice({ type: "success", message: `${CHANNEL_META[channelType]?.label || channelType} connected` });
    } catch (err: any) {
      setChannelNotice({ type: "error", message: err.message });
    } finally {
      setChannelSaving(false);
    }
  };
  const handleDisconnectChannel = async (channelType: string) => {
    if (!confirm(`Disconnect ${CHANNEL_META[channelType]?.label || channelType}?`)) return;
    try {
      await api.disconnectChannel(employeeId, channelType);
      setChannelsList((prev) =>
        prev.map((c) =>
          c.channelType === channelType ? { ...c, status: "disconnected", hasCredentials: false } : c,
        ),
      );
      setChannelNotice({ type: "success", message: `${CHANNEL_META[channelType]?.label || channelType} disconnected` });
    } catch (err: any) {
      setChannelNotice({ type: "error", message: err.message });
    }
  };

  // ── Credential handlers ──
  const resetCredForm = () => {
    setCredLabel(""); setCredUsername(""); setCredPassword("");
    setCredUrl(""); setCredNotes(""); setShowCredPassword(false);
    setEditingCredId(null); setShowNewCred(false);
  };
  const handleSaveCred = async () => {
    setCredSaving(true);
    setCredNotice(null);
    try {
      const data: { id?: string; label: string; username: string; password?: string; url?: string; notes?: string } = { label: credLabel, username: credUsername };
      if (credPassword) data.password = credPassword;
      if (credUrl) data.url = credUrl;
      if (credNotes) data.notes = credNotes;
      if (editingCredId) data.id = editingCredId;
      const res = await api.saveCredential(employeeId, data);
      if (editingCredId) {
        setCredentialsList((prev) => prev.map((c) => (c.id === editingCredId ? res.credential : c)));
      } else {
        setCredentialsList((prev) => [...prev, res.credential]);
      }
      resetCredForm();
      setCredNotice({ type: "success", message: editingCredId ? "Credential updated" : "Credential added" });
    } catch (err: any) {
      setCredNotice({ type: "error", message: err.message });
    } finally {
      setCredSaving(false);
    }
  };
  const handleEditCred = (cred: any) => {
    setEditingCredId(cred.id);
    setCredLabel(cred.label);
    setCredUsername(cred.username);
    setCredPassword("");
    setCredUrl(cred.url || "");
    setCredNotes(cred.notes || "");
    setShowNewCred(true);
  };
  const handleDeleteCred = async (credId: string) => {
    if (!confirm("Remove this credential? The employee will lose access.")) return;
    try {
      await api.deleteCredential(employeeId, credId);
      setCredentialsList((prev) => prev.filter((c) => c.id !== credId));
      setCredNotice({ type: "success", message: "Credential removed" });
    } catch (err: any) {
      setCredNotice({ type: "error", message: err.message });
    }
  };

  const copyWebhookUrl = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/${token}`);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  if (loading || !employee) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <div style={{ width: 24, height: 24, border: "2px solid var(--border)", borderTopColor: "var(--text-tertiary)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  return (
    <div className="animate-in" style={{ maxWidth: 800 }}>
      {/* Back link */}
      <Link href="/dashboard/employees" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-secondary)", textDecoration: "none", fontSize: 13, marginBottom: 24, transition: "color 0.15s" }}>
        <ArrowLeft size={14} /> Back to Employees
      </Link>

      {/* Hire confirmation banner */}
      {hireBanner && (
        <div style={{
          background: "var(--green-muted)",
          border: "1px solid var(--green)",
          borderRadius: "var(--radius-md)",
          padding: "12px 16px",
          marginBottom: 24,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--green)" }}>
            <Check size={16} />
            <span style={{ fontWeight: 500 }}>
              {employee?.name || "Employee"} has been hired!
              {hireBanner.billed && hireBanner.price && ` Added to your subscription — $${hireBanner.price}/mo.`}
              {hireBanner.billed && !hireBanner.price && " Added to your subscription."}
            </span>
          </div>
          <button onClick={() => setHireBanner(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--green)", padding: 4 }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            width: 64, height: 64, borderRadius: "var(--radius-lg)",
            background: "var(--bg-secondary)", border: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32,
          }}>
            {employee.emoji || "A"}
          </div>
          <div>
            <h1 className="heading-1" style={{ marginBottom: 2 }}>{employee.name}</h1>
            <div style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 8 }}>{employee.jobTitle}</div>
            <div className={`status-badge status-${employee.status}`}>
              <span className="status-dot" />
              <span style={{ textTransform: "capitalize" }}>{employee.status}</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {(employee.status === "active" || employee.status === "paused") && (
            <>
              <Link href={`/dashboard/inbox?employee=${employeeId}`} className="btn-primary btn-sm" style={{ gap: 6, textDecoration: "none" }}>
                <MessageCircle size={14} /> Chat
              </Link>
              <Link href={`/dashboard/employees/${employeeId}/documents`} className="btn-secondary btn-sm" style={{ gap: 6, textDecoration: "none" }}>
                <FileText size={14} /> Documents
              </Link>
            </>
          )}
          {employee.status === "active" && (
            <button className="btn-secondary btn-sm" onClick={handlePause} disabled={actionLoading} style={{ gap: 6 }}><Pause size={14} /> Pause</button>
          )}
          {employee.status === "paused" && (
            <button className="btn-primary btn-sm" onClick={handleResume} disabled={actionLoading} style={{ gap: 6 }}><Play size={14} /> Resume</button>
          )}
          {employee.status !== "terminated" && (
            <button className="btn-danger btn-sm" onClick={handleTerminate} disabled={actionLoading} style={{ gap: 6 }}><Trash2 size={14} /> Terminate</button>
          )}
        </div>
      </div>

      {/* Provisioning animation */}
      {employee.status === "provisioning" && (
        <div className="card animate-in" style={{ padding: 32, textAlign: "center", marginBottom: 24, background: "#ffffff", border: "1px solid var(--border)" }}>
          <Loader2 size={40} style={{ color: "var(--blue)", animation: "spin 2s linear infinite", marginBottom: 16 }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>Setting up {employee.name}&apos;s workstation...</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, maxWidth: 400, margin: "0 auto" }}>
            Spinning up an isolated environment, installing tools, and configuring accounts.
          </p>
          <div style={{ marginTop: 24, height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden", maxWidth: 300, margin: "24px auto 0" }}>
            <div style={{ height: "100%", width: "60%", background: "var(--blue)", borderRadius: 2, animation: "shimmer 2s ease-in-out infinite" }} />
          </div>
          <button
            className="btn-secondary btn-sm"
            onClick={async () => {
              setActionLoading(true);
              try {
                await fetch(`/api/employees/${employeeId}/reprovision`, { method: "POST" });
              } catch {}
              setActionLoading(false);
            }}
            disabled={actionLoading}
            style={{ marginTop: 20, fontSize: 12 }}
          >
            {actionLoading ? "Retrying..." : "Retry Provisioning"}
          </button>
        </div>
      )}

      {/* Error state */}
      {employee.status === "error" && employee.errorMessage && (
        <div className="card" style={{ padding: 20, marginBottom: 24, borderColor: "rgba(220, 38, 38, 0.15)", background: "rgba(220, 38, 38, 0.04)" }}>
          <div style={{ fontWeight: 600, color: "var(--red)", marginBottom: 6, fontSize: 14 }}>Error</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{employee.errorMessage}</div>
        </div>
      )}

      {/* Details grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div className="card" style={{ padding: 20, background: "#ffffff", border: "1px solid var(--border)" }}>
          <p className="label" style={{ marginBottom: 12 }}>Persona</p>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, maxHeight: 200, overflow: "auto" }}>
            {employee.persona || "No persona configured"}
          </div>
        </div>
        <div className="card" style={{ padding: 20, background: "#ffffff", border: "1px solid var(--border)" }}>
          <p className="label" style={{ marginBottom: 12 }}>Goals</p>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            {employee.goals || "No goals configured"}
          </div>
        </div>
      </div>

      {/* Technical details */}
      <div className="card" style={{ padding: 20, marginBottom: 16, background: "#ffffff", border: "1px solid var(--border)" }}>
        <p className="label" style={{ marginBottom: 16 }}>Technical Details</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 13 }}>
          {[
            { icon: Server, label: "Container", value: employee.containerName || "\u2014" },
            { icon: Server, label: "Host", value: employee.containerHost ? `${employee.containerHost}:${employee.containerPort}` : "\u2014" },
            { icon: Cpu, label: "Model", value: (employee.modelConfig as any)?.primary || "claude-opus-4-6" },
            { icon: Clock, label: "Last Health", value: employee.lastHealthAt ? new Date(employee.lastHealthAt).toLocaleString() : "\u2014" },
            { icon: Calendar, label: "Created", value: new Date(employee.createdAt).toLocaleDateString() },
            { icon: Mail, label: "Email", value: employee.emailAddress || "\u2014" },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Icon size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                <div>
                  <span style={{ color: "var(--text-tertiary)" }}>{item.label}: </span>
                  <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text)" }}>{item.value}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* CHANNELS SECTION */}
      {/* ════════════════════════════════════════════════════════════ */}
      {channelsList.length > 0 && (
        <div className="card" style={{ padding: 20, marginBottom: 16, background: "#ffffff", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Radio size={14} style={{ color: "var(--text-tertiary)" }} />
              <p className="label" style={{ margin: 0 }}>Channels</p>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)", background: "var(--bg-secondary)", padding: "2px 6px", borderRadius: "var(--radius-sm)" }}>
                {channelsList.length}
              </span>
            </div>
          </div>

          {channelNotice && (
            <div style={{
              padding: "8px 12px", borderRadius: "var(--radius-sm)", marginBottom: 12, fontSize: 12,
              background: channelNotice.type === "success" ? "rgba(22, 163, 74, 0.06)" : "rgba(220, 38, 38, 0.06)",
              color: channelNotice.type === "success" ? "var(--green)" : "var(--red)",
            }}>
              {channelNotice.message}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {channelsList.map((ch) => {
              const meta = CHANNEL_META[ch.channelType];
              const Icon = meta?.icon || MessageSquare;
              const isAutoHandled = ch.channelType === "slack" || ch.channelType === "email";
              const needsSetup = !isAutoHandled && meta?.fields?.length > 0;
              const isSettingUp = setupChannel === ch.channelType;

              return (
                <div key={ch.id} style={{
                  padding: "12px 14px", background: "#ffffff", borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Icon size={16} style={{ color: ch.status === "connected" ? "var(--text)" : "var(--text-tertiary)" }} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                        {meta?.label || ch.channelType}
                      </span>
                      <span style={{
                        fontSize: 10, padding: "2px 8px", borderRadius: 10,
                        fontWeight: 500,
                        ...(ch.status === "connected"
                          ? { background: "rgba(22, 163, 74, 0.08)", color: "var(--green)" }
                          : ch.status === "error"
                            ? { background: "rgba(220, 38, 38, 0.08)", color: "var(--red)" }
                            : { background: "var(--bg-secondary)", color: "var(--text-tertiary)", border: "1px solid var(--border)" }),
                      }}>
                        {ch.status === "connected" ? "Connected" : ch.status === "error" ? "Error" : "Needs setup"}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {needsSetup && ch.status !== "connected" && !isSettingUp && (
                        <button
                          className="btn-primary btn-sm"
                          onClick={() => { setSetupChannel(ch.channelType); setChannelForm({}); setChannelNotice(null); }}
                          style={{ fontSize: 11, padding: "4px 12px" }}
                        >
                          Set Up
                        </button>
                      )}
                      {needsSetup && ch.status === "connected" && !isSettingUp && (
                        <>
                          <button
                            className="btn-secondary btn-sm"
                            onClick={() => { setSetupChannel(ch.channelType); setChannelForm({}); setChannelNotice(null); }}
                            style={{ fontSize: 11, padding: "4px 10px" }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDisconnectChannel(ch.channelType)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: 2 }}
                            title="Disconnect"
                          >
                            <X size={14} />
                          </button>
                        </>
                      )}
                      {isAutoHandled && (
                        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                          {ch.channelType === "slack" ? "Via Slack proxy" : "See Email section below"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Setup form */}
                  {isSettingUp && meta && meta.fields.length > 0 && (
                    <div style={{
                      marginTop: 12, padding: 14, background: "var(--bg-secondary)",
                      borderRadius: "var(--radius-md)", border: "1px solid var(--border)",
                      display: "flex", flexDirection: "column", gap: 10,
                    }}>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                        {meta.helpText}
                        {meta.helpUrl && (
                          <> <a href={meta.helpUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)" }}>Learn more</a></>
                        )}
                      </div>
                      {meta.fields.map((field) => (
                        <div key={field.key}>
                          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                            {field.label}
                          </label>
                          <input
                            type={field.type || "text"}
                            placeholder={field.placeholder}
                            value={channelForm[field.key] || ""}
                            onChange={(e) => setChannelForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                            className="input"
                            style={{ width: "100%", fontSize: 13 }}
                          />
                        </div>
                      ))}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          className="btn-primary btn-sm"
                          onClick={() => handleConnectChannel(ch.channelType)}
                          disabled={channelSaving || meta.fields.some((f) => !channelForm[f.key])}
                          style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}
                        >
                          {channelSaving ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={12} />}
                          {channelSaving ? "Connecting..." : "Connect"}
                        </button>
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => { setSetupChannel(null); setChannelForm({}); }}
                          style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}
                        >
                          <X size={12} /> Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 10 }}>
            Connected channels let {employee.name} send and receive messages on these platforms. The employee&apos;s container restarts when channels are updated.
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* FILES SECTION */}
      {/* ════════════════════════════════════════════════════════════ */}
      <div className="card" style={{ padding: 20, marginBottom: 16, background: "#ffffff", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FileText size={14} style={{ color: "var(--text-tertiary)" }} />
            <p className="label" style={{ margin: 0 }}>Files</p>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)", background: "var(--bg-secondary)", padding: "2px 6px", borderRadius: "var(--radius-sm)" }}>
              {files.length}
            </span>
          </div>
          <div>
            <input ref={fileInputRef} type="file" onChange={handleFileUpload} style={{ display: "none" }} />
            <button
              className="btn-secondary btn-sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}
            >
              {uploading ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Upload size={12} />}
              {uploading ? "Uploading..." : "Upload"}
            </button>
          </div>
        </div>

        {fileNotice && (
          <div style={{
            padding: "8px 12px", borderRadius: "var(--radius-sm)", marginBottom: 12, fontSize: 12,
            background: fileNotice.type === "success" ? "rgba(22, 163, 74, 0.06)" : "rgba(220, 38, 38, 0.06)",
            color: fileNotice.type === "success" ? "var(--green)" : "var(--red)",
          }}>
            {fileNotice.message}
          </div>
        )}

        {files.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
            No files uploaded. Upload documents, images, or data files here and {employee.name} can read and use them.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {files.map((file) => (
              <div key={file.name} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 10px", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", fontSize: 12,
                border: "1px solid var(--border)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <FileText size={13} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                  <span style={{ fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)" }}>{file.name}</span>
                  <span style={{ color: "var(--text-tertiary)", flexShrink: 0 }}>{formatFileSize(file.size)}</span>
                </div>
                <button
                  onClick={() => handleFileDelete(file.name)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: 4 }}
                  title="Delete file"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 10 }}>
          Files appear in the employee&apos;s workspace at <code style={{ fontSize: 10, background: "var(--bg-secondary)", padding: "1px 4px", borderRadius: 3 }}>/uploads/</code> — max 10MB each
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* TRIGGERS / WEBHOOKS SECTION */}
      {/* ════════════════════════════════════════════════════════════ */}
      <div className="card" style={{ padding: 20, marginBottom: 16, background: "#ffffff", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Zap size={14} style={{ color: "var(--text-tertiary)" }} />
            <p className="label" style={{ margin: 0 }}>Triggers</p>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)", background: "var(--bg-secondary)", padding: "2px 6px", borderRadius: "var(--radius-sm)" }}>
              {triggersList.length}
            </span>
          </div>
          {!showNewTrigger && (
            <button
              className="btn-secondary btn-sm"
              onClick={() => setShowNewTrigger(true)}
              style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}
            >
              <Plus size={12} /> Add Trigger
            </button>
          )}
        </div>

        {/* Quick presets */}
        {!showNewTrigger && triggersList.length === 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>Quick presets:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {TRIGGER_PRESETS.map((preset, i) => (
                <button
                  key={i}
                  onClick={() => handleApplyPreset(preset)}
                  style={{
                    fontSize: 11, padding: "4px 10px", borderRadius: 12,
                    background: "var(--bg-secondary)", border: "1px solid var(--border)",
                    color: "var(--text-secondary)", cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  {preset.type === "schedule" ? <Timer size={10} style={{ marginRight: 4, verticalAlign: "middle" }} /> : <Webhook size={10} style={{ marginRight: 4, verticalAlign: "middle" }} />}
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* New trigger form */}
        {showNewTrigger && (
          <div style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", padding: 16, marginBottom: 16, display: "flex", flexDirection: "column", gap: 12, border: "1px solid var(--border)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Type</label>
                <div style={{ position: "relative" }}>
                  <select value={newTriggerType} onChange={(e) => setNewTriggerType(e.target.value)} className="input" style={{ width: "100%", fontSize: 13, appearance: "none", paddingRight: 32, cursor: "pointer" }}>
                    <option value="schedule">Scheduled (Cron)</option>
                    <option value="webhook">Incoming Webhook</option>
                  </select>
                  <ChevronDown size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)", pointerEvents: "none" }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Name</label>
                <input type="text" placeholder="e.g., Check emails" value={newTriggerName} onChange={(e) => setNewTriggerName(e.target.value)} className="input" style={{ width: "100%", fontSize: 13 }} />
              </div>
            </div>

            {newTriggerType === "schedule" && (
              <div>
                <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Cron Expression
                  <span style={{ color: "var(--text-tertiary)", marginLeft: 8 }}>min hour day month weekday</span>
                </label>
                <input type="text" placeholder="*/30 * * * *" value={newTriggerCron} onChange={(e) => setNewTriggerCron(e.target.value)} className="input" style={{ width: "100%", fontSize: 13, fontFamily: "monospace" }} />
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
                  Examples: <code style={{ fontSize: 10, background: "#ffffff", padding: "1px 4px", borderRadius: 3 }}>*/30 * * * *</code> (every 30 min), <code style={{ fontSize: 10, background: "#ffffff", padding: "1px 4px", borderRadius: 3 }}>0 9 * * 1-5</code> (weekdays 9am), <code style={{ fontSize: 10, background: "#ffffff", padding: "1px 4px", borderRadius: 3 }}>0 */2 * * *</code> (every 2 hours)
                </div>
              </div>
            )}

            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                Message sent to employee when triggered
              </label>
              <textarea
                placeholder="What should the employee do when this trigger fires?"
                value={newTriggerMessage}
                onChange={(e) => setNewTriggerMessage(e.target.value)}
                className="input"
                rows={3}
                style={{ width: "100%", fontSize: 13, resize: "vertical" }}
              />
              {newTriggerType === "webhook" && (
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
                  Use <code style={{ fontSize: 10, background: "#ffffff", padding: "1px 4px", borderRadius: 3 }}>{"{{body}}"}</code> to include the webhook payload in the message
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-primary btn-sm" onClick={handleCreateTrigger} disabled={triggerSaving || !newTriggerName || !newTriggerMessage} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <Save size={12} /> {triggerSaving ? "Creating..." : "Create"}
              </button>
              <button className="btn-secondary btn-sm" onClick={() => setShowNewTrigger(false)} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <X size={12} /> Cancel
              </button>
            </div>
          </div>
        )}

        {/* Trigger list */}
        {triggersList.length === 0 && !showNewTrigger ? (
          <div style={{ fontSize: 13, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
            No triggers configured. Triggers make {employee.name} proactive — they can check emails on a schedule, respond to webhooks from GitHub, Zapier, and more.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {triggersList.map((trigger) => (
              <div key={trigger.id} style={{
                padding: "10px 12px", background: trigger.enabled ? "#ffffff" : "var(--bg-secondary)", borderRadius: "var(--radius-md)",
                border: "1px solid var(--border)",
                opacity: trigger.enabled ? 1 : 0.6,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {trigger.type === "schedule" ? <Timer size={13} style={{ color: "var(--blue)" }} /> : <Webhook size={13} style={{ color: "var(--purple)" }} />}
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{trigger.name}</span>
                    <span style={{ fontSize: 10, color: "var(--text-tertiary)", background: "var(--bg-secondary)", padding: "1px 6px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                      {trigger.type}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button onClick={() => handleToggleTrigger(trigger)} style={{ background: "none", border: "none", cursor: "pointer", color: trigger.enabled ? "var(--green)" : "var(--text-tertiary)", padding: 2 }} title={trigger.enabled ? "Disable" : "Enable"}>
                      {trigger.enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                    </button>
                    <button onClick={() => handleDeleteTrigger(trigger.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: 2 }} title="Delete">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6 }}>
                  {trigger.type === "schedule" && (trigger.config as any)?.cron && (
                    <span><code style={{ fontSize: 10, background: "var(--bg-secondary)", padding: "1px 4px", borderRadius: 3 }}>{(trigger.config as any).cron}</code></span>
                  )}
                  {trigger.lastRunAt && (
                    <span style={{ marginLeft: 12 }}>Last run: {new Date(trigger.lastRunAt).toLocaleString()}</span>
                  )}
                </div>

                {/* Webhook URL */}
                {trigger.type === "webhook" && trigger.webhookToken && (
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    <code style={{ fontSize: 10, background: "var(--bg-secondary)", padding: "3px 6px", borderRadius: "var(--radius-sm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                      {typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/${trigger.webhookToken}` : `/api/webhooks/${trigger.webhookToken}`}
                    </code>
                    <button
                      onClick={() => copyWebhookUrl(trigger.webhookToken)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: copiedToken === trigger.webhookToken ? "var(--green)" : "var(--text-tertiary)", padding: 2, flexShrink: 0 }}
                      title="Copy webhook URL"
                    >
                      {copiedToken === trigger.webhookToken ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {triggersList.length > 0 && !showNewTrigger && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
              Quick add:
              {TRIGGER_PRESETS.slice(0, 3).map((preset, i) => (
                <button key={i} onClick={() => handleApplyPreset(preset)} style={{ fontSize: 11, color: "var(--blue)", background: "none", border: "none", cursor: "pointer", marginLeft: 8, textDecoration: "underline" }}>
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* CREDENTIALS / LOGINS */}
      {/* ════════════════════════════════════════════════════════════ */}
      <div className="card" style={{ padding: 20, marginBottom: 16, background: "#ffffff", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <KeyRound size={14} style={{ color: "var(--text-tertiary)" }} />
            <p className="label" style={{ margin: 0 }}>Logins &amp; Passwords</p>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)", background: "var(--bg-secondary)", padding: "2px 6px", borderRadius: "var(--radius-sm)" }}>
              {credentialsList.length}
            </span>
          </div>
          {!showNewCred && (
            <button
              className="btn-secondary btn-sm"
              onClick={() => { resetCredForm(); setShowNewCred(true); }}
              style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}
            >
              <Plus size={12} /> Add Login
            </button>
          )}
        </div>

        {credNotice && (
          <div style={{
            padding: "8px 12px", borderRadius: "var(--radius-sm)", marginBottom: 12, fontSize: 12,
            background: credNotice.type === "success" ? "rgba(22, 163, 74, 0.06)" : "rgba(220, 38, 38, 0.06)",
            color: credNotice.type === "success" ? "var(--green)" : "var(--red)",
          }}>
            {credNotice.message}
          </div>
        )}

        {/* Add / edit form */}
        {showNewCred && (
          <div style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", padding: 16, marginBottom: 16, display: "flex", flexDirection: "column", gap: 12, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2, color: "var(--text)" }}>
              {editingCredId ? "Edit Credential" : "New Credential"}
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Label</label>
              <input type="text" placeholder="e.g., Company CRM, GitHub, Trello" value={credLabel} onChange={(e) => setCredLabel(e.target.value)} className="input" style={{ width: "100%", fontSize: 13 }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Username / Email</label>
                <input type="text" placeholder="username or email" value={credUsername} onChange={(e) => setCredUsername(e.target.value)} className="input" style={{ width: "100%", fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Password</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showCredPassword ? "text" : "password"}
                    placeholder={editingCredId ? "Leave blank to keep current" : "Enter password"}
                    value={credPassword}
                    onChange={(e) => setCredPassword(e.target.value)}
                    className="input"
                    style={{ width: "100%", fontSize: 13, paddingRight: 36 }}
                  />
                  <button type="button" onClick={() => setShowCredPassword(!showCredPassword)} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: 4 }}>
                    {showCredPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>URL (optional)</label>
              <input type="text" placeholder="https://..." value={credUrl} onChange={(e) => setCredUrl(e.target.value)} className="input" style={{ width: "100%", fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Notes (optional)</label>
              <input type="text" placeholder="e.g., 2FA enabled, use app password" value={credNotes} onChange={(e) => setCredNotes(e.target.value)} className="input" style={{ width: "100%", fontSize: 13 }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn-primary btn-sm"
                onClick={handleSaveCred}
                disabled={credSaving || !credLabel || !credUsername || (!credPassword && !editingCredId)}
                style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}
              >
                <Save size={12} /> {credSaving ? "Saving..." : "Save"}
              </button>
              <button className="btn-secondary btn-sm" onClick={resetCredForm} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <X size={12} /> Cancel
              </button>
            </div>
          </div>
        )}

        {/* Credentials list */}
        {credentialsList.length === 0 && !showNewCred ? (
          <div style={{ fontSize: 13, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
            No logins stored. Add usernames and passwords here so {employee.name} can log into websites and services on your behalf.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {credentialsList.map((cred) => (
              <div key={cred.id} style={{
                padding: "10px 12px", background: "#ffffff", borderRadius: "var(--radius-md)",
                border: "1px solid var(--border)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <KeyRound size={13} style={{ color: "var(--blue)" }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{cred.label}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button onClick={() => handleEditCred(cred)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: 2 }} title="Edit">
                      <Edit3 size={13} />
                    </button>
                    <button onClick={() => handleDeleteCred(cred.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: 2 }} title="Delete">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6, display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
                  <span><span style={{ color: "var(--text-tertiary)" }}>User:</span> <code style={{ fontSize: 11, background: "var(--bg-secondary)", padding: "1px 4px", borderRadius: 3 }}>{cred.username}</code></span>
                  <span><span style={{ color: "var(--text-tertiary)" }}>Pass:</span> <code style={{ fontSize: 11, background: "var(--bg-secondary)", padding: "1px 4px", borderRadius: 3 }}>{cred.hasPassword ? "********" : "Not set"}</code></span>
                  {cred.url && (
                    <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <Globe size={10} style={{ color: "var(--text-tertiary)" }} />
                      <code style={{ fontSize: 11, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block", background: "var(--bg-secondary)", padding: "1px 4px", borderRadius: 3 }}>{cred.url}</code>
                    </span>
                  )}
                </div>
                {cred.notes && (
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4, fontStyle: "italic" }}>
                    {cred.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 10 }}>
          Credentials are securely stored and available to the employee for logging into websites and services.
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* EMAIL CREDENTIALS */}
      {/* ════════════════════════════════════════════════════════════ */}
      <div className="card" style={{ padding: 20, background: "#ffffff", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Mail size={14} style={{ color: "var(--text-tertiary)" }} />
            <p className="label" style={{ margin: 0 }}>Email Account</p>
          </div>
          {!emailEditing && (
            <button className="btn-secondary btn-sm" onClick={() => setEmailEditing(true)} style={{ fontSize: 12 }}>
              {emailConfig ? "Edit" : "Set Up"}
            </button>
          )}
        </div>

        {emailNotice && (
          <div style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", marginBottom: 12, fontSize: 12, background: emailNotice.type === "success" ? "rgba(22, 163, 74, 0.06)" : "rgba(220, 38, 38, 0.06)", color: emailNotice.type === "success" ? "var(--green)" : "var(--red)" }}>
            {emailNotice.message}
          </div>
        )}

        {!emailEditing && !emailConfig && (
          <div style={{ fontSize: 13, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
            No email configured. Create an email account for this employee on your company&apos;s email provider and enter the credentials here.
          </div>
        )}

        {!emailEditing && emailConfig && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ color: "var(--text-tertiary)" }}>Provider</span>
              <span style={{ fontSize: 12, color: "var(--text)" }}>{EMAIL_PROVIDERS[emailConfig.provider]?.label || emailConfig.provider}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ color: "var(--text-tertiary)" }}>Address</span>
              <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text)" }}>{emailConfig.address}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
              <span style={{ color: "var(--text-tertiary)" }}>Password</span>
              <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text)" }}>{emailConfig.hasPassword ? "********" : "Not set"}</span>
            </div>
          </div>
        )}

        {emailEditing && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Email Provider</label>
              <div style={{ position: "relative" }}>
                <select value={emailProvider} onChange={(e) => setEmailProvider(e.target.value)} className="input" style={{ width: "100%", fontSize: 13, appearance: "none", paddingRight: 32, cursor: "pointer" }}>
                  {Object.entries(EMAIL_PROVIDERS).map(([key, p]) => (<option key={key} value={key}>{p.label}</option>))}
                </select>
                <ChevronDown size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)", pointerEvents: "none" }} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Email Address</label>
              <input type="email" placeholder="sarah@yourcompany.com" value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)} className="input" style={{ width: "100%", fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Password</label>
              <div style={{ position: "relative" }}>
                <input type={showPassword ? "text" : "password"} placeholder={emailConfig?.hasPassword ? "Leave blank to keep current" : "Enter password"} value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} className="input" style={{ width: "100%", fontSize: 13, paddingRight: 36 }} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: 4 }}>
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            {EMAIL_PROVIDERS[emailProvider]?.note && (
              <div style={{ fontSize: 11, color: "var(--text-secondary)", padding: "8px 10px", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                {EMAIL_PROVIDERS[emailProvider].note}
              </div>
            )}
            {emailProvider === "custom" && (
              <>
                <div>
                  <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>SMTP Host</label>
                  <input type="text" placeholder="smtp.yourprovider.com" value={customSmtp} onChange={(e) => setCustomSmtp(e.target.value)} className="input" style={{ width: "100%", fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>IMAP Host</label>
                  <input type="text" placeholder="imap.yourprovider.com" value={customImap} onChange={(e) => setCustomImap(e.target.value)} className="input" style={{ width: "100%", fontSize: 13 }} />
                </div>
              </>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button className="btn-primary btn-sm" onClick={handleSaveEmail} disabled={emailSaving || !emailAddress || (!emailPassword && !emailConfig?.hasPassword) || (emailProvider === "custom" && !customSmtp)} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <Save size={12} /> {emailSaving ? "Saving..." : "Save"}
              </button>
              <button className="btn-secondary btn-sm" onClick={() => { setEmailEditing(false); setEmailNotice(null); }} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <X size={12} /> Cancel
              </button>
              {emailConfig && (
                <button className="btn-danger btn-sm" onClick={handleRemoveEmail} style={{ fontSize: 12, marginLeft: "auto" }}>Remove</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
