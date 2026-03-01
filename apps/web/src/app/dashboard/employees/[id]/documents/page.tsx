"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  ArrowLeft,
  FileText,
  Download,
  Loader2,
  File,
  Image,
  Code,
  FileSpreadsheet,
  FolderOpen,
  Search,
} from "lucide-react";
import Link from "next/link";

type WorkspaceFile = {
  name: string;
  path: string;
  size: number;
  modifiedAt: string;
  type: string;
};

type Employee = {
  id: string;
  name: string;
  emoji: string | null;
  jobTitle: string;
  status: string;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function getFileIcon(type: string) {
  const imageTypes = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"];
  const codeTypes = ["ts", "js", "py", "sh", "json", "yaml", "yml", "css", "html", "xml", "sql"];
  const spreadsheetTypes = ["csv", "tsv", "xlsx", "xls"];

  if (imageTypes.includes(type)) return Image;
  if (codeTypes.includes(type)) return Code;
  if (spreadsheetTypes.includes(type)) return FileSpreadsheet;
  if (type === "md" || type === "txt") return FileText;
  if (type === "pdf") return FileText;
  return File;
}

export default function DocumentsPage() {
  const params = useParams();
  const router = useRouter();
  const employeeId = params.id as string;

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const [empRes, docsRes] = await Promise.all([
          api.getEmployee(employeeId),
          api.listDocuments(employeeId),
        ]);
        setEmployee(empRes.employee);
        setFiles(docsRes.files || []);
      } catch (err: any) {
        if (err.status === 401) router.push("/login");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [employeeId, router]);

  const filteredFiles = files.filter((f) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q);
  });

  // Group files by directory
  const grouped = new Map<string, WorkspaceFile[]>();
  for (const file of filteredFiles) {
    const dir = file.path.includes("/")
      ? file.path.substring(0, file.path.lastIndexOf("/"))
      : "";
    if (!grouped.has(dir)) grouped.set(dir, []);
    grouped.get(dir)!.push(file);
  }

  const downloadUrl = (file: WorkspaceFile) => {
    // Skills and workspace-main files have paths relative to config base (e.g. "skills/foo/SKILL.md", "workspace-main/file.png")
    // Regular workspace files need the "workspace/" prefix added
    const needsPrefix = !file.path.startsWith("skills/") && !file.path.startsWith("workspace-main/");
    const prefix = needsPrefix ? "workspace/" : "";
    return `/api/employees/${employeeId}/workspace/${prefix}${file.path}`;
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 400 }}>
        <Loader2 size={32} style={{ color: "var(--blue)", animation: "spin 2s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  if (!employee) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <p style={{ color: "var(--text-secondary)" }}>Employee not found.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Back link */}
      <Link
        href={`/dashboard/employees/${employeeId}`}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          color: "var(--text-secondary)", textDecoration: "none", fontSize: 13,
          marginBottom: 16,
        }}
      >
        <ArrowLeft size={14} /> Back to {employee.name}
      </Link>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: "var(--radius)",
            background: "var(--bg-secondary)", border: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
          }}>
            {employee.emoji || "A"}
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
              {employee.name}&apos;s Documents
            </h1>
            <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
              {files.length} file{files.length !== 1 ? "s" : ""} in workspace
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 20 }}>
        <Search size={14} style={{
          position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
          color: "var(--text-tertiary)",
        }} />
        <input
          type="text"
          placeholder="Search files..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%", padding: "8px 12px 8px 34px",
            border: "1px solid var(--border)", borderRadius: "var(--radius)",
            fontSize: 13, background: "var(--bg)", color: "var(--text)",
            outline: "none",
          }}
        />
      </div>

      {/* File list */}
      {filteredFiles.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <FolderOpen size={32} style={{ color: "var(--text-tertiary)", marginBottom: 12 }} />
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            {search ? "No files match your search." : "No documents yet. Files created by the employee will appear here."}
          </p>
        </div>
      ) : (
        <div>
          {Array.from(grouped.entries()).map(([dir, dirFiles]) => (
            <div key={dir || "__root"} style={{ marginBottom: 16 }}>
              {dir && (
                <div style={{
                  fontSize: 12, fontWeight: 500, color: "var(--text-tertiary)",
                  marginBottom: 6, padding: "0 4px",
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  <FolderOpen size={12} /> {dir}
                </div>
              )}
              <div className="card" style={{ overflow: "hidden" }}>
                {dirFiles.map((file, i) => {
                  const Icon = getFileIcon(file.type);
                  return (
                    <a
                      key={file.path}
                      href={downloadUrl(file)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "10px 16px", textDecoration: "none", color: "var(--text)",
                        borderBottom: i < dirFiles.length - 1 ? "1px solid var(--border)" : "none",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-secondary)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = ""}
                    >
                      <Icon size={16} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {file.name}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                        {formatSize(file.size)}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-tertiary)", whiteSpace: "nowrap", minWidth: 60 }}>
                        {formatDate(file.modifiedAt)}
                      </div>
                      <Download size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
