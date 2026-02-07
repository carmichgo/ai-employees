"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function EmployeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [employee, setEmployee] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const employeeId = params.id as string;

  useEffect(() => {
    api.getEmployee(employeeId).then((res) => {
      setEmployee(res.employee);
      setLoading(false);
    });
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
    await api.terminateEmployee(employeeId);
    router.push("/dashboard/employees");
  };

  if (loading || !employee) {
    return <div style={{ color: "var(--text-muted)", padding: 40 }}>Loading...</div>;
  }

  return (
    <div style={{ maxWidth: 800 }}>
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
              borderRadius: 14,
              background: "var(--bg-tertiary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
            }}
          >
            {employee.emoji || "🤖"}
          </div>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700 }}>{employee.name}</h1>
            <div style={{ color: "var(--text-secondary)", marginTop: 2 }}>
              {employee.jobTitle}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
              <span className={`status-dot status-${employee.status}`} />
              <span
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  textTransform: "capitalize",
                }}
              >
                {employee.status}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {employee.status === "active" && (
            <button
              className="btn-secondary"
              onClick={handlePause}
              disabled={actionLoading}
            >
              Pause
            </button>
          )}
          {employee.status === "paused" && (
            <button
              className="btn-primary"
              onClick={handleResume}
              disabled={actionLoading}
            >
              Resume
            </button>
          )}
          {employee.status !== "terminated" && (
            <button
              onClick={handleTerminate}
              disabled={actionLoading}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: "1px solid rgba(239, 68, 68, 0.3)",
                background: "rgba(239, 68, 68, 0.1)",
                color: "var(--error)",
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              Terminate
            </button>
          )}
        </div>
      </div>

      {/* Provisioning animation */}
      {employee.status === "provisioning" && (
        <div
          className="card glow"
          style={{
            padding: 32,
            textAlign: "center",
            marginBottom: 24,
            background: "rgba(99, 102, 241, 0.04)",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔧</div>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            Setting up {employee.name}&apos;s workstation...
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            Spinning up an isolated environment, installing tools, and configuring
            accounts. This usually takes 30-60 seconds.
          </p>
          <div
            style={{
              marginTop: 20,
              height: 4,
              background: "var(--border)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: "60%",
                background: "var(--accent)",
                borderRadius: 2,
                animation: "pulse 2s infinite",
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
            borderColor: "rgba(239, 68, 68, 0.3)",
          }}
        >
          <div style={{ fontWeight: 600, color: "var(--error)", marginBottom: 8 }}>
            Error
          </div>
          <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
            {employee.errorMessage}
          </div>
        </div>
      )}

      {/* Details grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ padding: 20 }}>
          <div
            style={{
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: 1,
              color: "var(--text-muted)",
              marginBottom: 12,
            }}
          >
            Persona
          </div>
          <div
            style={{
              fontSize: 14,
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
          <div
            style={{
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: 1,
              color: "var(--text-muted)",
              marginBottom: 12,
            }}
          >
            Goals
          </div>
          <div
            style={{
              fontSize: 14,
              color: "var(--text-secondary)",
              lineHeight: 1.6,
            }}
          >
            {employee.goals || "No goals configured"}
          </div>
        </div>
      </div>

      {/* Technical details */}
      <div className="card" style={{ padding: 20 }}>
        <div
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: 1,
            color: "var(--text-muted)",
            marginBottom: 12,
          }}
        >
          Technical Details
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            fontSize: 14,
          }}
        >
          <div>
            <span style={{ color: "var(--text-muted)" }}>Container: </span>
            <span style={{ fontFamily: "monospace", fontSize: 12 }}>
              {employee.containerName || "—"}
            </span>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)" }}>Host: </span>
            <span style={{ fontFamily: "monospace", fontSize: 12 }}>
              {employee.containerHost ? `${employee.containerHost}:${employee.containerPort}` : "—"}
            </span>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)" }}>Model: </span>
            <span>
              {(employee.modelConfig as any)?.primary || "claude-sonnet-4-20250514"}
            </span>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)" }}>Last Health: </span>
            <span>
              {employee.lastHealthAt
                ? new Date(employee.lastHealthAt).toLocaleString()
                : "—"}
            </span>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)" }}>Created: </span>
            <span>{new Date(employee.createdAt).toLocaleDateString()}</span>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)" }}>Email: </span>
            <span>{employee.emailAddress || "—"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
