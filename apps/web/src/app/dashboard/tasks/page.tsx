"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Plus, Check, Clock, AlertTriangle, Pause, Trash2, ChevronDown } from "lucide-react";

type Task = {
  id: string;
  employeeId: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  source: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  employeeName: string | null;
  employeeEmoji: string | null;
  employeeJobTitle: string | null;
};

type Employee = {
  id: string;
  name: string;
  emoji: string;
  jobTitle: string;
  status: string;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Pending", color: "var(--text-tertiary)", icon: Clock },
  in_progress: { label: "In Progress", color: "var(--blue)", icon: Clock },
  completed: { label: "Completed", color: "var(--green)", icon: Check },
  blocked: { label: "Blocked", color: "var(--red)", icon: AlertTriangle },
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "var(--text-tertiary)",
  medium: "var(--text-secondary)",
  high: "var(--orange)",
  urgent: "var(--red)",
};

const STATUS_ORDER = ["in_progress", "pending", "blocked", "completed"];

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("active"); // "active" | "all" | "completed"
  const [showCreate, setShowCreate] = useState(false);
  const [newTask, setNewTask] = useState({ employeeId: "", title: "", description: "", priority: "medium" });
  const [creating, setCreating] = useState(false);

  const loadData = () => {
    Promise.all([
      api.listTasks(),
      api.listEmployees(),
    ]).then(([tasksRes, empRes]) => {
      setTasks(tasksRes.tasks);
      setEmployees(empRes.employees.filter((e: Employee) => e.status !== "terminated"));
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const filteredTasks = tasks.filter((t) => {
    if (filter === "active") return t.status !== "completed";
    if (filter === "completed") return t.status === "completed";
    return true;
  }).sort((a, b) => {
    const ai = STATUS_ORDER.indexOf(a.status);
    const bi = STATUS_ORDER.indexOf(b.status);
    if (ai !== bi) return ai - bi;
    const priorityOrder = ["urgent", "high", "medium", "low"];
    return priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority);
  });

  const handleCreate = async () => {
    if (!newTask.employeeId || !newTask.title) return;
    setCreating(true);
    try {
      await api.createTask({
        employeeId: newTask.employeeId,
        title: newTask.title,
        description: newTask.description || undefined,
        priority: newTask.priority,
      });
      setNewTask({ employeeId: "", title: "", description: "", priority: "medium" });
      setShowCreate(false);
      loadData();
    } catch {
      // ignore
    }
    setCreating(false);
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    await api.updateTask(taskId, { status: newStatus });
    loadData();
  };

  const handleDelete = async (taskId: string) => {
    await api.deleteTask(taskId);
    loadData();
  };

  const counts = {
    active: tasks.filter((t) => t.status !== "completed").length,
    inProgress: tasks.filter((t) => t.status === "in_progress").length,
    completed: tasks.filter((t) => t.status === "completed").length,
    blocked: tasks.filter((t) => t.status === "blocked").length,
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <div style={{
          width: 24, height: 24, border: "2px solid var(--border)",
          borderTopColor: "var(--text)", borderRadius: "50%", animation: "spin 0.8s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  return (
    <div className="animate-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <h1 className="heading-1" style={{ marginBottom: 4 }}>Tasks</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            Track what your employees are working on
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)} style={{ gap: 6 }}>
          <Plus size={16} /> Assign Task
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 32 }}>
        {[
          { label: "Active", value: counts.active, color: "var(--text)" },
          { label: "In Progress", value: counts.inProgress, color: "var(--blue)" },
          { label: "Blocked", value: counts.blocked, color: "var(--red)" },
          { label: "Completed", value: counts.completed, color: "var(--green)" },
        ].map((stat) => (
          <div key={stat.label} className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {stat.label}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: stat.color, letterSpacing: "-0.02em" }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[
          { key: "active", label: "Active" },
          { key: "all", label: "All" },
          { key: "completed", label: "Completed" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: filter === key ? 600 : 400,
              color: filter === key ? "var(--text)" : "var(--text-secondary)",
              background: filter === key ? "rgba(255,255,255,0.08)" : "transparent",
              border: filter === key ? "1px solid var(--border-hover)" : "1px solid transparent",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Create task modal */}
      {showCreate && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "rgba(0,0,0,0.6)", display: "flex",
            alignItems: "center", justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}
        >
          <div className="card" style={{ padding: 32, width: 480, maxWidth: "90vw" }}>
            <h2 className="heading-2" style={{ marginBottom: 24 }}>Assign a Task</h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label className="input-label">Assign To</label>
                <select
                  className="input"
                  value={newTask.employeeId}
                  onChange={(e) => setNewTask({ ...newTask, employeeId: e.target.value })}
                  style={{ color: newTask.employeeId ? "var(--text)" : "var(--text-tertiary)" }}
                >
                  <option value="">Select employee...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.emoji} {emp.name} — {emp.jobTitle}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="input-label">Task Title</label>
                <input
                  className="input"
                  placeholder="What needs to be done?"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter" && newTask.title && newTask.employeeId) handleCreate(); }}
                />
              </div>

              <div>
                <label className="input-label">Description (optional)</label>
                <textarea
                  className="input"
                  style={{ minHeight: 60 }}
                  placeholder="More details about the task..."
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                />
              </div>

              <div>
                <label className="input-label">Priority</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  {["low", "medium", "high", "urgent"].map((p) => (
                    <button
                      key={p}
                      onClick={() => setNewTask({ ...newTask, priority: p })}
                      style={{
                        padding: "8px 12px",
                        fontSize: 13,
                        fontWeight: newTask.priority === p ? 600 : 400,
                        textTransform: "capitalize",
                        color: newTask.priority === p ? "var(--text)" : "var(--text-secondary)",
                        background: newTask.priority === p ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.02)",
                        border: newTask.priority === p ? "1.5px solid var(--text)" : "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 28 }}>
              <button className="btn-secondary" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                disabled={!newTask.employeeId || !newTask.title || creating}
                onClick={handleCreate}
              >
                {creating ? "Creating..." : "Create Task"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task list */}
      {filteredTasks.length === 0 ? (
        <div
          className="card"
          style={{ padding: "64px 40px", textAlign: "center", borderStyle: "dashed" }}
        >
          <div style={{
            width: 64, height: 64, borderRadius: 16, background: "rgba(255,255,255,0.04)",
            display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 28, marginBottom: 20,
          }}>
            <Check size={28} strokeWidth={1} style={{ color: "var(--text-tertiary)" }} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            {filter === "completed" ? "No completed tasks yet" : "No active tasks"}
          </h3>
          <p style={{ color: "var(--text-secondary)", marginBottom: 24, fontSize: 14, maxWidth: 320, margin: "0 auto 24px" }}>
            {filter === "completed"
              ? "Tasks will appear here once your employees complete them"
              : "Assign tasks to your employees to track their work"
            }
          </p>
          {filter !== "completed" && (
            <button className="btn-primary" onClick={() => setShowCreate(true)} style={{ gap: 6 }}>
              <Plus size={16} /> Assign First Task
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredTasks.map((task) => {
            const statusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
            const StatusIcon = statusCfg.icon;
            return (
              <div
                key={task.id}
                className="card card-interactive"
                style={{
                  padding: "16px 20px",
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  opacity: task.status === "completed" ? 0.6 : 1,
                }}
              >
                {/* Status button */}
                <button
                  onClick={() => {
                    const next: Record<string, string> = {
                      pending: "in_progress",
                      in_progress: "completed",
                      blocked: "in_progress",
                      completed: "pending",
                    };
                    handleStatusChange(task.id, next[task.status] || "pending");
                  }}
                  style={{
                    width: 24, height: 24, borderRadius: "50%",
                    border: task.status === "completed" ? "none" : `2px solid ${statusCfg.color}`,
                    background: task.status === "completed" ? "var(--green)" : "transparent",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, transition: "all 0.15s",
                  }}
                  title={`Click to change status (current: ${statusCfg.label})`}
                >
                  {task.status === "completed" && <Check size={12} style={{ color: "var(--bg)" }} />}
                </button>

                {/* Task info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 500,
                    textDecoration: task.status === "completed" ? "line-through" : "none",
                    marginBottom: task.description ? 4 : 0,
                  }}>
                    {task.title}
                  </div>
                  {task.description && (
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {task.description}
                    </div>
                  )}
                </div>

                {/* Employee badge */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "rgba(255,255,255,0.04)", padding: "4px 10px", borderRadius: 6,
                  fontSize: 12, color: "var(--text-secondary)", flexShrink: 0,
                }}>
                  <span>{task.employeeEmoji || "A"}</span>
                  <span>{task.employeeName}</span>
                </div>

                {/* Priority */}
                <div style={{
                  fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em",
                  color: PRIORITY_COLORS[task.priority] || "var(--text-tertiary)",
                  flexShrink: 0, width: 50, textAlign: "center",
                }}>
                  {task.priority}
                </div>

                {/* Status label */}
                <div style={{
                  fontSize: 12, color: statusCfg.color,
                  display: "flex", alignItems: "center", gap: 4,
                  flexShrink: 0, width: 90,
                }}>
                  <StatusIcon size={12} />
                  {statusCfg.label}
                </div>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(task.id)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--text-tertiary)", padding: 4, flexShrink: 0,
                    opacity: 0.5, transition: "opacity 0.15s",
                  }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = "1"; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = "0.5"; }}
                  title="Delete task"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
