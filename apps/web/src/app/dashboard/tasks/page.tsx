"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import {
  Plus,
  Check,
  Clock,
  AlertTriangle,
  Trash2,
  X,
  LayoutGrid,
  List,
  Filter,
  Calendar,
  Send,
  Tag,
  ChevronRight,
  User,
  Bot,
  Settings2,
  ArrowUp,
  ArrowUpRight,
  Minus,
  ArrowDown,
  RefreshCw,
  GripVertical,
} from "lucide-react";

// ── Types ─────────────────────────────────────

type Task = {
  id: string;
  employeeId: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  source: string;
  category: string | null;
  triggerId: string | null;
  triggerName: string | null;
  triggerCron: { cron?: string; message?: string } | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  employeeName: string | null;
  employeeEmoji: string | null;
  employeeJobTitle: string | null;
};

type Comment = {
  id: string;
  taskId: string;
  authorType: string;
  authorName: string;
  content: string;
  createdAt: string;
};

type Employee = {
  id: string;
  name: string;
  emoji: string;
  jobTitle: string;
  status: string;
};

type BoardColumn = {
  key: string;
  label: string;
  color: string;
  isDefault?: boolean;
};

// ── Constants ─────────────────────────────────

const DEFAULT_COLUMNS: BoardColumn[] = [
  { key: "pending", label: "To Do", color: "#a3a3a3", isDefault: true },
  { key: "in_progress", label: "In Progress", color: "#2563eb", isDefault: true },
  { key: "blocked", label: "Blocked", color: "#dc2626", isDefault: true },
  { key: "completed", label: "Done", color: "#16a34a", isDefault: true },
];

const COLUMN_COLORS = [
  "#a3a3a3", "#2563eb", "#dc2626", "#16a34a", "#7c3aed",
  "#ea580c", "#0891b2", "#d946ef", "#65a30d", "#e11d48",
  "#4f46e5", "#0d9488",
];

const STORAGE_KEY = "task-board-columns";

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  urgent: { label: "Urgent", color: "#dc2626", bg: "rgba(220,38,38,0.06)", icon: ArrowUp },
  high: { label: "High", color: "#ea580c", bg: "rgba(234,88,12,0.06)", icon: ArrowUpRight },
  medium: { label: "Medium", color: "#525252", bg: "rgba(82,82,82,0.04)", icon: Minus },
  low: { label: "Low", color: "#a3a3a3", bg: "rgba(163,163,163,0.04)", icon: ArrowDown },
};

const PRIORITY_ORDER = ["urgent", "high", "medium", "low"];

// ── Main Page ─────────────────────────────────

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"board" | "list">("board");
  const [filterEmployee, setFilterEmployee] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [newTask, setNewTask] = useState({
    employeeId: "", title: "", description: "", priority: "medium", category: "", dueDate: "",
    recurring: false, cron: "0 9 * * 1-5",
  });
  const [creating, setCreating] = useState(false);

  // Board columns (persisted in localStorage)
  const [columns, setColumns] = useState<BoardColumn[]>(DEFAULT_COLUMNS);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) setColumns(parsed);
      }
    } catch {}
  }, []);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(columns));
  }, [columns]);

  // Drag-and-drop state
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  // Inline quick-add state
  const [quickAddColumn, setQuickAddColumn] = useState<string | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [quickAddEmployee, setQuickAddEmployee] = useState("");
  const quickAddRef = useRef<HTMLInputElement>(null);

  // Add column state
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColLabel, setNewColLabel] = useState("");
  const [newColColor, setNewColColor] = useState(COLUMN_COLORS[4]);

  // Inline column rename state
  const [editingColumnKey, setEditingColumnKey] = useState<string | null>(null);
  const [editingColumnLabel, setEditingColumnLabel] = useState("");

  const loadData = useCallback(() => {
    Promise.all([api.listTasks(), api.listEmployees()])
      .then(([tasksRes, empRes]) => {
        setTasks(tasksRes.tasks);
        setEmployees(empRes.employees.filter((e: Employee) => e.status !== "terminated"));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Focus quick-add input when opened
  useEffect(() => {
    if (quickAddColumn && quickAddRef.current) {
      quickAddRef.current.focus();
    }
  }, [quickAddColumn]);

  // Load comments when selecting a task
  const loadComments = async (taskId: string) => {
    try {
      const res = await api.listTaskComments(taskId);
      setComments(res.comments);
    } catch { setComments([]); }
  };

  const openTask = (task: Task) => {
    setSelectedTask(task);
    setNewComment("");
    loadComments(task.id);
  };

  const closeTask = () => {
    setSelectedTask(null);
    setComments([]);
  };

  const handleCreate = async () => {
    if (!newTask.employeeId || !newTask.title) return;
    setCreating(true);
    try {
      if (newTask.recurring) {
        // Create a schedule trigger instead of a one-off task
        const message = newTask.description
          ? `${newTask.title}\n\n${newTask.description}`
          : newTask.title;
        await api.createTrigger(newTask.employeeId, {
          type: "schedule",
          name: newTask.title,
          config: { cron: newTask.cron, message },
        });
      } else {
        await api.createTask({
          employeeId: newTask.employeeId,
          title: newTask.title,
          description: newTask.description || undefined,
          priority: newTask.priority,
          category: newTask.category || undefined,
          dueDate: newTask.dueDate || undefined,
        });
      }
      setNewTask({ employeeId: "", title: "", description: "", priority: "medium", category: "", dueDate: "", recurring: false, cron: "0 9 * * 1-5" });
      setShowCreate(false);
      loadData();
    } catch { /* ignore */ }
    setCreating(false);
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    await api.updateTask(taskId, { status: newStatus });
    loadData();
    if (selectedTask?.id === taskId) {
      setSelectedTask((prev) => prev ? { ...prev, status: newStatus } : null);
    }
  };

  const handleDelete = async (taskId: string) => {
    await api.deleteTask(taskId);
    if (selectedTask?.id === taskId) closeTask();
    loadData();
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !selectedTask) return;
    await api.addTaskComment(selectedTask.id, newComment.trim(), "Manager");
    setNewComment("");
    loadComments(selectedTask.id);
  };

  // ── Quick-add in column ──
  const handleQuickAdd = async (status: string) => {
    if (!quickAddTitle.trim() || !quickAddEmployee) return;
    try {
      await api.createTask({
        employeeId: quickAddEmployee,
        title: quickAddTitle.trim(),
        priority: "medium",
        status,
      });
      setQuickAddTitle("");
      setQuickAddColumn(null);
      loadData();
    } catch { /* ignore */ }
  };

  // ── Column management ──
  const handleAddColumn = () => {
    if (!newColLabel.trim()) return;
    const key = newColLabel.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    if (!key || columns.some((c) => c.key === key)) return;
    setColumns([...columns, { key, label: newColLabel.trim(), color: newColColor }]);
    setNewColLabel("");
    setNewColColor(COLUMN_COLORS[4]);
    setShowAddColumn(false);
  };

  const handleDeleteColumn = async (columnKey: string) => {
    const tasksInColumn = tasks.filter((t) => t.status === columnKey);
    for (const task of tasksInColumn) {
      await api.updateTask(task.id, { status: "pending" });
    }
    setColumns(columns.filter((c) => c.key !== columnKey));
    loadData();
  };

  const handleRenameColumn = (key: string, newLabel: string) => {
    if (!newLabel.trim()) { setEditingColumnKey(null); return; }
    setColumns(columns.map((c) => c.key === key ? { ...c, label: newLabel.trim() } : c));
    setEditingColumnKey(null);
  };

  // ── Drag and drop ──
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", taskId);
    setDraggedTaskId(taskId);
  };

  const handleDragOver = (e: React.DragEvent, colKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(colKey);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverColumn(null);
    }
  };

  const handleDrop = (e: React.DragEvent, colKey: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId) {
      const task = tasks.find((t) => t.id === taskId);
      if (task && task.status !== colKey) {
        handleStatusChange(taskId, colKey);
      }
    }
    setDragOverColumn(null);
    setDraggedTaskId(null);
  };

  // Filter tasks
  const filtered = tasks.filter((t) => {
    if (filterEmployee !== "all" && t.employeeId !== filterEmployee) return false;
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    return true;
  });

  const getColumnTasks = (status: string) =>
    filtered
      .filter((t) => t.status === status)
      .sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority));

  const counts = {
    total: tasks.length,
    active: tasks.filter((t) => t.status !== "completed").length,
    inProgress: tasks.filter((t) => t.status === "in_progress").length,
    completed: tasks.filter((t) => t.status === "completed").length,
    blocked: tasks.filter((t) => t.status === "blocked").length,
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <div style={{ width: 24, height: 24, border: "2px solid #e5e5e5", borderTopColor: "#a3a3a3", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  return (
    <div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        .task-card { transition: box-shadow 0.15s, transform 0.1s, opacity 0.15s; cursor: grab; }
        .task-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); transform: translateY(-1px); }
        .task-card:active { cursor: grabbing; }
        .task-card.dragging { opacity: 0.4; }
        .task-row { transition: background 0.1s; cursor: pointer; }
        .task-row:hover { background: #f5f5f5; }
        .delete-btn { opacity: 0; transition: opacity 0.15s; }
        .task-row:hover .delete-btn { opacity: 0.5; }
        .delete-btn:hover { opacity: 1 !important; color: #dc2626 !important; }
        .col-header { position: relative; }
        .col-delete-btn { opacity: 0; transition: opacity 0.15s; padding: 2px; background: none; border: none; cursor: pointer; color: #a3a3a3; display: flex; align-items: center; }
        .col-header:hover .col-delete-btn { opacity: 0.5; }
        .col-delete-btn:hover { opacity: 1 !important; color: #dc2626 !important; }
        .quick-add-btn { opacity: 0; transition: opacity 0.15s; }
        .board-col:hover .quick-add-btn { opacity: 1; }
        .board-col.drag-over { background: rgba(37,99,235,0.03); border: 2px dashed rgba(37,99,235,0.3); border-radius: 10px; }
        @media (max-width: 768px) {
          .task-header-row { flex-direction: column; align-items: flex-start !important; gap: 12px !important; }
          .task-list-row { grid-template-columns: 1fr !important; }
          .task-list-row .task-meta-cell { display: none !important; }
          .task-form-grid-3 { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Header ── */}
      <div className="task-header-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0a0a0a", letterSpacing: "-0.02em", margin: 0 }}>Tasks</h1>
          <p style={{ color: "#525252", fontSize: 14, margin: "4px 0 0" }}>
            {counts.active} active, {counts.inProgress} in progress, {counts.blocked} blocked
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {/* View toggle */}
          <div style={{ display: "flex", border: "1px solid #e5e5e5", borderRadius: 8, overflow: "hidden" }}>
            <button
              onClick={() => setView("board")}
              style={{
                padding: "6px 10px", border: "none", cursor: "pointer",
                background: view === "board" ? "#0a0a0a" : "#fff",
                color: view === "board" ? "#fff" : "#a3a3a3",
                display: "flex", alignItems: "center",
              }}
            ><LayoutGrid size={15} /></button>
            <button
              onClick={() => setView("list")}
              style={{
                padding: "6px 10px", border: "none", cursor: "pointer",
                background: view === "list" ? "#0a0a0a" : "#fff",
                color: view === "list" ? "#fff" : "#a3a3a3",
                display: "flex", alignItems: "center",
              }}
            ><List size={15} /></button>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "0 16px", height: 36, fontSize: 13, fontWeight: 600,
              color: "#fff", background: "#0a0a0a",
              border: "none", borderRadius: 8, cursor: "pointer",
            }}
          ><Plus size={16} /> Add Task</button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#a3a3a3" }}>
          <Filter size={14} />
        </div>
        <select
          value={filterEmployee}
          onChange={(e) => setFilterEmployee(e.target.value)}
          style={{
            height: 32, padding: "0 10px", fontSize: 12, border: "1px solid #e5e5e5",
            borderRadius: 6, background: "#fff", color: "#0a0a0a", cursor: "pointer",
          }}
        >
          <option value="all">All employees</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.emoji} {e.name}</option>
          ))}
        </select>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          style={{
            height: 32, padding: "0 10px", fontSize: 12, border: "1px solid #e5e5e5",
            borderRadius: 6, background: "#fff", color: "#0a0a0a", cursor: "pointer",
          }}
        >
          <option value="all">All priorities</option>
          {PRIORITY_ORDER.map((p) => (
            <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
          ))}
        </select>
      </div>

      {/* ── Board View ── */}
      {view === "board" && (
        <div style={{ display: "flex", gap: 16, minHeight: 400, overflowX: "auto", paddingBottom: 8 }}>
          {columns.map((col) => {
            const colTasks = getColumnTasks(col.key);
            const isDragOver = dragOverColumn === col.key;
            return (
              <div
                key={col.key}
                className={`board-col${isDragOver ? " drag-over" : ""}`}
                style={{ minWidth: 260, flex: "1 0 0%", display: "flex", flexDirection: "column" }}
                onDragOver={(e) => handleDragOver(e, col.key)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, col.key)}
              >
                {/* Column header */}
                <div
                  className="col-header"
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "10px 12px", marginBottom: 8,
                    borderRadius: 8, background: "#f5f5f5",
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: col.color, flexShrink: 0 }} />
                  {editingColumnKey === col.key ? (
                    <input
                      autoFocus
                      value={editingColumnLabel}
                      onChange={(e) => setEditingColumnLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameColumn(col.key, editingColumnLabel);
                        if (e.key === "Escape") setEditingColumnKey(null);
                      }}
                      onBlur={() => handleRenameColumn(col.key, editingColumnLabel)}
                      style={{
                        fontSize: 13, fontWeight: 600, color: "#0a0a0a",
                        border: "1px solid #e5e5e5", borderRadius: 4,
                        padding: "2px 6px", outline: "none", background: "#fff",
                        width: "100%", minWidth: 0,
                      }}
                    />
                  ) : (
                    <span
                      style={{ fontSize: 13, fontWeight: 600, color: "#0a0a0a", cursor: col.isDefault ? "default" : "pointer" }}
                      onDoubleClick={() => {
                        if (!col.isDefault) {
                          setEditingColumnKey(col.key);
                          setEditingColumnLabel(col.label);
                        }
                      }}
                      title={col.isDefault ? undefined : "Double-click to rename"}
                    >
                      {col.label}
                    </span>
                  )}
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: "#a3a3a3",
                    background: "#e5e5e5", borderRadius: 10, padding: "1px 7px",
                    marginLeft: "auto", flexShrink: 0,
                  }}>{colTasks.length}</span>
                  {!col.isDefault && (
                    <button
                      className="col-delete-btn"
                      onClick={() => handleDeleteColumn(col.key)}
                      title="Delete column"
                    ><X size={13} /></button>
                  )}
                </div>

                {/* Cards */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                  {colTasks.map((task) => {
                    const pCfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
                    const PIcon = pCfg.icon;
                    const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "completed";
                    return (
                      <div
                        key={task.id}
                        className={`task-card${draggedTaskId === task.id ? " dragging" : ""}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onDragEnd={() => { setDraggedTaskId(null); setDragOverColumn(null); }}
                        onClick={() => openTask(task)}
                        style={{
                          padding: "12px 14px",
                          background: "#fff",
                          border: "1px solid #e5e5e5",
                          borderRadius: 10,
                          borderLeft: `3px solid ${col.color}`,
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 500, color: "#0a0a0a", marginBottom: 8, lineHeight: 1.4 }}>
                          {task.title}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                          {/* Priority */}
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 3,
                            fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em",
                            color: pCfg.color, background: pCfg.bg,
                            padding: "2px 6px", borderRadius: 4,
                          }}>
                            <PIcon size={10} /> {task.priority}
                          </span>
                          {/* Category */}
                          {task.category && (
                            <span style={{
                              fontSize: 10, color: "#525252", background: "#f5f5f5",
                              padding: "2px 6px", borderRadius: 4,
                            }}>{task.category}</span>
                          )}
                          {/* Due date */}
                          {task.dueDate && (
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: 3,
                              fontSize: 10, color: isOverdue ? "#dc2626" : "#a3a3a3",
                              fontWeight: isOverdue ? 600 : 400,
                            }}>
                              <Calendar size={10} />
                              {new Date(task.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            </span>
                          )}
                          {/* Source badge */}
                          {task.source === "employee" && (
                            <span style={{
                              fontSize: 10, color: "#2563eb", background: "rgba(37,99,235,0.06)",
                              padding: "2px 6px", borderRadius: 4,
                            }}>self-reported</span>
                          )}
                          {/* Recurring badge */}
                          {task.triggerId && (
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: 3,
                              fontSize: 10, color: "#7c3aed", background: "rgba(124,58,237,0.06)",
                              padding: "2px 6px", borderRadius: 4,
                            }}>
                              <RefreshCw size={9} /> recurring
                            </span>
                          )}
                        </div>
                        {/* Assignee */}
                        <div style={{
                          display: "flex", alignItems: "center", gap: 5, marginTop: 8,
                          fontSize: 11, color: "#a3a3a3",
                        }}>
                          <span style={{ fontSize: 14 }}>{task.employeeEmoji || "A"}</span>
                          {task.employeeName}
                        </div>
                      </div>
                    );
                  })}
                  {colTasks.length === 0 && quickAddColumn !== col.key && (
                    <div style={{
                      padding: "32px 16px", textAlign: "center", fontSize: 12, color: "#d4d4d4",
                      border: "1px dashed #e5e5e5", borderRadius: 10, flex: 1,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      No tasks
                    </div>
                  )}
                </div>

                {/* ── Inline quick-add ── */}
                {quickAddColumn === col.key ? (
                  <div style={{
                    marginTop: 8, padding: 10, background: "#fff",
                    border: "1px solid #e5e5e5", borderRadius: 10,
                  }}>
                    <input
                      ref={quickAddRef}
                      placeholder="Task title..."
                      value={quickAddTitle}
                      onChange={(e) => setQuickAddTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && quickAddTitle.trim() && quickAddEmployee) handleQuickAdd(col.key);
                        if (e.key === "Escape") setQuickAddColumn(null);
                      }}
                      style={{
                        width: "100%", height: 32, padding: "0 10px", fontSize: 13,
                        border: "1px solid #e5e5e5", borderRadius: 6,
                        boxSizing: "border-box", color: "#0a0a0a", marginBottom: 8,
                      }}
                    />
                    <select
                      value={quickAddEmployee}
                      onChange={(e) => setQuickAddEmployee(e.target.value)}
                      style={{
                        width: "100%", height: 30, padding: "0 8px", fontSize: 12,
                        border: "1px solid #e5e5e5", borderRadius: 6,
                        background: "#fff", color: "#0a0a0a", marginBottom: 8,
                      }}
                    >
                      <option value="">Assign to...</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>{emp.emoji} {emp.name}</option>
                      ))}
                    </select>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => handleQuickAdd(col.key)}
                        disabled={!quickAddTitle.trim() || !quickAddEmployee}
                        style={{
                          flex: 1, height: 30, fontSize: 12, fontWeight: 600,
                          color: "#fff", background: "#0a0a0a", border: "none",
                          borderRadius: 6, cursor: (!quickAddTitle.trim() || !quickAddEmployee) ? "not-allowed" : "pointer",
                          opacity: (!quickAddTitle.trim() || !quickAddEmployee) ? 0.4 : 1,
                        }}
                      >Add</button>
                      <button
                        onClick={() => setQuickAddColumn(null)}
                        style={{
                          height: 30, padding: "0 12px", fontSize: 12,
                          color: "#525252", background: "#fff",
                          border: "1px solid #e5e5e5", borderRadius: 6, cursor: "pointer",
                        }}
                      >Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="quick-add-btn"
                    onClick={() => {
                      setQuickAddColumn(col.key);
                      setQuickAddTitle("");
                      setQuickAddEmployee(employees[0]?.id || "");
                    }}
                    style={{
                      marginTop: 8, width: "100%", padding: "8px 0",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      fontSize: 12, color: "#a3a3a3", background: "none",
                      border: "1px dashed #e5e5e5", borderRadius: 8, cursor: "pointer",
                    }}
                  >
                    <Plus size={14} /> Add task
                  </button>
                )}
              </div>
            );
          })}

          {/* ── Add Column ── */}
          {showAddColumn ? (
            <div style={{
              minWidth: 260, flex: "0 0 260px", padding: 16,
              background: "#f9fafb", border: "1px solid #e5e5e5",
              borderRadius: 10, display: "flex", flexDirection: "column", gap: 12,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0a0a0a" }}>New Column</div>
              <input
                autoFocus
                placeholder="Column name..."
                value={newColLabel}
                onChange={(e) => setNewColLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddColumn();
                  if (e.key === "Escape") setShowAddColumn(false);
                }}
                style={{
                  width: "100%", height: 34, padding: "0 10px", fontSize: 13,
                  border: "1px solid #e5e5e5", borderRadius: 6,
                  boxSizing: "border-box", color: "#0a0a0a",
                }}
              />
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#a3a3a3", marginBottom: 6 }}>Color</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {COLUMN_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewColColor(c)}
                      style={{
                        width: 22, height: 22, borderRadius: "50%", border: "none",
                        background: c, cursor: "pointer",
                        outline: newColColor === c ? `2px solid ${c}` : "2px solid transparent",
                        outlineOffset: 2,
                      }}
                    />
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={handleAddColumn}
                  disabled={!newColLabel.trim()}
                  style={{
                    flex: 1, height: 32, fontSize: 12, fontWeight: 600,
                    color: "#fff", background: "#0a0a0a", border: "none",
                    borderRadius: 6, cursor: !newColLabel.trim() ? "not-allowed" : "pointer",
                    opacity: !newColLabel.trim() ? 0.4 : 1,
                  }}
                >Create</button>
                <button
                  onClick={() => { setShowAddColumn(false); setNewColLabel(""); }}
                  style={{
                    height: 32, padding: "0 12px", fontSize: 12,
                    color: "#525252", background: "#fff",
                    border: "1px solid #e5e5e5", borderRadius: 6, cursor: "pointer",
                  }}
                >Cancel</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddColumn(true)}
              style={{
                minWidth: 200, flex: "0 0 auto", padding: "40px 20px",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
                background: "none", border: "2px dashed #e5e5e5", borderRadius: 10,
                cursor: "pointer", color: "#a3a3a3", fontSize: 13, fontWeight: 500,
                transition: "border-color 0.15s, color 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#a3a3a3"; e.currentTarget.style.color = "#525252"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e5e5e5"; e.currentTarget.style.color = "#a3a3a3"; }}
            >
              <Plus size={20} />
              Add Column
            </button>
          )}
        </div>
      )}

      {/* ── List View ── */}
      {view === "list" && (
        <div style={{ background: "#fff", border: "1px solid #e5e5e5", borderRadius: 10, overflow: "hidden" }}>
          {/* Header row */}
          <div className="task-list-row" style={{
            display: "grid", gridTemplateColumns: "minmax(0, 1fr) 130px 80px 90px 100px 36px",
            gap: 12, padding: "10px 20px", background: "#f5f5f5",
            fontSize: 11, fontWeight: 600, color: "#a3a3a3", textTransform: "uppercase", letterSpacing: "0.04em",
          }}>
            <span>Task</span>
            <span className="task-meta-cell">Assignee</span>
            <span className="task-meta-cell">Priority</span>
            <span className="task-meta-cell">Status</span>
            <span className="task-meta-cell">Due</span>
            <span className="task-meta-cell"></span>
          </div>
          {filtered.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: "#a3a3a3", fontSize: 14 }}>
              No tasks match the current filters
            </div>
          ) : (
            filtered
              .sort((a, b) => {
                const statusOrder = columns.map((c) => c.key);
                const si = statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
                if (si !== 0) return si;
                return PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
              })
              .map((task, i) => {
                const col = columns.find((c) => c.key === task.status) || columns[0];
                const pCfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
                const PIcon = pCfg.icon;
                const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "completed";
                return (
                  <div
                    key={task.id}
                    className="task-row task-list-row"
                    onClick={() => openTask(task)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) 130px 80px 90px 100px 36px",
                      gap: 12, padding: "12px 20px", alignItems: "center",
                      borderBottom: i < filtered.length - 1 ? "1px solid #f5f5f5" : "none",
                      opacity: task.status === "completed" ? 0.55 : 1,
                    }}
                  >
                    {/* Title + desc */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 500, color: "#0a0a0a",
                        textDecoration: task.status === "completed" ? "line-through" : "none",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {task.title}
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
                        {task.category && (
                          <span style={{ fontSize: 10, color: "#525252", background: "#f5f5f5", padding: "1px 5px", borderRadius: 3 }}>
                            {task.category}
                          </span>
                        )}
                        {task.source === "employee" && (
                          <span style={{ fontSize: 10, color: "#2563eb", background: "rgba(37,99,235,0.06)", padding: "1px 5px", borderRadius: 3 }}>
                            self-reported
                          </span>
                        )}
                        {task.triggerId && (
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 3,
                            fontSize: 10, color: "#7c3aed", background: "rgba(124,58,237,0.06)",
                            padding: "1px 5px", borderRadius: 3,
                          }}>
                            <RefreshCw size={9} /> recurring
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Assignee */}
                    <div className="task-meta-cell" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#525252", minWidth: 0 }}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>{task.employeeEmoji || "A"}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.employeeName}</span>
                    </div>
                    {/* Priority */}
                    <span className="task-meta-cell" style={{
                      display: "inline-flex", alignItems: "center", gap: 3,
                      fontSize: 11, fontWeight: 500, color: pCfg.color, textTransform: "capitalize",
                    }}>
                      <PIcon size={12} /> {task.priority}
                    </span>
                    {/* Status */}
                    <span className="task-meta-cell" style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      fontSize: 11, fontWeight: 500, color: col.color,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: col.color }} />
                      {col.label}
                    </span>
                    {/* Due */}
                    <span className="task-meta-cell" style={{ fontSize: 11, color: isOverdue ? "#dc2626" : "#a3a3a3", fontWeight: isOverdue ? 600 : 400 }}>
                      {task.dueDate
                        ? new Date(task.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                        : "\u2014"}
                    </span>
                    {/* Delete */}
                    <button
                      className="delete-btn task-meta-cell"
                      onClick={(e) => { e.stopPropagation(); handleDelete(task.id); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#a3a3a3", padding: 4, display: "flex" }}
                    ><Trash2 size={14} /></button>
                  </div>
                );
              })
          )}
        </div>
      )}

      {/* ── Create Modal ── */}
      {showCreate && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}
        >
          <div style={{
            padding: 32, width: 520, maxWidth: "90vw",
            background: "#fff", border: "1px solid #e5e5e5",
            borderRadius: 12, boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0a0a0a", margin: "0 0 24px" }}>Add Task</h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Employee */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#525252", marginBottom: 6 }}>Assign to</label>
                <select
                  value={newTask.employeeId}
                  onChange={(e) => setNewTask({ ...newTask, employeeId: e.target.value })}
                  style={{ width: "100%", height: 36, padding: "0 12px", fontSize: 13, border: "1px solid #e5e5e5", borderRadius: 6, background: "#fff", color: "#0a0a0a" }}
                >
                  <option value="">Select employee...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.emoji} {emp.name} — {emp.jobTitle}</option>
                  ))}
                </select>
              </div>
              {/* Title */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#525252", marginBottom: 6 }}>Title</label>
                <input
                  placeholder="What needs to be done?"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter" && newTask.title && newTask.employeeId) handleCreate(); }}
                  style={{ width: "100%", height: 36, padding: "0 12px", fontSize: 13, border: "1px solid #e5e5e5", borderRadius: 6, boxSizing: "border-box", color: "#0a0a0a" }}
                />
              </div>
              {/* Description */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#525252", marginBottom: 6 }}>Description</label>
                <textarea
                  placeholder="More details..."
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  style={{ width: "100%", minHeight: 60, padding: "8px 12px", fontSize: 13, border: "1px solid #e5e5e5", borderRadius: 6, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box", color: "#0a0a0a" }}
                />
              </div>
              {/* Row: Priority + Category + Due */}
              <div className="task-form-grid-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#525252", marginBottom: 6 }}>Priority</label>
                  <select
                    value={newTask.priority}
                    onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                    style={{ width: "100%", height: 36, padding: "0 10px", fontSize: 13, border: "1px solid #e5e5e5", borderRadius: 6, background: "#fff", color: "#0a0a0a" }}
                  >
                    {PRIORITY_ORDER.map((p) => (
                      <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#525252", marginBottom: 6 }}>Category</label>
                  <input
                    placeholder="e.g. marketing"
                    value={newTask.category}
                    onChange={(e) => setNewTask({ ...newTask, category: e.target.value })}
                    style={{ width: "100%", height: 36, padding: "0 10px", fontSize: 13, border: "1px solid #e5e5e5", borderRadius: 6, boxSizing: "border-box", color: "#0a0a0a" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#525252", marginBottom: 6 }}>Due date</label>
                  <input
                    type="date"
                    value={newTask.dueDate}
                    onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                    disabled={newTask.recurring}
                    style={{ width: "100%", height: 36, padding: "0 10px", fontSize: 13, border: "1px solid #e5e5e5", borderRadius: 6, boxSizing: "border-box", color: "#0a0a0a", opacity: newTask.recurring ? 0.4 : 1 }}
                  />
                </div>
              </div>

              {/* Recurring toggle */}
              <div>
                <label
                  style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 500, color: "#0a0a0a", cursor: "pointer" }}
                  onClick={() => setNewTask({ ...newTask, recurring: !newTask.recurring, dueDate: !newTask.recurring ? "" : newTask.dueDate })}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${newTask.recurring ? "#0a0a0a" : "#d4d4d4"}`,
                    background: newTask.recurring ? "#0a0a0a" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s",
                  }}>
                    {newTask.recurring && <Check size={12} color="#fff" />}
                  </div>
                  <RefreshCw size={14} style={{ color: "#737373" }} />
                  Recurring task (runs on a schedule)
                </label>
              </div>

              {/* Cron schedule — shown when recurring */}
              {newTask.recurring && (
                <div style={{ background: "#fafafa", border: "1px solid #e5e5e5", borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#525252" }}>Schedule</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {[
                      { label: "Every weekday 9am", cron: "0 9 * * 1-5" },
                      { label: "Every hour", cron: "0 * * * *" },
                      { label: "Every 30 min", cron: "*/30 * * * *" },
                      { label: "Daily 9am", cron: "0 9 * * *" },
                      { label: "Weekly Monday 9am", cron: "0 9 * * 1" },
                      { label: "Weekly Friday 5pm", cron: "0 17 * * 5" },
                    ].map((preset) => (
                      <button
                        key={preset.cron}
                        type="button"
                        onClick={() => setNewTask({ ...newTask, cron: preset.cron })}
                        style={{
                          padding: "4px 10px", fontSize: 11, fontWeight: 500, borderRadius: 6, cursor: "pointer",
                          border: newTask.cron === preset.cron ? "1.5px solid #0a0a0a" : "1px solid #e5e5e5",
                          background: newTask.cron === preset.cron ? "#0a0a0a" : "#fff",
                          color: newTask.cron === preset.cron ? "#fff" : "#525252",
                          transition: "all 0.15s",
                        }}
                      >{preset.label}</button>
                    ))}
                  </div>
                  <input type="hidden" value={newTask.cron} />
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 28 }}>
              <button
                onClick={() => setShowCreate(false)}
                style={{ padding: "0 16px", height: 36, fontSize: 13, fontWeight: 500, color: "#525252", background: "#fff", border: "1px solid #e5e5e5", borderRadius: 6, cursor: "pointer" }}
              >Cancel</button>
              <button
                disabled={!newTask.employeeId || !newTask.title || creating}
                onClick={handleCreate}
                style={{
                  padding: "0 16px", height: 36, fontSize: 13, fontWeight: 600,
                  color: "#fff", background: "#0a0a0a", border: "none", borderRadius: 6,
                  cursor: (!newTask.employeeId || !newTask.title || creating) ? "not-allowed" : "pointer",
                  opacity: (!newTask.employeeId || !newTask.title || creating) ? 0.4 : 1,
                }}
              >{creating ? "Creating..." : newTask.recurring ? "Create Recurring Task" : "Create Task"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Task Detail Panel (slide-out) ── */}
      {selectedTask && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", justifyContent: "flex-end" }}
          onClick={(e) => { if (e.target === e.currentTarget) closeTask(); }}
        >
          <div
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.2)" }}
            onClick={closeTask}
          />
          <div
            style={{
              position: "relative", width: 520, maxWidth: "90vw", height: "100vh",
              background: "#fff", borderLeft: "1px solid #e5e5e5",
              boxShadow: "-8px 0 30px rgba(0,0,0,0.1)",
              display: "flex", flexDirection: "column",
              animation: "slideIn 0.2s ease",
            }}
          >
            {/* Panel header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 24px", borderBottom: "1px solid #e5e5e5", flexShrink: 0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>{selectedTask.employeeEmoji || "A"}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: "#525252" }}>{selectedTask.employeeName}</span>
              </div>
              <button
                onClick={closeTask}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#a3a3a3" }}
              ><X size={18} /></button>
            </div>

            {/* Panel body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
              {/* Title */}
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0a0a0a", margin: "0 0 8px", lineHeight: 1.4 }}>
                {selectedTask.title}
              </h2>

              {/* Description */}
              {selectedTask.description && (
                <p style={{ fontSize: 14, color: "#525252", lineHeight: 1.6, margin: "0 0 20px" }}>
                  {selectedTask.description}
                </p>
              )}

              {/* Metadata grid */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr",
                gap: 16, padding: 16,
                background: "#f9fafb", borderRadius: 10, marginBottom: 24,
                border: "1px solid #f0f0f0",
              }}>
                {/* Status */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#a3a3a3", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Status</div>
                  <select
                    value={selectedTask.status}
                    onChange={(e) => handleStatusChange(selectedTask.id, e.target.value)}
                    style={{ height: 30, padding: "0 8px", fontSize: 12, border: "1px solid #e5e5e5", borderRadius: 6, background: "#fff", color: "#0a0a0a", cursor: "pointer" }}
                  >
                    {columns.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                </div>
                {/* Priority */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#a3a3a3", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Priority</div>
                  <select
                    value={selectedTask.priority}
                    onChange={async (e) => {
                      await api.updateTask(selectedTask.id, { priority: e.target.value });
                      setSelectedTask((prev) => prev ? { ...prev, priority: e.target.value } : null);
                      loadData();
                    }}
                    style={{ height: 30, padding: "0 8px", fontSize: 12, border: "1px solid #e5e5e5", borderRadius: 6, background: "#fff", color: "#0a0a0a", cursor: "pointer" }}
                  >
                    {PRIORITY_ORDER.map((p) => (
                      <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
                    ))}
                  </select>
                </div>
                {/* Source */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#a3a3a3", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Created by</div>
                  <div style={{ fontSize: 12, color: "#525252", textTransform: "capitalize" }}>{selectedTask.source}</div>
                </div>
                {/* Recurring trigger */}
                {selectedTask.triggerId && selectedTask.triggerName && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#a3a3a3", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Trigger</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <RefreshCw size={11} style={{ color: "#7c3aed" }} />
                      <span style={{ fontSize: 12, color: "#525252" }}>{selectedTask.triggerName}</span>
                    </div>
                    {selectedTask.triggerCron?.cron && (
                      <div style={{ fontSize: 11, color: "#a3a3a3", marginTop: 3, fontFamily: "monospace" }}>
                        {selectedTask.triggerCron.cron}
                      </div>
                    )}
                  </div>
                )}
                {/* Due date */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#a3a3a3", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Due date</div>
                  <div style={{ fontSize: 12, color: selectedTask.dueDate && new Date(selectedTask.dueDate) < new Date() && selectedTask.status !== "completed" ? "#dc2626" : "#525252" }}>
                    {selectedTask.dueDate ? new Date(selectedTask.dueDate).toLocaleDateString() : "None"}
                  </div>
                </div>
                {/* Category */}
                {selectedTask.category && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#a3a3a3", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Category</div>
                    <div style={{ fontSize: 12, color: "#525252" }}>{selectedTask.category}</div>
                  </div>
                )}
                {/* Created */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#a3a3a3", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Created</div>
                  <div style={{ fontSize: 12, color: "#525252" }}>{new Date(selectedTask.createdAt).toLocaleDateString()}</div>
                </div>
              </div>

              {/* Activity / Comments */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0a0a0a", marginBottom: 12 }}>Activity</div>
                {comments.length === 0 && (
                  <div style={{ fontSize: 13, color: "#d4d4d4", padding: "16px 0" }}>No activity yet</div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {comments.map((c) => (
                    <div key={c.id} style={{ display: "flex", gap: 10 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: c.authorType === "employee" ? "rgba(37,99,235,0.06)" : c.authorType === "system" ? "#f5f5f5" : "rgba(16,163,74,0.06)",
                        border: "1px solid #e5e5e5",
                      }}>
                        {c.authorType === "employee" ? <Bot size={13} style={{ color: "#2563eb" }} /> : <User size={13} style={{ color: "#525252" }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#0a0a0a" }}>{c.authorName}</span>
                          <span style={{ fontSize: 10, color: "#a3a3a3" }}>
                            {new Date(c.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            {" "}
                            {new Date(c.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: "#525252", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                          {c.content}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Comment input */}
            <div style={{ flexShrink: 0, padding: "12px 24px 16px", borderTop: "1px solid #e5e5e5" }}>
              <div style={{
                display: "flex", gap: 8, alignItems: "flex-end",
                border: "1px solid #e5e5e5", borderRadius: 10, padding: "8px 12px",
              }}>
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddComment(); } }}
                  placeholder="Add a comment..."
                  rows={1}
                  style={{
                    flex: 1, border: "none", outline: "none", resize: "none",
                    fontSize: 13, lineHeight: 1.5, padding: "4px 0",
                    fontFamily: "inherit", color: "#0a0a0a", background: "transparent",
                    maxHeight: 100,
                  }}
                />
                <button
                  onClick={handleAddComment}
                  disabled={!newComment.trim()}
                  style={{
                    width: 30, height: 30, borderRadius: 8, border: "none",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: newComment.trim() ? "#0a0a0a" : "#f5f5f5",
                    color: newComment.trim() ? "#fff" : "#a3a3a3",
                    cursor: newComment.trim() ? "pointer" : "default",
                    flexShrink: 0,
                  }}
                ><Send size={14} /></button>
              </div>
            </div>

            {/* Delete footer */}
            <div style={{ flexShrink: 0, padding: "8px 24px 12px", display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => handleDelete(selectedTask.id)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontSize: 12, color: "#a3a3a3", background: "none",
                  border: "none", cursor: "pointer", padding: "4px 8px",
                  borderRadius: 4, transition: "color 0.15s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#dc2626"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#a3a3a3"; }}
              ><Trash2 size={12} /> Delete task</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
