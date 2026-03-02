"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  FileText,
  Download,
  Loader2,
  File,
  Image,
  Code,
  FileSpreadsheet,
  FolderOpen,
  Search,
  Users,
  X,
  Eye,
  ExternalLink,
  Trash2,
  CheckSquare,
  Square,
  Upload,
} from "lucide-react";

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

const IMAGE_TYPES = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"];
const TEXT_TYPES = [
  "md", "txt", "json", "js", "ts", "py", "sh", "css", "html", "xml",
  "yaml", "yml", "sql", "csv", "tsv", "log", "env", "toml", "ini",
  "cfg", "conf", "jsx", "tsx", "rs", "go", "rb", "java", "c", "cpp",
  "h", "hpp", "makefile", "dockerfile",
];
const PDF_TYPES = ["pdf"];
const VIDEO_TYPES = ["mp4", "webm", "ogg"];
const AUDIO_TYPES = ["mp3", "wav", "ogg", "m4a"];

function canPreview(type: string): boolean {
  const t = type.toLowerCase();
  return IMAGE_TYPES.includes(t) || TEXT_TYPES.includes(t) || PDF_TYPES.includes(t)
    || VIDEO_TYPES.includes(t) || AUDIO_TYPES.includes(t);
}

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
  const codeTypes = ["ts", "js", "py", "sh", "json", "yaml", "yml", "css", "html", "xml", "sql"];
  const spreadsheetTypes = ["csv", "tsv", "xlsx", "xls"];

  if (IMAGE_TYPES.includes(type)) return Image;
  if (codeTypes.includes(type)) return Code;
  if (spreadsheetTypes.includes(type)) return FileSpreadsheet;
  if (type === "md" || type === "txt") return FileText;
  if (type === "pdf") return FileText;
  return File;
}

/* ─── File Viewer Component ────────────────────────────────────── */

function FileViewer({
  file,
  fileUrl,
  onClose,
}: {
  file: WorkspaceFile;
  fileUrl: string;
  onClose: () => void;
}) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  const [textError, setTextError] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const type = file.type.toLowerCase();

  // Fetch text content for text-based files
  useEffect(() => {
    if (!TEXT_TYPES.includes(type)) return;
    setLoadingText(true);
    setTextError(false);
    fetch(fileUrl)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.text();
      })
      .then((text) => setTextContent(text))
      .catch(() => setTextError(true))
      .finally(() => setLoadingText(false));
  }, [fileUrl, type]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Close on overlay click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  const renderPreview = () => {
    if (IMAGE_TYPES.includes(type)) {
      return (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1, overflow: "auto", padding: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fileUrl}
            alt={file.name}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: "var(--radius-sm)" }}
          />
        </div>
      );
    }

    if (PDF_TYPES.includes(type)) {
      return (
        <iframe
          src={fileUrl}
          title={file.name}
          style={{ flex: 1, border: "none", borderRadius: "var(--radius-sm)", background: "white" }}
        />
      );
    }

    if (VIDEO_TYPES.includes(type)) {
      return (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1, padding: 20 }}>
          <video controls style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: "var(--radius-sm)" }}>
            <source src={fileUrl} />
          </video>
        </div>
      );
    }

    if (AUDIO_TYPES.includes(type)) {
      return (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1, padding: 20 }}>
          <audio controls style={{ width: "100%", maxWidth: 500 }}>
            <source src={fileUrl} />
          </audio>
        </div>
      );
    }

    if (TEXT_TYPES.includes(type)) {
      if (loadingText) {
        return (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1 }}>
            <Loader2 size={24} style={{ color: "var(--blue)", animation: "spin 2s linear infinite" }} />
          </div>
        );
      }
      if (textError) {
        return (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1, color: "var(--text-secondary)" }}>
            Failed to load file content.
          </div>
        );
      }

      // Render markdown files with formatted output
      if (type === "md" && textContent !== null) {
        return (
          <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
            <div
              className="markdown-body"
              style={{
                fontSize: 14,
                lineHeight: 1.7,
                color: "var(--text)",
                padding: 24,
                background: "var(--bg-secondary)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
              }}
            >
              <style>{`
                .markdown-body h1 { font-size: 1.8em; font-weight: 700; margin: 0 0 16px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
                .markdown-body h2 { font-size: 1.4em; font-weight: 600; margin: 24px 0 12px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
                .markdown-body h3 { font-size: 1.15em; font-weight: 600; margin: 20px 0 8px; }
                .markdown-body h4, .markdown-body h5, .markdown-body h6 { font-size: 1em; font-weight: 600; margin: 16px 0 8px; }
                .markdown-body p { margin: 0 0 12px; }
                .markdown-body ul, .markdown-body ol { margin: 0 0 12px; padding-left: 24px; }
                .markdown-body li { margin: 4px 0; }
                .markdown-body blockquote { margin: 0 0 12px; padding: 8px 16px; border-left: 3px solid var(--border); color: var(--text-secondary); background: var(--bg); border-radius: 0 var(--radius-sm) var(--radius-sm) 0; }
                .markdown-body code { font-family: 'SF Mono', 'Fira Code', Menlo, Consolas, monospace; font-size: 0.9em; background: var(--bg); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border); }
                .markdown-body pre { margin: 0 0 12px; padding: 16px; background: var(--bg); border-radius: var(--radius-sm); border: 1px solid var(--border); overflow-x: auto; }
                .markdown-body pre code { background: none; border: none; padding: 0; font-size: 13px; }
                .markdown-body table { border-collapse: collapse; margin: 0 0 12px; width: 100%; }
                .markdown-body th, .markdown-body td { border: 1px solid var(--border); padding: 8px 12px; text-align: left; }
                .markdown-body th { background: var(--bg); font-weight: 600; }
                .markdown-body hr { border: none; border-top: 1px solid var(--border); margin: 20px 0; }
                .markdown-body a { color: var(--blue, #2563eb); text-decoration: none; }
                .markdown-body a:hover { text-decoration: underline; }
                .markdown-body img { max-width: 100%; border-radius: var(--radius-sm); }
                .markdown-body input[type="checkbox"] { margin-right: 6px; }
              `}</style>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{textContent}</ReactMarkdown>
            </div>
          </div>
        );
      }

      return (
        <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
          <pre
            style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.6,
              fontFamily: "'SF Mono', 'Fira Code', 'Fira Mono', Menlo, Consolas, monospace",
              color: "var(--text)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "var(--bg-secondary)",
              padding: 16,
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              minHeight: "100%",
            }}
          >
            {textContent}
          </pre>
        </div>
      );
    }

    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1, color: "var(--text-secondary)" }}>
        Preview not available for this file type.
      </div>
    );
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 40,
      }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div
        style={{
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          width: "100%",
          maxWidth: 1000,
          height: "calc(100vh - 80px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Viewer header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <Eye size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
            <span
              style={{
                fontSize: 13,
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {file.name}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)", flexShrink: 0 }}>
              {formatSize(file.size)}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                fontSize: 12,
                color: "var(--text-secondary)",
                textDecoration: "none",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg)",
                cursor: "pointer",
              }}
            >
              <ExternalLink size={12} /> Open
            </a>
            <a
              href={fileUrl}
              download={file.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                fontSize: 12,
                color: "var(--text-secondary)",
                textDecoration: "none",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg)",
                cursor: "pointer",
              }}
            >
              <Download size={12} /> Download
            </a>
            <button
              onClick={onClose}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                border: "none",
                borderRadius: "var(--radius-sm)",
                background: "transparent",
                color: "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Viewer body */}
        {renderPreview()}
      </div>
    </div>
  );
}

/* ─── Main Page ────────────────────────────────────────────────── */

export default function DocumentsPageWrapper() {
  return (
    <Suspense
      fallback={
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 400 }}>
          <Loader2 size={32} style={{ color: "var(--blue)", animation: "spin 2s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      }
    >
      <DocumentsPage />
    </Suspense>
  );
}

function DocumentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("employee");

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [search, setSearch] = useState("");
  const [viewingFile, setViewingFile] = useState<WorkspaceFile | null>(null);
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

  const [deleting, setDeleting] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null); // folder path or "__global"
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetFolder = useRef<string | null>(null);

  // Clear selection when switching employees
  useEffect(() => {
    setSelected(new Set());
  }, [selectedId]);

  const toggleSelect = (filePath: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filteredFiles.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredFiles.map((f) => f.path)));
    }
  };

  const handleDelete = async (file: WorkspaceFile) => {
    if (!selectedId || !confirm(`Delete "${file.name}"? This cannot be undone.`)) return;
    setDeleting(file.path);
    try {
      await api.deleteDocument(selectedId, file.path);
      setFiles((prev) => prev.filter((f) => f.path !== file.path));
      setSelected((prev) => { const next = new Set(prev); next.delete(file.path); return next; });
      if (viewingFile?.path === file.path) setViewingFile(null);
    } catch {
      alert("Failed to delete file");
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteFolder = async (dir: string, dirFiles: WorkspaceFile[]) => {
    if (!selectedId || !confirm(`Delete folder "${dir}" and all ${dirFiles.length} file(s) inside? This cannot be undone.`)) return;
    setDeleting(dir);
    try {
      await api.deleteFolder(selectedId, dir);
      const pathsInDir = new Set(dirFiles.map((f) => f.path));
      setFiles((prev) => prev.filter((f) => !pathsInDir.has(f.path)));
      setSelected((prev) => { const next = new Set(prev); pathsInDir.forEach((p) => next.delete(p)); return next; });
      if (viewingFile && pathsInDir.has(viewingFile.path)) setViewingFile(null);
    } catch {
      alert("Failed to delete folder");
    } finally {
      setDeleting(null);
    }
  };

  const handleBatchDelete = async () => {
    if (!selectedId || selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} selected file(s)? This cannot be undone.`)) return;
    setBatchDeleting(true);
    const toDelete = Array.from(selected);
    const failed: string[] = [];
    for (const filePath of toDelete) {
      try {
        await api.deleteDocument(selectedId, filePath);
      } catch {
        failed.push(filePath);
      }
    }
    setFiles((prev) => prev.filter((f) => failed.includes(f.path) || !selected.has(f.path)));
    if (viewingFile && selected.has(viewingFile.path) && !failed.includes(viewingFile.path)) setViewingFile(null);
    setSelected(new Set(failed));
    setBatchDeleting(false);
    if (failed.length > 0) alert(`Failed to delete ${failed.length} file(s).`);
  };

  const triggerUpload = (folder: string | null) => {
    uploadTargetFolder.current = folder;
    fileInputRef.current?.click();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    // Reset input so the same file can be re-selected
    e.target.value = "";

    const folder = uploadTargetFolder.current;
    const uploadKey = folder || "__global";
    setUploading(uploadKey);
    try {
      await api.uploadFile(selectedId, file, folder || "workspace/uploads");
      // Refresh file list
      const res = await api.listDocuments(selectedId);
      setFiles(res.files || []);
    } catch {
      alert("Failed to upload file");
    } finally {
      setUploading(null);
    }
  };

  // Load employees
  useEffect(() => {
    api
      .listEmployees()
      .then((res) => {
        const active = (res.employees || []).filter(
          (e: Employee) => e.status !== "terminated",
        );
        setEmployees(active);
        if (!selectedId && active.length > 0) {
          router.replace(`/dashboard/documents?employee=${active[0].id}`);
        }
      })
      .catch((err: any) => {
        if (err.status === 401) router.push("/login");
      })
      .finally(() => setLoadingEmployees(false));
  }, [router, selectedId]);

  // Load documents when employee changes
  useEffect(() => {
    if (!selectedId) {
      setFiles([]);
      return;
    }
    setLoadingFiles(true);
    setSearch("");
    setViewingFile(null);
    api
      .listDocuments(selectedId)
      .then((res) => setFiles(res.files || []))
      .catch(() => setFiles([]))
      .finally(() => setLoadingFiles(false));
  }, [selectedId]);

  const selectedEmployee = employees.find((e) => e.id === selectedId);

  const fileUrl = (file: WorkspaceFile) => {
    // workspace-main/ and skills/ paths are already relative to config base — no extra prefix needed
    const needsPrefix = !file.path.startsWith("skills/") && !file.path.startsWith("workspace-main/");
    const prefix = needsPrefix ? "workspace/" : "";
    return `/api/employees/${selectedId}/workspace/${prefix}${file.path}`;
  };

  const handleFileClick = (e: React.MouseEvent, file: WorkspaceFile) => {
    e.preventDefault();
    if (canPreview(file.type)) {
      setViewingFile(file);
    } else {
      // Non-previewable: open download in new tab
      window.open(fileUrl(file), "_blank");
    }
  };

  const closeViewer = useCallback(() => setViewingFile(null), []);

  if (loadingEmployees) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 400 }}>
        <Loader2 size={32} style={{ color: "var(--blue)", animation: "spin 2s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>Documents</h1>

      {/* File Viewer Modal */}
      {viewingFile && selectedId && (
        <FileViewer
          file={viewingFile}
          fileUrl={fileUrl(viewingFile)}
          onClose={closeViewer}
        />
      )}

      <div style={{ display: "flex", gap: 20, minHeight: "calc(100vh - 120px)" }}>
        {/* Employee list - left panel */}
        <div
          style={{
            width: 240,
            flexShrink: 0,
            borderRight: "1px solid var(--border)",
            paddingRight: 20,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "var(--text-tertiary)",
              marginBottom: 8,
              letterSpacing: "0.02em",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Users size={11} /> EMPLOYEES
          </div>

          {employees.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>No employees yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {employees.map((emp) => {
                const active = emp.id === selectedId;
                return (
                  <button
                    key={emp.id}
                    onClick={() => router.push(`/dashboard/documents?employee=${emp.id}`)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      background: active ? "var(--bg)" : "transparent",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                      textAlign: "left",
                      boxShadow: active ? "var(--shadow-xs)" : "none",
                      transition: "all 0.1s",
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "var(--radius-sm)",
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                        flexShrink: 0,
                      }}
                    >
                      {emp.emoji || emp.name.charAt(0)}
                    </div>
                    <div style={{ minWidth: 0, overflow: "hidden" }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: active ? 500 : 400,
                          color: active ? "var(--text)" : "var(--text-secondary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {emp.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-tertiary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {emp.jobTitle}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* File browser - right panel */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!selectedEmployee ? (
            <div style={{ padding: 40, textAlign: "center" }}>
              <FolderOpen size={32} style={{ color: "var(--text-tertiary)", marginBottom: 12 }} />
              <p style={{ color: "var(--text-secondary)", margin: 0 }}>
                Select an employee to view their documents.
              </p>
            </div>
          ) : (
            <>
              {/* Hidden file input for uploads */}
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: "none" }}
                onChange={handleUpload}
              />

              {/* Header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "var(--radius)",
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 18,
                    }}
                  >
                    {selectedEmployee.emoji || selectedEmployee.name.charAt(0)}
                  </div>
                  <div>
                    <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                      {selectedEmployee.name}&apos;s Documents
                    </h2>
                    <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                      {loadingFiles ? "Loading..." : `${files.length} file${files.length !== 1 ? "s" : ""} in workspace`}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => triggerUpload(null)}
                  disabled={uploading === "__global"}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                    background: "var(--text)", color: "var(--bg)", border: "none",
                    borderRadius: "var(--radius-sm)", fontSize: 13, fontWeight: 500,
                    cursor: "pointer", opacity: uploading === "__global" ? 0.6 : 1,
                  }}
                >
                  {uploading === "__global"
                    ? <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} />
                    : <Upload size={14} />}
                  Upload File
                </button>
              </div>

              {/* Search */}
              <div style={{ position: "relative", marginBottom: 16 }}>
                <Search
                  size={14}
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text-tertiary)",
                  }}
                />
                <input
                  type="text"
                  placeholder="Search files..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px 8px 34px",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    fontSize: 13,
                    background: "var(--bg)",
                    color: "var(--text)",
                    outline: "none",
                  }}
                />
              </div>

              {/* Batch actions bar */}
              {!loadingFiles && filteredFiles.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 12,
                    fontSize: 12,
                    color: "var(--text-secondary)",
                  }}
                >
                  <button
                    onClick={toggleSelectAll}
                    title={selected.size === filteredFiles.length ? "Deselect all" : "Select all"}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      background: "none", border: "none", cursor: "pointer",
                      color: "var(--text-secondary)", fontSize: 12, padding: "2px 0",
                    }}
                  >
                    {selected.size === filteredFiles.length && filteredFiles.length > 0
                      ? <CheckSquare size={14} />
                      : <Square size={14} />}
                    {selected.size > 0 ? `${selected.size} selected` : "Select all"}
                  </button>
                  {selected.size > 0 && (
                    <button
                      onClick={handleBatchDelete}
                      disabled={batchDeleting}
                      style={{
                        display: "flex", alignItems: "center", gap: 4,
                        background: "none", border: "1px solid var(--red, #dc2626)", borderRadius: "var(--radius-sm)",
                        cursor: "pointer", color: "var(--red, #dc2626)", fontSize: 12, padding: "3px 10px",
                        opacity: batchDeleting ? 0.5 : 1,
                      }}
                    >
                      {batchDeleting
                        ? <Loader2 size={12} style={{ animation: "spin 0.8s linear infinite" }} />
                        : <Trash2 size={12} />}
                      Delete selected
                    </button>
                  )}
                </div>
              )}

              {/* Files */}
              {loadingFiles ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                  <Loader2
                    size={24}
                    style={{ color: "var(--blue)", animation: "spin 2s linear infinite" }}
                  />
                  <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="card" style={{ padding: 40, textAlign: "center" }}>
                  <FolderOpen
                    size={32}
                    style={{ color: "var(--text-tertiary)", marginBottom: 12 }}
                  />
                  <p style={{ color: "var(--text-secondary)", margin: 0 }}>
                    {search
                      ? "No files match your search."
                      : "No documents yet. Files created by the employee will appear here."}
                  </p>
                </div>
              ) : (
                <div>
                  {Array.from(grouped.entries()).map(([dir, dirFiles]) => (
                    <div key={dir || "__root"} style={{ marginBottom: 16 }}>
                      {dir && (
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 500,
                            color: "var(--text-tertiary)",
                            marginBottom: 6,
                            padding: "0 4px",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <FolderOpen size={12} /> {dir}
                          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 2 }}>
                            <button
                              onClick={() => {
                                // Map display path to backend folder path
                                const folder = dir.startsWith("workspace-main/") || dir.startsWith("skills/")
                                  ? dir
                                  : `workspace/${dir}`;
                                triggerUpload(folder);
                              }}
                              disabled={uploading === dir}
                              title={`Upload file to "${dir}"`}
                              style={{
                                background: "none", border: "none",
                                cursor: "pointer", padding: 2, color: "var(--text-tertiary)",
                                opacity: uploading === dir ? 0.5 : 1, display: "flex", alignItems: "center",
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--blue, #2563eb)"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-tertiary)"; }}
                            >
                              {uploading === dir ? <Loader2 size={12} style={{ animation: "spin 0.8s linear infinite" }} /> : <Upload size={12} />}
                            </button>
                            <button
                              onClick={() => handleDeleteFolder(dir, dirFiles)}
                              disabled={deleting === dir}
                              title={`Delete folder "${dir}"`}
                              style={{
                                background: "none", border: "none",
                                cursor: "pointer", padding: 2, color: "var(--text-tertiary)",
                                opacity: deleting === dir ? 0.5 : 1, display: "flex", alignItems: "center",
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--red, #dc2626)"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-tertiary)"; }}
                            >
                              {deleting === dir ? <Loader2 size={12} style={{ animation: "spin 0.8s linear infinite" }} /> : <Trash2 size={12} />}
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="card" style={{ overflow: "hidden" }}>
                        {dirFiles.map((file, i) => {
                          const Icon = getFileIcon(file.type);
                          const previewable = canPreview(file.type);
                          return (
                            <div
                              key={file.path}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 12,
                                padding: "10px 16px",
                                color: "var(--text)",
                                borderBottom:
                                  i < dirFiles.length - 1
                                    ? "1px solid var(--border)"
                                    : "none",
                                transition: "background 0.1s",
                              }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.background = "var(--bg-secondary)")
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.background = "")
                              }
                            >
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleSelect(file.path); }}
                                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0, color: selected.has(file.path) ? "var(--blue, #2563eb)" : "var(--text-tertiary)", display: "flex" }}
                              >
                                {selected.has(file.path) ? <CheckSquare size={14} /> : <Square size={14} />}
                              </button>
                              <a
                                href={fileUrl(file)}
                                onClick={(e) => handleFileClick(e, file)}
                                style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, textDecoration: "none", color: "inherit", cursor: "pointer" }}
                              >
                                <Icon
                                  size={16}
                                  style={{ color: "var(--text-tertiary)", flexShrink: 0 }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div
                                    style={{
                                      fontSize: 13,
                                      fontWeight: 500,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {file.name}
                                  </div>
                                </div>
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: "var(--text-tertiary)",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {formatSize(file.size)}
                                </div>
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: "var(--text-tertiary)",
                                    whiteSpace: "nowrap",
                                    minWidth: 60,
                                  }}
                                >
                                  {formatDate(file.modifiedAt)}
                                </div>
                                {previewable ? (
                                  <Eye
                                    size={14}
                                    style={{ color: "var(--blue)", flexShrink: 0 }}
                                  />
                                ) : (
                                  <Download
                                    size={14}
                                    style={{ color: "var(--text-tertiary)", flexShrink: 0 }}
                                  />
                                )}
                              </a>
                              <button
                                onClick={() => handleDelete(file)}
                                disabled={deleting === file.path}
                                title="Delete file"
                                style={{
                                  background: "none", border: "none", cursor: "pointer", padding: 4,
                                  color: "var(--text-tertiary)",
                                  opacity: deleting === file.path ? 0.5 : 1,
                                  flexShrink: 0,
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--red, #dc2626)"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-tertiary)"; }}
                              >
                                {deleting === file.path ? <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> : <Trash2 size={14} />}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
