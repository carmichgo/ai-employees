"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import {
  Plus,
  Table2,
  Trash2,
  ChevronDown,
  X,
  Search,
  Type,
  Hash,
  Calendar,
  CheckSquare,
  Link2,
  AtSign,
  List,
  ArrowLeft,
  MoreHorizontal,
  Pencil,
} from "lucide-react";

// ── Types ────────────────────────────────────────────

interface TableMeta {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Column {
  id: string;
  tableId: string;
  name: string;
  type: string;
  options: any;
  position: number;
}

interface Row {
  id: string;
  tableId: string;
  cells: Record<string, any>;
  position: number;
}

const COLUMN_TYPES = [
  { value: "text", label: "Text", icon: Type },
  { value: "number", label: "Number", icon: Hash },
  { value: "boolean", label: "Checkbox", icon: CheckSquare },
  { value: "date", label: "Date", icon: Calendar },
  { value: "select", label: "Select", icon: List },
  { value: "url", label: "URL", icon: Link2 },
  { value: "email", label: "Email", icon: AtSign },
];

function getTypeIcon(type: string) {
  const t = COLUMN_TYPES.find((ct) => ct.value === type);
  return t?.icon || Type;
}

// ── Cell Editor ──────────────────────────────────────

function CellEditor({
  value,
  column,
  onSave,
  onCancel,
}: {
  value: any;
  column: Column;
  onSave: (val: any) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const [editVal, setEditVal] = useState(value ?? "");

  useEffect(() => {
    inputRef.current?.focus();
    if (inputRef.current instanceof HTMLInputElement && column.type !== "boolean" && column.type !== "date") {
      inputRef.current.select();
    }
  }, [column.type]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onSave(column.type === "number" ? (editVal === "" ? null : Number(editVal)) : editVal);
    }
    if (e.key === "Escape") onCancel();
  };

  if (column.type === "boolean") {
    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="checkbox"
        checked={!!editVal}
        onChange={(e) => {
          onSave(e.target.checked);
        }}
        onKeyDown={handleKeyDown}
        style={{ width: 16, height: 16, cursor: "pointer", margin: "0 auto", display: "block" }}
      />
    );
  }

  if (column.type === "select") {
    const choices: string[] = column.options?.choices || [];
    return (
      <select
        ref={inputRef as React.RefObject<HTMLSelectElement>}
        value={editVal}
        onChange={(e) => {
          onSave(e.target.value);
        }}
        onBlur={() => onSave(editVal)}
        onKeyDown={handleKeyDown}
        style={{
          width: "100%",
          padding: "4px 6px",
          fontSize: 13,
          border: "2px solid var(--blue)",
          borderRadius: 4,
          outline: "none",
          background: "var(--bg)",
          color: "var(--text)",
        }}
      >
        <option value="">—</option>
        {choices.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      type={column.type === "number" ? "number" : column.type === "date" ? "date" : "text"}
      value={editVal}
      onChange={(e) => setEditVal(e.target.value)}
      onBlur={() => onSave(column.type === "number" ? (editVal === "" ? null : Number(editVal)) : editVal)}
      onKeyDown={handleKeyDown}
      style={{
        width: "100%",
        padding: "4px 6px",
        fontSize: 13,
        border: "2px solid var(--blue)",
        borderRadius: 4,
        outline: "none",
        background: "var(--bg)",
        color: "var(--text)",
      }}
    />
  );
}

// ── Select Badge ─────────────────────────────────────

const SELECT_COLORS = [
  { bg: "#dbeafe", text: "#1e40af" },
  { bg: "#dcfce7", text: "#166534" },
  { bg: "#fef9c3", text: "#854d0e" },
  { bg: "#fce7f3", text: "#9d174d" },
  { bg: "#e0e7ff", text: "#3730a3" },
  { bg: "#fed7aa", text: "#9a3412" },
  { bg: "#ccfbf1", text: "#115e59" },
  { bg: "#f3e8ff", text: "#6b21a8" },
];

function SelectBadge({ value, choices }: { value: string; choices: string[] }) {
  const idx = choices.indexOf(value);
  const color = SELECT_COLORS[idx >= 0 ? idx % SELECT_COLORS.length : 0];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 10,
        fontSize: 12,
        fontWeight: 500,
        background: color.bg,
        color: color.text,
      }}
    >
      {value}
    </span>
  );
}

// ── Cell Display ─────────────────────────────────────

function CellDisplay({ value, column }: { value: any; column: Column }) {
  if (value === null || value === undefined || value === "") {
    return <span style={{ color: "var(--text-tertiary)" }}>—</span>;
  }

  if (column.type === "boolean") {
    return (
      <input
        type="checkbox"
        checked={!!value}
        readOnly
        style={{ width: 16, height: 16, cursor: "default", margin: "0 auto", display: "block", pointerEvents: "none" }}
      />
    );
  }

  if (column.type === "select") {
    return <SelectBadge value={value} choices={column.options?.choices || []} />;
  }

  if (column.type === "url") {
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        style={{ color: "var(--blue)", textDecoration: "underline", fontSize: 13 }}
      >
        {value}
      </a>
    );
  }

  if (column.type === "email") {
    return (
      <a
        href={`mailto:${value}`}
        onClick={(e) => e.stopPropagation()}
        style={{ color: "var(--blue)", textDecoration: "underline", fontSize: 13 }}
      >
        {value}
      </a>
    );
  }

  if (column.type === "date" && value) {
    try {
      const d = new Date(value);
      return <span style={{ fontSize: 13 }}>{d.toLocaleDateString()}</span>;
    } catch {
      return <span style={{ fontSize: 13 }}>{value}</span>;
    }
  }

  return <span style={{ fontSize: 13 }}>{String(value)}</span>;
}

// ── Main Page ────────────────────────────────────────

export default function TablesPage() {
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showCreateTable, setShowCreateTable] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [newTableDesc, setNewTableDesc] = useState("");
  const [showAddCol, setShowAddCol] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColType, setNewColType] = useState("text");
  const [newColChoices, setNewColChoices] = useState("");
  const [editingCell, setEditingCell] = useState<{ rowId: string; colId: string } | null>(null);

  // Column rename
  const [renamingCol, setRenamingCol] = useState<string | null>(null);
  const [renameColValue, setRenameColValue] = useState("");

  // Column header menu
  const [colMenuOpen, setColMenuOpen] = useState<string | null>(null);

  // Add column popover ref
  const addColBtnRef = useRef<HTMLTableCellElement>(null);
  const addColPopoverRef = useRef<HTMLDivElement>(null);

  // Table rename
  const [editingTableName, setEditingTableName] = useState(false);
  const [editTableNameVal, setEditTableNameVal] = useState("");

  // ── Load tables list ──────────────────────────────
  const loadTables = useCallback(async () => {
    try {
      setError(null);
      const res = await api.listTables();
      setTables(res.tables);
    } catch (err: any) {
      console.error("Failed to load tables:", err);
      setError(err?.message || "Failed to load tables");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  // ── Load single table data ────────────────────────
  const loadTable = useCallback(async (tableId: string) => {
    setTableLoading(true);
    try {
      const res = await api.getTable(tableId);
      setColumns(res.columns);
      setRows(res.rows);
    } catch (err) {
      console.error("Failed to load table:", err);
    } finally {
      setTableLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTableId) loadTable(selectedTableId);
  }, [selectedTableId, loadTable]);

  // ── Create table ──────────────────────────────────
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const handleCreateTable = async () => {
    if (!newTableName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await api.createTable({ name: newTableName.trim(), description: newTableDesc.trim() || undefined });
      setTables((prev) => [res.table, ...prev]);
      setSelectedTableId(res.table.id);
      setColumns(res.columns);
      setRows([]);
      setNewTableName("");
      setNewTableDesc("");
      setShowCreateTable(false);
    } catch (err: any) {
      console.error("Failed to create table:", err);
      setCreateError(err?.message || "Failed to create table. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  // ── Delete table ──────────────────────────────────
  const handleDeleteTable = async (id: string) => {
    if (!confirm("Delete this table and all its data? This cannot be undone.")) return;
    try {
      await api.deleteTable(id);
      setTables((prev) => prev.filter((t) => t.id !== id));
      if (selectedTableId === id) {
        setSelectedTableId(null);
        setColumns([]);
        setRows([]);
      }
    } catch (err) {
      console.error("Failed to delete table:", err);
    }
  };

  // ── Rename table ──────────────────────────────────
  const handleRenameTable = async () => {
    if (!selectedTableId || !editTableNameVal.trim()) return;
    try {
      const res = await api.updateTable(selectedTableId, { name: editTableNameVal.trim() });
      setTables((prev) => prev.map((t) => (t.id === selectedTableId ? { ...t, name: res.table.name } : t)));
      setEditingTableName(false);
    } catch (err) {
      console.error("Failed to rename table:", err);
    }
  };

  // ── Add column ────────────────────────────────────
  const handleAddColumn = async () => {
    if (!selectedTableId || !newColName.trim()) return;
    const opts: any = {};
    if (newColType === "select" && newColChoices.trim()) {
      opts.choices = newColChoices.split(",").map((c) => c.trim()).filter(Boolean);
    }
    try {
      const res = await api.addColumn(selectedTableId, {
        name: newColName.trim(),
        type: newColType,
        options: Object.keys(opts).length > 0 ? opts : undefined,
      });
      setColumns((prev) => [...prev, res.column]);
      setNewColName("");
      setNewColType("text");
      setNewColChoices("");
      setShowAddCol(false);
    } catch (err) {
      console.error("Failed to add column:", err);
    }
  };

  // ── Delete column ─────────────────────────────────
  const handleDeleteColumn = async (colId: string) => {
    try {
      await api.deleteColumn(colId);
      setColumns((prev) => prev.filter((c) => c.id !== colId));
      // Clean cell data
      setRows((prev) =>
        prev.map((r) => {
          const cells = { ...r.cells };
          delete cells[colId];
          return { ...r, cells };
        }),
      );
    } catch (err) {
      console.error("Failed to delete column:", err);
    }
  };

  // ── Rename column ─────────────────────────────────
  const handleRenameColumn = async (colId: string) => {
    if (!renameColValue.trim()) {
      setRenamingCol(null);
      return;
    }
    try {
      const res = await api.updateColumn(colId, { name: renameColValue.trim() });
      setColumns((prev) => prev.map((c) => (c.id === colId ? { ...c, name: res.column.name } : c)));
      setRenamingCol(null);
    } catch (err) {
      console.error("Failed to rename column:", err);
    }
  };

  // ── Add row ───────────────────────────────────────
  const handleAddRow = async () => {
    if (!selectedTableId) return;
    try {
      const res = await api.addRow(selectedTableId);
      setRows((prev) => [...prev, res.row]);
    } catch (err) {
      console.error("Failed to add row:", err);
    }
  };

  // ── Delete row ────────────────────────────────────
  const handleDeleteRow = async (rowId: string) => {
    try {
      await api.deleteRow(rowId);
      setRows((prev) => prev.filter((r) => r.id !== rowId));
    } catch (err) {
      console.error("Failed to delete row:", err);
    }
  };

  // ── Save cell ─────────────────────────────────────
  const handleSaveCell = async (rowId: string, colId: string, value: any) => {
    setEditingCell(null);
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;

    const newCells = { ...row.cells, [colId]: value };
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, cells: newCells } : r)));

    try {
      await api.updateRow(rowId, newCells);
    } catch (err) {
      console.error("Failed to save cell:", err);
      // Revert
      setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, cells: row.cells } : r)));
    }
  };

  // ── Filter rows by search ─────────────────────────
  const filteredRows = searchQuery
    ? rows.filter((r) =>
        Object.values(r.cells).some(
          (v) => v !== null && v !== undefined && String(v).toLowerCase().includes(searchQuery.toLowerCase()),
        ),
      )
    : rows;

  const selectedTable = tables.find((t) => t.id === selectedTableId);

  // ── Loading state ─────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <div
          style={{
            width: 32,
            height: 32,
            border: "3px solid var(--border)",
            borderTopColor: "var(--text)",
            borderRadius: "50%",
            animation: "spin 0.6s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  // ── Table list view (no table selected) ───────────
  if (!selectedTableId) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text)", margin: 0 }}>Tables</h1>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" }}>
              Create spreadsheet-style tables as a shared database for your team
            </p>
          </div>
          <button
            onClick={() => setShowCreateTable(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              background: "var(--text)",
              color: "var(--bg)",
              border: "none",
              borderRadius: "var(--radius-md)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <Plus size={15} />
            New Table
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: "10px 14px",
              marginBottom: 16,
              background: "var(--red-bg, #fef2f2)",
              border: "1px solid var(--red-border, #fecaca)",
              borderRadius: "var(--radius-md)",
              color: "var(--red, #dc2626)",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <span>{error}</span>
            <button
              onClick={() => { setError(null); loadTables(); }}
              style={{
                background: "none",
                border: "1px solid var(--red-border, #fecaca)",
                borderRadius: "var(--radius-sm)",
                padding: "4px 10px",
                fontSize: 12,
                cursor: "pointer",
                color: "var(--red, #dc2626)",
                whiteSpace: "nowrap",
              }}
            >
              Retry
            </button>
          </div>
        )}

        {tables.length === 0 && !error ? (
          <div
            style={{
              textAlign: "center",
              padding: "80px 20px",
              color: "var(--text-secondary)",
            }}
          >
            <Table2 size={48} strokeWidth={1} style={{ marginBottom: 16, color: "var(--text-tertiary)" }} />
            <h3 style={{ fontSize: 16, fontWeight: 500, margin: "0 0 8px" }}>No tables yet</h3>
            <p style={{ fontSize: 13, margin: "0 0 20px" }}>
              Create your first table to start storing structured data
            </p>
            <button
              onClick={() => setShowCreateTable(true)}
              style={{
                padding: "8px 16px",
                background: "var(--text)",
                color: "var(--bg)",
                border: "none",
                borderRadius: "var(--radius-md)",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Create Table
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 12,
            }}
          >
            {tables.map((t) => (
              <div
                key={t.id}
                onClick={() => setSelectedTableId(t.id)}
                style={{
                  padding: 16,
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  background: "var(--bg)",
                  transition: "all 0.1s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--text-tertiary)";
                  e.currentTarget.style.boxShadow = "var(--shadow-sm)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Table2 size={16} style={{ color: "var(--blue)" }} />
                    <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>{t.name}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteTable(t.id);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 4,
                      color: "var(--text-tertiary)",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {t.description && (
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "8px 0 0", lineHeight: 1.4 }}>
                    {t.description}
                  </p>
                )}
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 12 }}>
                  Updated {new Date(t.updatedAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Table Modal */}
        {showCreateTable && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 100,
            }}
            onClick={() => setShowCreateTable(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "var(--bg)",
                borderRadius: "var(--radius-lg)",
                padding: 24,
                width: 400,
                boxShadow: "var(--shadow-lg, 0 10px 40px rgba(0,0,0,0.15))",
              }}
            >
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 16px", color: "var(--text)" }}>
                Create New Table
              </h3>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Table Name
                </label>
                <input
                  autoFocus
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateTable()}
                  placeholder="e.g. Leads, Inventory, Content Calendar..."
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: 13,
                    outline: "none",
                    background: "var(--bg)",
                    color: "var(--text)",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Description (optional)
                </label>
                <input
                  value={newTableDesc}
                  onChange={(e) => setNewTableDesc(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateTable()}
                  placeholder="What is this table for?"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: 13,
                    outline: "none",
                    background: "var(--bg)",
                    color: "var(--text)",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              {createError && (
                <div
                  style={{
                    padding: "8px 12px",
                    marginBottom: 12,
                    background: "var(--red-bg, #fef2f2)",
                    border: "1px solid var(--red-border, #fecaca)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--red, #dc2626)",
                    fontSize: 12,
                  }}
                >
                  {createError}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  onClick={() => { setShowCreateTable(false); setCreateError(null); }}
                  style={{
                    padding: "8px 14px",
                    background: "none",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: 13,
                    cursor: "pointer",
                    color: "var(--text-secondary)",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateTable}
                  disabled={!newTableName.trim() || creating}
                  style={{
                    padding: "8px 14px",
                    background: newTableName.trim() && !creating ? "var(--text)" : "var(--bg-secondary)",
                    color: newTableName.trim() && !creating ? "var(--bg)" : "var(--text-tertiary)",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: newTableName.trim() && !creating ? "pointer" : "default",
                    opacity: creating ? 0.7 : 1,
                  }}
                >
                  {creating ? "Creating..." : "Create Table"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Table detail view (spreadsheet) ───────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 48px)" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => {
              setSelectedTableId(null);
              setColumns([]);
              setRows([]);
              setSearchQuery("");
              loadTables();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "6px 10px",
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              fontSize: 12,
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            <ArrowLeft size={14} />
            All Tables
          </button>

          {editingTableName ? (
            <input
              autoFocus
              value={editTableNameVal}
              onChange={(e) => setEditTableNameVal(e.target.value)}
              onBlur={handleRenameTable}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameTable();
                if (e.key === "Escape") setEditingTableName(false);
              }}
              style={{
                fontSize: 18,
                fontWeight: 600,
                border: "1px solid var(--blue)",
                borderRadius: 4,
                padding: "2px 8px",
                outline: "none",
                color: "var(--text)",
                background: "var(--bg)",
              }}
            />
          ) : (
            <h1
              onClick={() => {
                setEditingTableName(true);
                setEditTableNameVal(selectedTable?.name || "");
              }}
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "var(--text)",
                margin: 0,
                cursor: "pointer",
                padding: "2px 4px",
                borderRadius: 4,
              }}
              title="Click to rename"
            >
              {selectedTable?.name}
            </h1>
          )}

          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            {rows.length} row{rows.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Search */}
          <div style={{ position: "relative" }}>
            <Search
              size={14}
              style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }}
            />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search rows..."
              style={{
                padding: "6px 10px 6px 28px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                fontSize: 12,
                outline: "none",
                width: 180,
                background: "var(--bg)",
                color: "var(--text)",
              }}
            />
          </div>
        </div>
      </div>

      {/* Spreadsheet */}
      {tableLoading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
          <div
            style={{
              width: 24,
              height: 24,
              border: "2px solid var(--border)",
              borderTopColor: "var(--text)",
              borderRadius: "50%",
              animation: "spin 0.6s linear infinite",
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            overflow: "auto",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            background: "var(--bg)",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
              minWidth: columns.length * 180 + 80,
            }}
          >
            {/* Column headers */}
            <thead>
              <tr style={{ position: "sticky", top: 0, zIndex: 10 }}>
                {/* Row number column */}
                <th
                  style={{
                    width: 40,
                    minWidth: 40,
                    padding: "8px 4px",
                    background: "var(--bg-secondary)",
                    borderBottom: "1px solid var(--border)",
                    borderRight: "1px solid var(--border)",
                    fontSize: 11,
                    fontWeight: 500,
                    color: "var(--text-tertiary)",
                    textAlign: "center",
                    position: "sticky",
                    left: 0,
                    zIndex: 11,
                  }}
                >
                  #
                </th>
                {columns.map((col) => {
                  const Icon = getTypeIcon(col.type);
                  return (
                    <th
                      key={col.id}
                      style={{
                        padding: "0",
                        background: "var(--bg-secondary)",
                        borderBottom: "1px solid var(--border)",
                        borderRight: "1px solid var(--border)",
                        fontWeight: 500,
                        color: "var(--text-secondary)",
                        textAlign: "left",
                        minWidth: 150,
                        position: "relative",
                      }}
                    >
                      {renamingCol === col.id ? (
                        <input
                          autoFocus
                          value={renameColValue}
                          onChange={(e) => setRenameColValue(e.target.value)}
                          onBlur={() => handleRenameColumn(col.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameColumn(col.id);
                            if (e.key === "Escape") setRenamingCol(null);
                          }}
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            border: "none",
                            outline: "none",
                            fontSize: 12,
                            fontWeight: 500,
                            background: "var(--bg)",
                            color: "var(--text)",
                            boxSizing: "border-box",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "8px 6px 8px 10px",
                            cursor: "default",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                            <Icon size={13} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                            <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {col.name}
                            </span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setColMenuOpen(colMenuOpen === col.id ? null : col.id);
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: 2,
                              color: "var(--text-tertiary)",
                              borderRadius: 3,
                              display: "flex",
                              alignItems: "center",
                              flexShrink: 0,
                            }}
                          >
                            <ChevronDown size={12} />
                          </button>
                        </div>
                      )}

                      {/* Column dropdown menu */}
                      {colMenuOpen === col.id && (
                        <div
                          style={{
                            position: "absolute",
                            top: "100%",
                            right: 0,
                            background: "var(--bg)",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius-sm)",
                            boxShadow: "var(--shadow-sm)",
                            zIndex: 20,
                            minWidth: 140,
                            padding: 4,
                          }}
                        >
                          <button
                            onClick={() => {
                              setRenamingCol(col.id);
                              setRenameColValue(col.name);
                              setColMenuOpen(null);
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              width: "100%",
                              padding: "6px 8px",
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              fontSize: 12,
                              color: "var(--text)",
                              borderRadius: 3,
                              textAlign: "left",
                            }}
                          >
                            <Pencil size={12} />
                            Rename
                          </button>
                          <button
                            onClick={() => {
                              handleDeleteColumn(col.id);
                              setColMenuOpen(null);
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              width: "100%",
                              padding: "6px 8px",
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              fontSize: 12,
                              color: "var(--red)",
                              borderRadius: 3,
                              textAlign: "left",
                            }}
                          >
                            <Trash2 size={12} />
                            Delete Column
                          </button>
                        </div>
                      )}
                    </th>
                  );
                })}

                {/* Add column button */}
                <th
                  ref={addColBtnRef}
                  style={{
                    width: 40,
                    minWidth: 40,
                    padding: 0,
                    background: "var(--bg-secondary)",
                    borderBottom: "1px solid var(--border)",
                    textAlign: "center",
                    position: "relative",
                  }}
                >
                  <button
                    onClick={() => setShowAddCol(true)}
                    title="Add column"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "8px",
                      color: "var(--text-tertiary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "100%",
                    }}
                  >
                    <Plus size={14} />
                  </button>
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.map((row, rowIndex) => (
                <tr
                  key={row.id}
                  style={{ transition: "background 0.05s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-secondary)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {/* Row number */}
                  <td
                    style={{
                      padding: "0 4px",
                      borderBottom: "1px solid var(--border)",
                      borderRight: "1px solid var(--border)",
                      fontSize: 11,
                      color: "var(--text-tertiary)",
                      textAlign: "center",
                      background: "var(--bg-secondary)",
                      position: "sticky",
                      left: 0,
                      zIndex: 5,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 34 }}>
                      <span className="row-num">{rowIndex + 1}</span>
                      <button
                        className="row-del"
                        onClick={() => handleDeleteRow(row.id)}
                        title="Delete row"
                        style={{
                          display: "none",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--red)",
                          padding: 0,
                          lineHeight: 1,
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>

                  {/* Cells */}
                  {columns.map((col) => {
                    const isEditing = editingCell?.rowId === row.id && editingCell?.colId === col.id;
                    const cellValue = row.cells[col.id];

                    return (
                      <td
                        key={col.id}
                        onClick={() => {
                          if (!isEditing) {
                            setEditingCell({ rowId: row.id, colId: col.id });
                            setColMenuOpen(null);
                          }
                        }}
                        style={{
                          padding: isEditing ? "2px 4px" : "6px 10px",
                          borderBottom: "1px solid var(--border)",
                          borderRight: "1px solid var(--border)",
                          cursor: isEditing ? "text" : "cell",
                          minHeight: 34,
                          verticalAlign: "middle",
                        }}
                      >
                        {isEditing ? (
                          <CellEditor
                            value={cellValue}
                            column={col}
                            onSave={(val) => handleSaveCell(row.id, col.id, val)}
                            onCancel={() => setEditingCell(null)}
                          />
                        ) : (
                          <CellDisplay value={cellValue} column={col} />
                        )}
                      </td>
                    );
                  })}

                  {/* Empty cell for the + column */}
                  <td
                    style={{
                      borderBottom: "1px solid var(--border)",
                      width: 40,
                    }}
                  />
                </tr>
              ))}

              {/* Add row button */}
              <tr>
                <td
                  colSpan={columns.length + 2}
                  style={{
                    padding: 0,
                  }}
                >
                  <button
                    onClick={handleAddRow}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      width: "100%",
                      padding: "8px 12px",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 12,
                      color: "var(--text-tertiary)",
                      textAlign: "left",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-secondary)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <Plus size={14} />
                    New Row
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Row hover styles */}
      <style>{`
        tr:hover .row-num { display: none !important; }
        tr:hover .row-del { display: block !important; }
      `}</style>

      {/* Add Column Popover */}
      {showAddCol && (
        <>
          {/* Invisible backdrop to close on outside click */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 99 }}
            onClick={() => setShowAddCol(false)}
          />
          <div
            ref={addColPopoverRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: (() => {
                const rect = addColBtnRef.current?.getBoundingClientRect();
                return rect ? rect.bottom + 4 : 0;
              })(),
              left: (() => {
                const rect = addColBtnRef.current?.getBoundingClientRect();
                return rect ? rect.right - 300 : 0;
              })(),
              width: 300,
              background: "var(--bg)",
              borderRadius: "var(--radius-lg)",
              padding: 16,
              boxShadow: "0 4px 24px rgba(0,0,0,0.16), 0 0 0 1px var(--border)",
              zIndex: 100,
            }}
          >
            <div style={{ marginBottom: 10 }}>
              <input
                autoFocus
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddColumn()}
                placeholder="Field name"
                style={{
                  width: "100%",
                  padding: "7px 10px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 13,
                  outline: "none",
                  background: "var(--bg)",
                  color: "var(--text)",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ marginBottom: newColType === "select" ? 10 : 0 }}>
              <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Type
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {COLUMN_TYPES.map((ct) => {
                  const Icon = ct.icon;
                  const selected = newColType === ct.value;
                  return (
                    <button
                      key={ct.value}
                      onClick={() => setNewColType(ct.value)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 8px",
                        border: "none",
                        background: selected ? "rgba(59,130,246,0.1)" : "transparent",
                        color: selected ? "var(--blue)" : "var(--text)",
                        borderRadius: "var(--radius-sm)",
                        fontSize: 13,
                        cursor: "pointer",
                        fontWeight: selected ? 500 : 400,
                        width: "100%",
                        textAlign: "left",
                      }}
                      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = "var(--bg-secondary)"; }}
                      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = "transparent"; }}
                    >
                      <Icon size={14} />
                      {ct.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {newColType === "select" && (
              <div style={{ marginBottom: 0 }}>
                <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Options (comma-separated)
                </label>
                <input
                  value={newColChoices}
                  onChange={(e) => setNewColChoices(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddColumn()}
                  placeholder="e.g. Todo, In Progress, Done"
                  style={{
                    width: "100%",
                    padding: "7px 10px",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: 13,
                    outline: "none",
                    background: "var(--bg)",
                    color: "var(--text)",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <button
                onClick={() => setShowAddCol(false)}
                style={{
                  padding: "6px 12px",
                  background: "none",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 12,
                  cursor: "pointer",
                  color: "var(--text-secondary)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddColumn}
                disabled={!newColName.trim()}
                style={{
                  padding: "6px 12px",
                  background: newColName.trim() ? "var(--blue)" : "var(--bg-secondary)",
                  color: newColName.trim() ? "#fff" : "var(--text-tertiary)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: newColName.trim() ? "pointer" : "default",
                }}
              >
                Add field
              </button>
            </div>
          </div>
        </>
      )}

      {/* Click outside to close column menu */}
      {colMenuOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 15 }}
          onClick={() => setColMenuOpen(null)}
        />
      )}
    </div>
  );
}
