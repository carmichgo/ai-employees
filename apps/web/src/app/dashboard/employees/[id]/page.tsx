"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Pause, Play, Trash2, Loader2, Server, Mail, Cpu, Clock, Calendar, MessageCircle, Save, X, Eye, EyeOff } from "lucide-react";
import Link from "next/link";

export default function EmployeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [employee, setEmployee] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Email config state
  const [emailConfig, setEmailConfig] = useState<any>(null);
  const [emailEditing, setEmailEditing] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailForm, setEmailForm] = useState({
    address: "",
    smtpHost: "",
    smtpPort: "587",
    imapHost: "",
    imapPort: "993",
    username: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [emailNotice, setEmailNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const employeeId = params.id as string;

  useEffect(() => {
    api.getEmployee(employeeId).then((res) => {
      setEmployee(res.employee);
      setLoading(false);
    });
    // Load email config
    api.getEmployeeEmail(employeeId).then((res) => {
      if (res.email) {
        setEmailConfig(res.email);
        setEmailForm({
          address: res.email.address || "",
          smtpHost: res.email.smtpHost || "",
          smtpPort: String(res.email.smtpPort || 587),
          imapHost: res.email.imapHost || "",
          imapPort: String(res.email.imapPort || 993),
          username: res.email.username || "",
          password: "",
        });
      }
    }).catch(() => {});
  }, [employeeId]);

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
    if (!confirm(`Are you sure you want to terminate ${employee.name}? This will shut down their workstation.`)) {
      return;
    }
    setActionLoading(true);
    try {
      await api.terminateEmployee(employeeId);
      router.push("/dashboard/employees");
    } catch (err: any) {
      alert(`Failed to terminate: ${err.message}`);
      setActionLoading(false);
    }
  };

  const handleSaveEmail = async () => {
    setEmailSaving(true);
    setEmailNotice(null);
    try {
      const res = await api.saveEmployeeEmail(employeeId, {
        address: emailForm.address,
        smtpHost: emailForm.smtpHost,
        smtpPort: parseInt(emailForm.smtpPort) || 587,
        imapHost: emailForm.imapHost || emailForm.smtpHost,
        imapPort: parseInt(emailForm.imapPort) || 993,
        username: emailForm.username,
        password: emailForm.password,
      });
      setEmailConfig(res.email);
      setEmailEditing(false);
      setEmailNotice({ type: "success", message: "Email credentials saved" });
      // Update employee email display
      setEmployee((prev: any) => ({ ...prev, emailAddress: emailForm.address }));
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
      setEmailConfig(null);
      setEmailForm({ address: "", smtpHost: "", smtpPort: "587", imapHost: "", imapPort: "993", username: "", password: "" });
      setEmailEditing(false);
      setEmailNotice({ type: "success", message: "Email credentials removed" });
    } catch (err: any) {
      setEmailNotice({ type: "error", message: err.message });
    }
  };

  if (loading || !employee) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <div
          style={{
            width: 24,
            height: 24,
            border: "2px solid var(--border)",
            borderTopColor: "var(--text)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  return (
    <div className="animate-in" style={{ maxWidth: 800 }}>
      {/* Back link */}
      <Link
        href="/dashboard/employees"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          color: "var(--text-secondary)",
          textDecoration: "none",
          fontSize: 13,
          marginBottom: 24,
          transition: "color 0.15s",
        }}
      >
        <ArrowLeft size={14} />
        Back to Employees
      </Link>

      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 32,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "linear-gradient(135deg, rgba(93, 121, 223, 0.12), rgba(169, 75, 210, 0.12))",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
            }}
          >
            {employee.emoji || "A"}
          </div>
          <div>
            <h1 className="heading-1" style={{ marginBottom: 2 }}>{employee.name}</h1>
            <div style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 8 }}>
              {employee.jobTitle}
            </div>
            <div className={`status-badge status-${employee.status}`}>
              <span className="status-dot" />
              <span style={{ textTransform: "capitalize" }}>{employee.status}</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {(employee.status === "active" || employee.status === "paused") && (
            <Link
              href={`/dashboard/employees/${employeeId}/chat`}
              className="btn-primary btn-sm"
              style={{ gap: 6, textDecoration: "none" }}
            >
              <MessageCircle size={14} /> Chat
            </Link>
          )}
          {employee.status === "active" && (
            <button className="btn-secondary btn-sm" onClick={handlePause} disabled={actionLoading} style={{ gap: 6 }}>
              <Pause size={14} /> Pause
            </button>
          )}
          {employee.status === "paused" && (
            <button className="btn-primary btn-sm" onClick={handleResume} disabled={actionLoading} style={{ gap: 6 }}>
              <Play size={14} /> Resume
            </button>
          )}
          {employee.status !== "terminated" && (
            <button className="btn-danger btn-sm" onClick={handleTerminate} disabled={actionLoading} style={{ gap: 6 }}>
              <Trash2 size={14} /> Terminate
            </button>
          )}
        </div>
      </div>

      {/* Provisioning animation */}
      {employee.status === "provisioning" && (
        <div
          className="card glow-subtle animate-in"
          style={{ padding: 32, textAlign: "center", marginBottom: 24 }}
        >
          <Loader2
            size={40}
            style={{
              color: "var(--blue)",
              animation: "spin 2s linear infinite",
              marginBottom: 16,
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            Setting up {employee.name}&apos;s workstation...
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, maxWidth: 400, margin: "0 auto" }}>
            Spinning up an isolated environment, installing tools, and configuring accounts.
          </p>
          <div
            style={{
              marginTop: 24,
              height: 3,
              background: "var(--border)",
              borderRadius: 2,
              overflow: "hidden",
              maxWidth: 300,
              margin: "24px auto 0",
            }}
          >
            <div
              style={{
                height: "100%",
                width: "60%",
                background: "linear-gradient(90deg, var(--blue), var(--purple))",
                borderRadius: 2,
                animation: "shimmer 2s ease-in-out infinite",
              }}
            />
          </div>
        </div>
      )}

      {/* Error state */}
      {employee.status === "error" && employee.errorMessage && (
        <div
          className="card"
          style={{
            padding: 20,
            marginBottom: 24,
            borderColor: "rgba(239, 68, 68, 0.2)",
            background: "var(--red-muted)",
          }}
        >
          <div style={{ fontWeight: 600, color: "var(--red)", marginBottom: 6, fontSize: 14 }}>
            Error
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            {employee.errorMessage}
          </div>
        </div>
      )}

      {/* Details grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <p className="label" style={{ marginBottom: 12 }}>Persona</p>
          <div
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              lineHeight: 1.6,
              maxHeight: 200,
              overflow: "auto",
            }}
          >
            {employee.persona || "No persona configured"}
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <p className="label" style={{ marginBottom: 12 }}>Goals</p>
          <div
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              lineHeight: 1.6,
            }}
          >
            {employee.goals || "No goals configured"}
          </div>
        </div>
      </div>

      {/* Technical details */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <p className="label" style={{ marginBottom: 16 }}>Technical Details</p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            fontSize: 13,
          }}
        >
          {[
            { icon: Server, label: "Container", value: employee.containerName || "\u2014" },
            { icon: Server, label: "Host", value: employee.containerHost ? `${employee.containerHost}:${employee.containerPort}` : "\u2014" },
            { icon: Cpu, label: "Model", value: (employee.modelConfig as any)?.primary || "claude-sonnet-4-20250514" },
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
                  <span style={{ fontFamily: "monospace", fontSize: 12 }}>{item.value}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Email Credentials */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Mail size={14} style={{ color: "var(--text-tertiary)" }} />
            <p className="label" style={{ margin: 0 }}>Email Account</p>
          </div>
          {!emailEditing && (
            <button
              className="btn-secondary btn-sm"
              onClick={() => setEmailEditing(true)}
              style={{ fontSize: 12 }}
            >
              {emailConfig ? "Edit" : "Set Up"}
            </button>
          )}
        </div>

        {emailNotice && (
          <div style={{
            padding: "8px 12px",
            borderRadius: 6,
            marginBottom: 12,
            fontSize: 12,
            background: emailNotice.type === "success" ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
            color: emailNotice.type === "success" ? "#22c55e" : "#ef4444",
          }}>
            {emailNotice.message}
          </div>
        )}

        {!emailEditing && !emailConfig && (
          <div style={{ fontSize: 13, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
            No email configured. Set up email credentials so this employee can send and receive emails.
            Create an email account for them on your company&apos;s email provider (Google Workspace, Outlook, etc.) and enter the credentials here.
          </div>
        )}

        {!emailEditing && emailConfig && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-tertiary)" }}>Address</span>
              <span style={{ fontFamily: "monospace", fontSize: 12 }}>{emailConfig.address}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-tertiary)" }}>SMTP</span>
              <span style={{ fontFamily: "monospace", fontSize: 12 }}>{emailConfig.smtpHost}:{emailConfig.smtpPort}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-tertiary)" }}>IMAP</span>
              <span style={{ fontFamily: "monospace", fontSize: 12 }}>{emailConfig.imapHost}:{emailConfig.imapPort}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-tertiary)" }}>Username</span>
              <span style={{ fontFamily: "monospace", fontSize: 12 }}>{emailConfig.username}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-tertiary)" }}>Password</span>
              <span style={{ fontFamily: "monospace", fontSize: 12 }}>{emailConfig.hasPassword ? "********" : "Not set"}</span>
            </div>
          </div>
        )}

        {emailEditing && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>
              Create an email account on your provider (Gmail, Outlook, etc.) and enter the IMAP/SMTP credentials below.
              For Gmail, use an App Password instead of your regular password.
            </div>

            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Email Address</label>
              <input
                type="email"
                placeholder="sarah@yourcompany.com"
                value={emailForm.address}
                onChange={(e) => setEmailForm((f) => ({ ...f, address: e.target.value }))}
                className="input"
                style={{ width: "100%", fontSize: 13 }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 8 }}>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>SMTP Host</label>
                <input
                  type="text"
                  placeholder="smtp.gmail.com"
                  value={emailForm.smtpHost}
                  onChange={(e) => setEmailForm((f) => ({ ...f, smtpHost: e.target.value }))}
                  className="input"
                  style={{ width: "100%", fontSize: 13 }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Port</label>
                <input
                  type="text"
                  placeholder="587"
                  value={emailForm.smtpPort}
                  onChange={(e) => setEmailForm((f) => ({ ...f, smtpPort: e.target.value }))}
                  className="input"
                  style={{ width: "100%", fontSize: 13 }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 8 }}>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>IMAP Host</label>
                <input
                  type="text"
                  placeholder="imap.gmail.com"
                  value={emailForm.imapHost}
                  onChange={(e) => setEmailForm((f) => ({ ...f, imapHost: e.target.value }))}
                  className="input"
                  style={{ width: "100%", fontSize: 13 }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Port</label>
                <input
                  type="text"
                  placeholder="993"
                  value={emailForm.imapPort}
                  onChange={(e) => setEmailForm((f) => ({ ...f, imapPort: e.target.value }))}
                  className="input"
                  style={{ width: "100%", fontSize: 13 }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Username</label>
              <input
                type="text"
                placeholder="sarah@yourcompany.com"
                value={emailForm.username}
                onChange={(e) => setEmailForm((f) => ({ ...f, username: e.target.value }))}
                className="input"
                style={{ width: "100%", fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Password / App Password</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder={emailConfig?.hasPassword ? "Leave blank to keep current" : "Enter password"}
                  value={emailForm.password}
                  onChange={(e) => setEmailForm((f) => ({ ...f, password: e.target.value }))}
                  className="input"
                  style={{ width: "100%", fontSize: 13, paddingRight: 36 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: 8,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-tertiary)",
                    padding: 4,
                  }}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                className="btn-primary btn-sm"
                onClick={handleSaveEmail}
                disabled={emailSaving || !emailForm.address || !emailForm.smtpHost || !emailForm.username || (!emailForm.password && !emailConfig?.hasPassword)}
                style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}
              >
                <Save size={12} /> {emailSaving ? "Saving..." : "Save"}
              </button>
              <button
                className="btn-secondary btn-sm"
                onClick={() => { setEmailEditing(false); setEmailNotice(null); }}
                style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}
              >
                <X size={12} /> Cancel
              </button>
              {emailConfig && (
                <button
                  className="btn-danger btn-sm"
                  onClick={handleRemoveEmail}
                  style={{ fontSize: 12, marginLeft: "auto" }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
