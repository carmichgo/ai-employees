"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Send, Loader2, Bot, User, Download, FileText, FileSpreadsheet, FileCode, File } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadChat = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
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
    } catch (err: any) {
      setError(err.message || "Failed to load chat");
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    loadChat();
  }, [loadChat]);

  // Auto-poll while employee is provisioning so chat unlocks automatically
  useEffect(() => {
    if (!employee || (employee.status !== "provisioning" && employee.status !== "onboarding")) return;
    const interval = setInterval(() => {
      api.getEmployee(employeeId).then((res) => {
        setEmployee(res.employee);
      }).catch(() => {});
    }, 4000);
    return () => clearInterval(interval);
  }, [employee?.status, employeeId]);

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

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "80vh" }}>
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            border: "2px solid var(--border, #e5e5e5)",
            borderTopColor: "var(--text-tertiary, #a3a3a3)",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "80vh", gap: 16 }}>
        <div style={{ fontSize: 14, color: "#ef4444" }}>{error || "Failed to load employee"}</div>
        <button
          onClick={loadChat}
          style={{
            padding: "8px 20px",
            borderRadius: "var(--radius-md, 8px)",
            border: "1px solid var(--border, #e5e5e5)",
            background: "var(--bg, #ffffff)",
            color: "var(--text, #0a0a0a)",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Retry
        </button>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  return (
    <div
      className="animate-in chat-container"
      style={{
        "--text": "#0a0a0a",
        "--text-secondary": "#525252",
        "--text-tertiary": "#a3a3a3",
        "--border": "#e5e5e5",
        "--bg": "#ffffff",
        "--bg-secondary": "#f5f5f5",
        "--blue": "#2563eb",
        "--radius-sm": "6px",
        "--radius-md": "8px",
        "--radius-lg": "10px",
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 48px)",
        maxWidth: 900,
        margin: "0 auto",
      } as React.CSSProperties}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px 0",
          borderBottom: "1px solid var(--border, #e5e5e5)",
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
            borderRadius: "var(--radius-md, 8px)",
            border: "1px solid var(--border, #e5e5e5)",
            background: "var(--bg, #ffffff)",
            color: "var(--text-secondary, #525252)",
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
            borderRadius: "var(--radius-lg, 10px)",
            background: "var(--bg-secondary, #f5f5f5)",
            border: "1px solid var(--border, #e5e5e5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
          }}
        >
          {employee.emoji || "A"}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text, #0a0a0a)" }}>{employee.name}</div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary, #a3a3a3)" }}>{employee.jobTitle}</div>
        </div>
        <div className={`status-badge status-${employee.status}`}>
          <span className="status-dot" />
          <span style={{ textTransform: "capitalize" }}>{employee.status}</span>
        </div>
      </div>

      {/* Messages */}
      <div
        className="chat-messages"
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
              className="chat-avatar"
              style={{
                width: 32,
                height: 32,
                borderRadius: "var(--radius-lg, 10px)",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--bg-secondary, #f5f5f5)",
                border: "1px solid var(--border, #e5e5e5)",
                ...(msg.role === "assistant" ? { fontSize: 16 } : {}),
              }}
            >
              {msg.role === "assistant" ? (
                <span>{employee.emoji || <Bot size={16} />}</span>
              ) : (
                <User size={14} style={{ color: "var(--text-secondary, #525252)" }} />
              )}
            </div>

            {/* Bubble */}
            <div
              className="chat-bubble"
              style={{
                maxWidth: "75%",
                padding: "12px 16px",
                borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                background:
                  msg.role === "user"
                    ? "rgba(37, 99, 235, 0.06)"
                    : "var(--bg-secondary, #f5f5f5)",
                border: "1px solid var(--border, #e5e5e5)",
                fontSize: 14,
                lineHeight: 1.6,
                color: "var(--text, #0a0a0a)",
                wordBreak: "break-word",
              }}
            >
              <MessageContent content={msg.content} employeeId={employeeId} />
              {msg.mode === "demo" && (
                <div
                  style={{
                    marginTop: 8,
                    padding: "4px 8px",
                    borderRadius: 4,
                    background: "rgba(245, 158, 11, 0.08)",
                    border: "1px solid rgba(245, 158, 11, 0.2)",
                    fontSize: 11,
                    color: "#b45309",
                  }}
                >
                  Getting ready — this employee is still being set up
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {sending && (
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div
              className="chat-avatar"
              style={{
                width: 32,
                height: 32,
                borderRadius: "var(--radius-lg, 10px)",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--bg-secondary, #f5f5f5)",
                border: "1px solid var(--border, #e5e5e5)",
                fontSize: 16,
              }}
            >
              {employee.emoji || "A"}
            </div>
            <div
              style={{
                padding: "12px 16px",
                borderRadius: "16px 16px 16px 4px",
                background: "var(--bg-secondary, #f5f5f5)",
                border: "1px solid var(--border, #e5e5e5)",
                display: "flex",
                gap: 4,
                alignItems: "center",
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-tertiary, #a3a3a3)", animation: "bounce 1.4s infinite ease-in-out", animationDelay: "0s" }} />
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-tertiary, #a3a3a3)", animation: "bounce 1.4s infinite ease-in-out", animationDelay: "0.2s" }} />
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-tertiary, #a3a3a3)", animation: "bounce 1.4s infinite ease-in-out", animationDelay: "0.4s" }} />
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
          borderTop: "1px solid var(--border, #e5e5e5)",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
            background: "var(--bg, #ffffff)",
            borderRadius: 16,
            border: "1px solid var(--border, #e5e5e5)",
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
              color: "var(--text, #0a0a0a)",
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
              borderRadius: "var(--radius-lg, 10px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              cursor: input.trim() && !sending ? "pointer" : "default",
              background:
                input.trim() && !sending
                  ? "var(--text, #0a0a0a)"
                  : "var(--bg-secondary, #f5f5f5)",
              color:
                input.trim() && !sending ? "#ffffff" : "var(--text-tertiary, #a3a3a3)",
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
        {employee.status === "provisioning" && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            marginTop: 8, padding: "8px 14px", borderRadius: 8,
            background: "rgba(217, 119, 6, 0.06)", border: "1px solid rgba(217, 119, 6, 0.14)",
          }}>
            <Loader2 size={14} style={{ color: "#d97706", animation: "spin 1.5s linear infinite" }} />
            <span style={{ fontSize: 13, color: "#b45309" }}>
              Setting up {employee.name}&apos;s workstation... Chat will be available shortly.
            </span>
          </div>
        )}
        {employee.status !== "active" && employee.status !== "provisioning" && (
          <div style={{ fontSize: 12, color: "var(--text-tertiary, #a3a3a3)", textAlign: "center", marginTop: 8 }}>
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

        @media (max-width: 768px) {
          .chat-container {
            height: calc(100vh - 68px - 48px) !important;
          }
          .chat-avatar {
            display: none !important;
          }
          .chat-bubble {
            max-width: 90% !important;
          }
          .chat-header-employee-name {
            max-width: 120px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .chat-messages {
            padding: 16px 0 !important;
            gap: 12px !important;
          }
        }

        /* Markdown styles for chat messages */
        .markdown-body { overflow-wrap: break-word; color: var(--text, #0a0a0a); }
        .markdown-body > *:first-child { margin-top: 0; }
        .markdown-body > *:last-child { margin-bottom: 0; }
        .markdown-body p { margin: 0.4em 0; }
        .markdown-body h1, .markdown-body h2, .markdown-body h3,
        .markdown-body h4, .markdown-body h5, .markdown-body h6 {
          margin: 0.6em 0 0.3em;
          font-weight: 600;
          line-height: 1.3;
          color: var(--text, #0a0a0a);
        }
        .markdown-body h1 { font-size: 1.35em; }
        .markdown-body h2 { font-size: 1.2em; }
        .markdown-body h3 { font-size: 1.1em; }
        .markdown-body h4 { font-size: 1em; }
        .markdown-body strong { font-weight: 600; }
        .markdown-body em { font-style: italic; }
        .markdown-body del { text-decoration: line-through; opacity: 0.7; }
        .markdown-body a { color: var(--blue, #2563eb); text-decoration: underline; }
        .markdown-body code {
          font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
          font-size: 0.88em;
          padding: 0.15em 0.4em;
          border-radius: 4px;
          background: #f5f5f5;
          border: 1px solid var(--border, #e5e5e5);
          color: var(--text, #0a0a0a);
        }
        .markdown-body pre {
          margin: 0.5em 0;
          padding: 12px 14px;
          border-radius: var(--radius-md, 8px);
          background: #f9fafb;
          border: 1px solid var(--border, #e5e5e5);
          overflow-x: auto;
        }
        .markdown-body pre code {
          padding: 0;
          background: none;
          border: none;
          font-size: 0.85em;
          line-height: 1.5;
        }
        .markdown-body ul, .markdown-body ol {
          margin: 0.4em 0;
          padding-left: 1.5em;
          list-style-position: outside;
        }
        .markdown-body ul { list-style-type: disc; }
        .markdown-body ol { list-style-type: decimal; }
        .markdown-body li { margin: 0.15em 0; display: list-item; }
        .markdown-body li > p { margin: 0.2em 0; }
        .markdown-body blockquote {
          margin: 0.5em 0;
          padding: 0.3em 0 0.3em 1em;
          border-left: 3px solid var(--border, #e5e5e5);
          color: var(--text-secondary, #525252);
        }
        .markdown-body blockquote > p { margin: 0.2em 0; }
        .markdown-body hr {
          margin: 0.8em 0;
          border: none;
          border-top: 1px solid var(--border, #e5e5e5);
        }
        .markdown-body table {
          margin: 0.5em 0;
          border-collapse: collapse;
          width: 100%;
          font-size: 0.9em;
        }
        .markdown-body th, .markdown-body td {
          padding: 6px 10px;
          border: 1px solid var(--border, #e5e5e5);
          text-align: left;
        }
        .markdown-body th {
          font-weight: 600;
          background: var(--bg-secondary, #f5f5f5);
          color: var(--text, #0a0a0a);
        }
        .markdown-body tr:nth-child(even) {
          background: rgba(0, 0, 0, 0.02);
        }
        .markdown-body img { max-width: 100%; border-radius: var(--radius-md, 8px); }
        .markdown-body input[type="checkbox"] {
          margin-right: 6px;
          vertical-align: middle;
        }

        /* File download chips */
        .file-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          margin: 2px 0;
          border-radius: var(--radius-sm, 6px);
          background: rgba(37, 99, 235, 0.04);
          border: 1px solid rgba(37, 99, 235, 0.15);
          color: var(--blue, #2563eb);
          font-size: 12px;
          font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
          cursor: pointer;
          transition: all 0.15s;
          text-decoration: none;
          vertical-align: middle;
        }
        .file-chip:hover {
          background: rgba(37, 99, 235, 0.1);
          border-color: rgba(37, 99, 235, 0.3);
        }
        .file-chip:disabled {
          opacity: 0.6;
          cursor: wait;
        }
        .file-chip-name {
          max-width: 250px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}

/** File extensions we detect as downloadable files in inline code */
const FILE_EXT_RE = /^[\w][\w. -]*\.(csv|tsv|txt|md|pdf|doc|docx|xlsx|xls|html|xml|json|yaml|yml|py|js|ts|tsx|jsx|sh|bash|sql|rb|go|java|css|scss|less|zip|tar|gz|tgz|rar|7z|png|jpe?g|gif|webp|svg|bmp|mp3|mp4|wav|ogg|log|cfg|ini|toml|env|pptx?|rtf)$/i;

/** Render markdown text via react-markdown + remark-gfm */
function MarkdownText({ text, employeeId }: { text: string; employeeId: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Open links in new tab
          a: ({ href, children, ...props }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
              {children}
            </a>
          ),
          // Inline images via our ImageEmbed component
          img: ({ src, alt }) => (
            typeof src === "string" ? <ImageEmbed src={src} alt={alt || "image"} /> : null
          ),
          // Detect filenames in inline code and make them downloadable
          code: ({ children, className, ...props }) => {
            // If it has a className (language-xxx), it's inside a code block — render normally
            if (className) {
              return <code className={className} {...props}>{children}</code>;
            }
            // Check if the text content looks like a filename
            const text = String(children).trim();
            if (FILE_EXT_RE.test(text)) {
              return <FileChip filename={text} employeeId={employeeId} />;
            }
            return <code {...props}>{children}</code>;
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

/** Render message content with inline images and markdown */
function MessageContent({ content, employeeId }: { content: string; employeeId: string }) {
  // Split content into text and image parts
  // Detect: backtick-wrapped workspace URLs and bare workspace image URLs
  // (Markdown images ![alt](url) are handled by react-markdown)
  const imagePattern =
    /`(\/api\/employees\/[^\s`]+\.(?:png|jpe?g|gif|webp|svg|bmp))`|(?:^|[\s:;,(])(\/api\/employees\/[^\s)\]>"'`]+\.(?:png|jpe?g|gif|webp|svg|bmp))/gm;

  const parts: Array<{ type: "text" | "image"; value: string; alt?: string }> = [];
  let lastIndex = 0;
  let match;

  while ((match = imagePattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: content.slice(lastIndex, match.index) });
    }

    if (match[1]) {
      // Backtick-wrapped URL
      parts.push({ type: "image", value: match[1].trim(), alt: "image" });
    } else if (match[2]) {
      // Bare workspace URL
      const url = match[2].trim();
      const leadingChar = match[0].charAt(0);
      if (leadingChar && /[\s:;,(]/.test(leadingChar)) {
        parts.push({ type: "text", value: leadingChar });
      }
      parts.push({ type: "image", value: url, alt: "image" });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: "text", value: content.slice(lastIndex) });
  }

  // If no bare workspace images found, render entire content as markdown
  if (parts.length === 0 || parts.every((p) => p.type === "text")) {
    return <MarkdownText text={content} employeeId={employeeId} />;
  }

  return (
    <>
      {parts.map((part, i) =>
        part.type === "image" ? (
          <ImageEmbed key={i} src={part.value} alt={part.alt || "image"} />
        ) : (
          <MarkdownText key={i} text={part.value} employeeId={employeeId} />
        ),
      )}
    </>
  );
}

/** Get a file icon based on extension */
function getFileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (["csv", "tsv", "xlsx", "xls"].includes(ext)) return FileSpreadsheet;
  if (["py", "js", "ts", "tsx", "jsx", "sh", "bash", "sql", "rb", "go", "java", "css", "scss", "html", "xml", "json", "yaml", "yml"].includes(ext)) return FileCode;
  if (["txt", "md", "log", "rtf", "doc", "docx", "pdf"].includes(ext)) return FileText;
  return File;
}

/** Clickable file chip that downloads from the employee workspace */
function FileChip({ filename, employeeId }: { filename: string; employeeId: string }) {
  const [downloading, setDownloading] = useState(false);
  const Icon = getFileIcon(filename);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`/api/employees/${employeeId}/workspace/${encodeURIComponent(filename)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("File not found");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // If download fails, try opening in new tab as fallback
      window.open(`/api/employees/${employeeId}/workspace/${encodeURIComponent(filename)}`, "_blank");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className="file-chip"
      title={`Download ${filename}`}
    >
      <Icon size={13} />
      <span className="file-chip-name">{filename}</span>
      {downloading ? (
        <Loader2 size={11} style={{ animation: "spin 0.8s linear infinite" }} />
      ) : (
        <Download size={11} />
      )}
    </button>
  );
}

/** Image embed with loading state and error fallback */
function ImageEmbed({ src, alt }: { src: string; alt: string }) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div style={{ margin: "8px 0" }}>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 12px",
            borderRadius: "var(--radius-md, 8px)",
            background: "var(--bg-secondary, #f5f5f5)",
            border: "1px solid var(--border, #e5e5e5)",
            color: "var(--blue, #2563eb)",
            fontSize: 13,
            textDecoration: "none",
          }}
        >
          {alt || src.split("/").pop() || "View file"}
        </a>
      </div>
    );
  }

  return (
    <div style={{ margin: "8px 0" }}>
      <a href={src} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          onError={() => setError(true)}
          style={{
            maxWidth: "100%",
            maxHeight: 400,
            borderRadius: "var(--radius-md, 8px)",
            border: "1px solid var(--border, #e5e5e5)",
            cursor: "pointer",
          }}
          loading="lazy"
        />
      </a>
    </div>
  );
}
