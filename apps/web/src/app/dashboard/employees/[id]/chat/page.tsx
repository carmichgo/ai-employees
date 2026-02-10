"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Send, Loader2, Bot, User } from "lucide-react";
import Link from "next/link";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  mode?: string;
}

export default function EmployeeChatPage() {
  const params = useParams();
  const employeeId = params.id as string;
  const [employee, setEmployee] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    async function init() {
      const empRes = await api.getEmployee(employeeId);
      setEmployee(empRes.employee);

      // Load conversation history from DB
      try {
        const historyRes = await api.getChatHistory(employeeId);
        if (historyRes.messages.length > 0) {
          setMessages(
            historyRes.messages.map((m) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              timestamp: new Date(m.createdAt),
              mode: m.mode || undefined,
            })),
          );
        } else {
          // No history — show welcome message
          setMessages([
            {
              id: "welcome",
              role: "assistant",
              content: `Hi! I'm ${empRes.employee.name}, your ${empRes.employee.jobTitle}. How can I help you today?`,
              timestamp: new Date(),
            },
          ]);
        }
      } catch {
        // Table might not exist yet — show welcome message
        setMessages([
          {
            id: "welcome",
            role: "assistant",
            content: `Hi! I'm ${empRes.employee.name}, your ${empRes.employee.jobTitle}. How can I help you today?`,
            timestamp: new Date(),
          },
        ]);
      }

      setLoading(false);
    }
    init();
  }, [employeeId]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setSending(true);

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    try {
      // Build conversation history (exclude welcome message)
      const history = messages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await api.chatWithEmployee(employeeId, text, history);

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: res.reply,
        timestamp: new Date(),
        mode: res.mode,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `Sorry, I couldn't process that: ${err.message}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize textarea
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 150) + "px";
  };

  if (loading || !employee) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "80vh" }}>
        <Loader2
          size={24}
          style={{ animation: "spin 0.8s linear infinite", color: "var(--text-tertiary)" }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  return (
    <div
      className="animate-in"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 48px)",
        maxWidth: 900,
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px 0",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <Link
          href={`/dashboard/employees/${employeeId}`}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
            textDecoration: "none",
            transition: "all 0.15s",
          }}
        >
          <ArrowLeft size={16} />
        </Link>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: "linear-gradient(135deg, rgba(93, 121, 223, 0.12), rgba(169, 75, 210, 0.12))",
            border: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
          }}
        >
          {employee.emoji || "A"}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{employee.name}</div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{employee.jobTitle}</div>
        </div>
        <div className={`status-badge status-${employee.status}`}>
          <span className="status-dot" />
          <span style={{ textTransform: "capitalize" }}>{employee.status}</span>
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "24px 0",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              flexDirection: msg.role === "user" ? "row-reverse" : "row",
            }}
          >
            {/* Avatar */}
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                ...(msg.role === "assistant"
                  ? {
                      background: "linear-gradient(135deg, rgba(93, 121, 223, 0.15), rgba(169, 75, 210, 0.15))",
                      border: "1px solid var(--border)",
                      fontSize: 16,
                    }
                  : {
                      background: "rgba(255, 255, 255, 0.06)",
                      border: "1px solid var(--border)",
                    }),
              }}
            >
              {msg.role === "assistant" ? (
                <span>{employee.emoji || <Bot size={16} />}</span>
              ) : (
                <User size={14} style={{ color: "var(--text-secondary)" }} />
              )}
            </div>

            {/* Bubble */}
            <div
              style={{
                maxWidth: "75%",
                padding: "12px 16px",
                borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                background:
                  msg.role === "user"
                    ? "linear-gradient(135deg, rgba(93, 121, 223, 0.15), rgba(93, 121, 223, 0.08))"
                    : "var(--bg-card)",
                border: "1px solid var(--border)",
                fontSize: 14,
                lineHeight: 1.6,
                color: "var(--text)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {msg.content}
              {msg.mode === "demo" && (
                <div
                  style={{
                    marginTop: 8,
                    padding: "4px 8px",
                    borderRadius: 4,
                    background: "rgba(245, 158, 11, 0.1)",
                    border: "1px solid rgba(245, 158, 11, 0.2)",
                    fontSize: 11,
                    color: "#f59e0b",
                  }}
                >
                  Demo mode — provision infrastructure in Settings for live responses
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {sending && (
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "linear-gradient(135deg, rgba(93, 121, 223, 0.15), rgba(169, 75, 210, 0.15))",
                border: "1px solid var(--border)",
                fontSize: 16,
              }}
            >
              {employee.emoji || "A"}
            </div>
            <div
              style={{
                padding: "12px 16px",
                borderRadius: "16px 16px 16px 4px",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                display: "flex",
                gap: 4,
                alignItems: "center",
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-tertiary)", animation: "bounce 1.4s infinite ease-in-out", animationDelay: "0s" }} />
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-tertiary)", animation: "bounce 1.4s infinite ease-in-out", animationDelay: "0.2s" }} />
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-tertiary)", animation: "bounce 1.4s infinite ease-in-out", animationDelay: "0.4s" }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        style={{
          flexShrink: 0,
          padding: "16px 0",
          borderTop: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
            background: "var(--bg-card)",
            borderRadius: 16,
            border: "1px solid var(--border)",
            padding: "8px 12px",
            transition: "border-color 0.15s",
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${employee.name}...`}
            disabled={sending || employee.status !== "active"}
            rows={1}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              resize: "none",
              color: "var(--text)",
              fontSize: 14,
              lineHeight: 1.5,
              padding: "4px 0",
              fontFamily: "inherit",
              maxHeight: 150,
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending || employee.status !== "active"}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              cursor: input.trim() && !sending ? "pointer" : "default",
              background:
                input.trim() && !sending
                  ? "linear-gradient(135deg, var(--blue), var(--purple))"
                  : "rgba(255, 255, 255, 0.04)",
              color:
                input.trim() && !sending ? "#fff" : "var(--text-tertiary)",
              transition: "all 0.2s",
              flexShrink: 0,
            }}
          >
            {sending ? (
              <Loader2 size={16} style={{ animation: "spin 0.8s linear infinite" }} />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>
        {employee.status !== "active" && (
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", textAlign: "center", marginTop: 8 }}>
            Chat is disabled — employee is {employee.status}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0) }
          40% { transform: translateY(-6px) }
        }
      `}</style>
    </div>
  );
}
