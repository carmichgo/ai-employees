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
  Database,
  Download,
} from "lucide-react";

// ── Types ────────────────────────────────────────────

interface BaseMeta {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
}

interface TableMeta {
  id: string;
  baseId: string | null;
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

const BASE_COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#06b6d4",
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
  // Navigation: null = bases list, string = inside a base
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  // Bases
  const [bases, setBases] = useState<BaseMeta[]>([]);
  const [basesLoading, setBasesLoading] = useState(true);
  const [basesError, setBasesError] = useState<string | null>(null);

  // Tables inside a base
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Create base modal
  const [showCreateBase, setShowCreateBase] = useState(false);
  const [newBaseName, setNewBaseName] = useState("");
  const [newBaseDesc, setNewBaseDesc] = useState("");
  const [newBaseColor, setNewBaseColor] = useState("#3b82f6");
  const [newBaseIcon, setNewBaseIcon] = useState("📊");
  const [creatingBase, setCreatingBase] = useState(false);
  const [createBaseError, setCreateBaseError] = useState<string | null>(null);

  // Create table modal
  const [showCreateTable, setShowCreateTable] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [newTableDesc, setNewTableDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Column / row editing
  const [showAddCol, setShowAddCol] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColType, setNewColType] = useState("text");
  const [newColChoices, setNewColChoices] = useState("");
  const [editingCell, setEditingCell] = useState<{ rowId: string; colId: string } | null>(null);
  const [renamingCol, setRenamingCol] = useState<string | null>(null);
  const [renameColValue, setRenameColValue] = useState("");
  const [colMenuOpen, setColMenuOpen] = useState<string | null>(null);
  const addColBtnRef = useRef<HTMLTableCellElement>(null);
  const addColPopoverRef = useRef<HTMLDivElement>(null);

  // Column resize
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const resizeRef = useRef<{ colId: string; startX: number; startW: number } | null>(null);

  const handleResizeStart = useCallback((colId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.target as HTMLElement).closest("th");
    const startW = columnWidths[colId] || th?.offsetWidth || 180;
    resizeRef.current = { colId, startX: e.clientX, startW };

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const diff = ev.clientX - resizeRef.current.startX;
      const newW = Math.max(60, resizeRef.current.startW + diff);
      setColumnWidths((prev) => ({ ...prev, [resizeRef.current!.colId]: newW }));
    };
    const onMouseUp = () => {
      resizeRef.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [columnWidths]);

  // Base rename
  const [editingBaseName, setEditingBaseName] = useState(false);
  const [editBaseNameVal, setEditBaseNameVal] = useState("");

  // Table rename
  const [editingTableName, setEditingTableName] = useState(false);
  const [editTableNameVal, setEditTableNameVal] = useState("");

  // ── Load bases list ──────────────────────────────
  const loadBases = useCallback(async () => {
    try {
      setBasesError(null);
      const res = await api.listBases();
      setBases(res.bases);
    } catch (err: any) {
      console.error("Failed to load bases:", err);
      setBasesError(err?.message || "Failed to load bases");
    } finally {
      setBasesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBases();
  }, [loadBases]);

  // ── Load tables for a base ─────────────────────
  const loadBase = useCallback(async (baseId: string) => {
    try {
      const res = await api.getBase(baseId);
      setTables(res.tables);
    } catch (err) {
      console.error("Failed to load base:", err);
    }
  }, []);

  useEffect(() => {
    if (selectedBaseId) {
      loadBase(selectedBaseId);
    }
  }, [selectedBaseId, loadBase]);

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

  // ── Create base ──────────────────────────────────
  const handleCreateBase = async () => {
    if (!newBaseName.trim()) return;
    setCreatingBase(true);
    setCreateBaseError(null);
    try {
      const res = await api.createBase({
        name: newBaseName.trim(),
        description: newBaseDesc.trim() || undefined,
        color: newBaseColor,
        icon: newBaseIcon,
      });
      setBases((prev) => [res.base, ...prev]);
      setNewBaseName("");
      setNewBaseDesc("");
      setNewBaseColor("#3b82f6");
      setNewBaseIcon("📊");
      setShowCreateBase(false);
      // Open the new base
      setSelectedBaseId(res.base.id);
      setTables([]);
    } catch (err: any) {
      console.error("Failed to create base:", err);
      setCreateBaseError(err?.message || "Failed to create base");
    } finally {
      setCreatingBase(false);
    }
  };

  // ── Delete base ──────────────────────────────────
  const handleDeleteBase = async (id: string) => {
    if (!confirm("Delete this base and ALL its tables? This cannot be undone.")) return;
    try {
      await api.deleteBase(id);
      setBases((prev) => prev.filter((b) => b.id !== id));
      if (selectedBaseId === id) {
        setSelectedBaseId(null);
        setSelectedTableId(null);
        setTables([]);
        setColumns([]);
        setRows([]);
      }
    } catch (err) {
      console.error("Failed to delete base:", err);
    }
  };

  // ── Rename base ──────────────────────────────────
  const handleRenameBase = async () => {
    if (!selectedBaseId || !editBaseNameVal.trim()) return;
    try {
      const res = await api.updateBase(selectedBaseId, { name: editBaseNameVal.trim() });
      setBases((prev) => prev.map((b) => (b.id === selectedBaseId ? { ...b, name: res.base.name } : b)));
      setEditingBaseName(false);
    } catch (err) {
      console.error("Failed to rename base:", err);
    }
  };

  // ── Create table ──────────────────────────────────
  const handleCreateTable = async () => {
    if (!newTableName.trim() || !selectedBaseId) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await api.createTable({
        name: newTableName.trim(),
        description: newTableDesc.trim() || undefined,
        baseId: selectedBaseId,
      });
      setTables((prev) => [res.table, ...prev]);
      setSelectedTableId(res.table.id);
      setColumns(res.columns);
      setRows([]);
      setNewTableName("");
      setNewTableDesc("");
      setShowCreateTable(false);
    } catch (err: any) {
      console.error("Failed to create table:", err);
      setCreateError(err?.message || "Failed to create table");
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

  const selectedBase = bases.find((b) => b.id === selectedBaseId);
  const selectedTable = tables.find((t) => t.id === selectedTableId);

  const handleExportCsv = () => {
    if (!selectedTable || columns.length === 0) return;
    const sortedCols = [...columns].sort((a, b) => a.position - b.position);
    const escape = (v: any): string => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const header = sortedCols.map((c) => escape(c.name)).join(",");
    const dataRows = filteredRows.map((row) =>
      sortedCols.map((col) => {
        const val = row.cells[col.id];
        if (col.type === "boolean") return val ? "true" : "false";
        if (col.type === "date" && val) return new Date(val).toISOString().split("T")[0];
        return escape(val);
      }).join(",")
    );
    const csv = [header, ...dataRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedTable.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Loading state ─────────────────────────────────
  if (basesLoading) {
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

  // ═══════════════════════════════════════════════════
  // BASES LIST VIEW (top level)
  // ═══════════════════════════════════════════════════
  if (!selectedBaseId) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text)", margin: 0 }}>Bases</h1>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" }}>
              Organize your data into bases. Each base contains multiple tables, like sheets in a spreadsheet.
            </p>
          </div>
          <button
            onClick={() => setShowCreateBase(true)}
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
            New Base
          </button>
        </div>

        {basesError && (
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
            <span>{basesError}</span>
            <button
              onClick={() => { setBasesError(null); loadBases(); }}
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

        {bases.length === 0 && !basesError ? (
          <div style={{ textAlign: "center", padding: "80px 20px", color: "var(--text-secondary)" }}>
            <Database size={48} strokeWidth={1} style={{ marginBottom: 16, color: "var(--text-tertiary)" }} />
            <h3 style={{ fontSize: 16, fontWeight: 500, margin: "0 0 8px" }}>No bases yet</h3>
            <p style={{ fontSize: 13, margin: "0 0 20px" }}>
              Create your first base to start organizing data into tables
            </p>
            <button
              onClick={() => setShowCreateBase(true)}
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
              Create Base
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {bases.map((b) => (
              <div
                key={b.id}
                onClick={() => {
                  setSelectedBaseId(b.id);
                  setSelectedTableId(null);
                  setColumns([]);
                  setRows([]);
                  setSearchQuery("");
                }}
                style={{
                  padding: 0,
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  background: "var(--bg)",
                  transition: "all 0.1s ease",
                  overflow: "hidden",
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
                {/* Color header bar */}
                <div style={{ height: 6, background: b.color || "#3b82f6" }} />
                <div style={{ padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 20 }}>{b.icon || "📊"}</span>
                      <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>{b.name}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteBase(b.id);
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
                  {b.description && (
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "8px 0 0", lineHeight: 1.4 }}>
                      {b.description}
                    </p>
                  )}
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 12 }}>
                    Updated {new Date(b.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Base Modal */}
        {showCreateBase && (
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
            onClick={() => setShowCreateBase(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ background: "var(--bg)", borderRadius: "var(--radius-lg)", padding: 24, width: 420, boxShadow: "var(--shadow-lg, 0 10px 40px rgba(0,0,0,0.15))" }}
            >
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 16px", color: "var(--text)" }}>
                Create New Base
              </h3>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Base Name
                </label>
                <input
                  autoFocus
                  value={newBaseName}
                  onChange={(e) => setNewBaseName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateBase()}
                  placeholder="e.g. Marketing, Sales Pipeline, Product..."
                  style={{
                    width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                    fontSize: 13, outline: "none", background: "var(--bg)", color: "var(--text)", boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Description (optional)
                </label>
                <input
                  value={newBaseDesc}
                  onChange={(e) => setNewBaseDesc(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateBase()}
                  placeholder="What is this base for?"
                  style={{
                    width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                    fontSize: 13, outline: "none", background: "var(--bg)", color: "var(--text)", boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Icon
                </label>
                <input
                  value={newBaseIcon}
                  onChange={(e) => setNewBaseIcon(e.target.value)}
                  style={{
                    width: 60, padding: "6px 8px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                    fontSize: 18, outline: "none", background: "var(--bg)", textAlign: "center", boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Color
                </label>
                <div style={{ display: "flex", gap: 6 }}>
                  {BASE_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewBaseColor(c)}
                      style={{
                        width: 28, height: 28, borderRadius: "50%", background: c, border: newBaseColor === c ? "3px solid var(--text)" : "2px solid transparent",
                        cursor: "pointer", padding: 0, outline: "none",
                      }}
                    />
                  ))}
                </div>
              </div>
              {createBaseError && (
                <div style={{ padding: "8px 12px", marginBottom: 12, background: "var(--red-bg, #fef2f2)", border: "1px solid var(--red-border, #fecaca)", borderRadius: "var(--radius-sm)", color: "var(--red, #dc2626)", fontSize: 12 }}>
                  {createBaseError}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  onClick={() => { setShowCreateBase(false); setCreateBaseError(null); }}
                  style={{ padding: "8px 14px", background: "none", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 13, cursor: "pointer", color: "var(--text-secondary)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateBase}
                  disabled={!newBaseName.trim() || creatingBase}
                  style={{
                    padding: "8px 14px",
                    background: newBaseName.trim() && !creatingBase ? "var(--text)" : "var(--bg-secondary)",
                    color: newBaseName.trim() && !creatingBase ? "var(--bg)" : "var(--text-tertiary)",
                    border: "none", borderRadius: "var(--radius-sm)", fontSize: 13, fontWeight: 500,
                    cursor: newBaseName.trim() && !creatingBase ? "pointer" : "default",
                    opacity: creatingBase ? 0.7 : 1,
                  }}
                >
                  {creatingBase ? "Creating..." : "Create Base"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════
  // BASE DETAIL VIEW (table tabs + spreadsheet)
  // ═══════════════════════════════════════════════════
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 48px)", overflow: "hidden" }}>
      {/* Base header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 0, flexShrink: 0, paddingBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => {
              setSelectedBaseId(null);
              setSelectedTableId(null);
              setTables([]);
              setColumns([]);
              setRows([]);
              setSearchQuery("");
              loadBases();
            }}
            style={{
              display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", background: "none",
              border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--text-secondary)", cursor: "pointer",
            }}
          >
            <ArrowLeft size={14} />
            All Bases
          </button>

          <span style={{ fontSize: 20 }}>{selectedBase?.icon || "📊"}</span>

          {editingBaseName ? (
            <input
              autoFocus
              value={editBaseNameVal}
              onChange={(e) => setEditBaseNameVal(e.target.value)}
              onBlur={handleRenameBase}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameBase();
                if (e.key === "Escape") setEditingBaseName(false);
              }}
              style={{
                fontSize: 18, fontWeight: 600, border: "1px solid var(--blue)", borderRadius: 4,
                padding: "2px 8px", outline: "none", color: "var(--text)", background: "var(--bg)",
              }}
            />
          ) : (
            <h1
              onClick={() => {
                setEditingBaseName(true);
                setEditBaseNameVal(selectedBase?.name || "");
              }}
              style={{ fontSize: 18, fontWeight: 600, color: "var(--text)", margin: 0, cursor: "pointer", padding: "2px 4px", borderRadius: 4 }}
              title="Click to rename"
            >
              {selectedBase?.name}
            </h1>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {selectedTableId && (
            <>
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
                    padding: "6px 10px 6px 28px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                    fontSize: 12, outline: "none", width: 180, background: "var(--bg)", color: "var(--text)",
                  }}
                />
              </div>
              <button
                onClick={handleExportCsv}
                disabled={columns.length === 0}
                title="Export table as CSV"
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "6px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                  fontSize: 12, background: "var(--bg)", color: "var(--text)", cursor: "pointer",
                }}
              >
                <Download size={12} /> Export CSV
              </button>
            </>
          )}
        </div>
      </div>

      {/* Table tabs bar — horizontally scrollable within viewport */}
      <div
        className="table-tabs-bar"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 0,
          borderBottom: "1px solid var(--border)",
          marginBottom: 0,
          flexShrink: 0,
          overflowX: "auto",
          overflowY: "hidden",
          minWidth: 0,
          scrollbarWidth: "none",
        }}
      >
        {tables.map((t) => {
          const isActive = selectedTableId === t.id;
          return (
            <div
              key={t.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: isActive ? 500 : 400,
                color: isActive ? "var(--text)" : "var(--text-secondary)",
                background: isActive ? "var(--bg)" : "transparent",
                borderBottom: isActive ? "2px solid var(--blue)" : "2px solid transparent",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.1s",
              }}
              onClick={() => {
                setSelectedTableId(t.id);
                setSearchQuery("");
                setEditingTableName(false);
              }}
            >
              <Table2 size={13} style={{ color: isActive ? "var(--blue)" : "var(--text-tertiary)" }} />
              {editingTableName && isActive ? (
                <input
                  autoFocus
                  value={editTableNameVal}
                  onChange={(e) => setEditTableNameVal(e.target.value)}
                  onBlur={handleRenameTable}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameTable();
                    if (e.key === "Escape") setEditingTableName(false);
                  }}
                  style={{
                    fontSize: 13, fontWeight: 500, border: "1px solid var(--blue)", borderRadius: 3,
                    padding: "1px 6px", outline: "none", color: "var(--text)", background: "var(--bg)", width: 120,
                  }}
                />
              ) : (
                <span
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingTableName(true);
                    setEditTableNameVal(t.name);
                  }}
                  title="Double-click to rename"
                >
                  {t.name}
                </span>
              )}
              {isActive && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteTable(t.id);
                  }}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--text-tertiary)", display: "flex", alignItems: "center" }}
                  title="Delete table"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}

        {/* Add table tab */}
        <button
          onClick={() => setShowCreateTable(true)}
          style={{
            display: "flex", alignItems: "center", gap: 4, padding: "8px 12px", background: "none", border: "none",
            cursor: "pointer", fontSize: 12, color: "var(--text-tertiary)", whiteSpace: "nowrap",
          }}
          title="Add table"
        >
          <Plus size={14} />
          Add Table
        </button>
      </div>

      {/* Spreadsheet content area */}
      {!selectedTableId ? (
        /* No table selected — show prompt */
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: "var(--text-secondary)" }}>
          <div style={{ textAlign: "center" }}>
            <Table2 size={40} strokeWidth={1} style={{ marginBottom: 12, color: "var(--text-tertiary)" }} />
            {tables.length === 0 ? (
              <>
                <p style={{ fontSize: 14, margin: "0 0 16px" }}>
                  This base has no tables yet
                </p>
                <button
                  onClick={() => setShowCreateTable(true)}
                  style={{
                    padding: "8px 16px", background: "var(--text)", color: "var(--bg)", border: "none",
                    borderRadius: "var(--radius-md)", fontSize: 13, fontWeight: 500, cursor: "pointer",
                  }}
                >
                  Create First Table
                </button>
              </>
            ) : (
              <p style={{ fontSize: 14, margin: 0 }}>Select a table above to view its data</p>
            )}
          </div>
        </div>
      ) : tableLoading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
          <div
            style={{
              width: 24, height: 24, border: "2px solid var(--border)", borderTopColor: "var(--text)",
              borderRadius: "50%", animation: "spin 0.6s linear infinite",
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: "auto", border: "1px solid var(--border)", borderTop: "none", background: "var(--bg)", minWidth: 0, minHeight: 0 }}>
          <table
            style={{ minWidth: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}
          >
            <colgroup>
              <col style={{ width: 40 }} />
              {columns.map((col) => (
                <col key={col.id} style={{ width: columnWidths[col.id] || 180 }} />
              ))}
              <col style={{ width: 40 }} />
            </colgroup>
            <thead>
              <tr style={{ position: "sticky", top: 0, zIndex: 10 }}>
                <th
                  style={{
                    padding: "8px 4px", background: "var(--bg-secondary)",
                    borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)",
                    fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textAlign: "center",
                    position: "sticky", left: 0, zIndex: 11,
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
                        padding: "0", background: "var(--bg-secondary)",
                        borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)",
                        fontWeight: 500, color: "var(--text-secondary)", textAlign: "left", position: "relative",
                        overflow: "hidden",
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
                            width: "100%", padding: "8px 10px", border: "none", outline: "none",
                            fontSize: 12, fontWeight: 500, background: "var(--bg)", color: "var(--text)", boxSizing: "border-box",
                          }}
                        />
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 6px 8px 10px", cursor: "default" }}>
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
                              background: "none", border: "none", cursor: "pointer", padding: 2,
                              color: "var(--text-tertiary)", borderRadius: 3, display: "flex", alignItems: "center", flexShrink: 0,
                            }}
                          >
                            <ChevronDown size={12} />
                          </button>
                        </div>
                      )}

                      {colMenuOpen === col.id && (
                        <div
                          style={{
                            position: "absolute", top: "100%", right: 0, background: "var(--bg)",
                            border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                            boxShadow: "var(--shadow-sm)", zIndex: 20, minWidth: 140, padding: 4,
                          }}
                        >
                          <button
                            onClick={() => {
                              setRenamingCol(col.id);
                              setRenameColValue(col.name);
                              setColMenuOpen(null);
                            }}
                            style={{
                              display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 8px",
                              background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--text)", borderRadius: 3, textAlign: "left",
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
                              display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 8px",
                              background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--red)", borderRadius: 3, textAlign: "left",
                            }}
                          >
                            <Trash2 size={12} />
                            Delete Column
                          </button>
                        </div>
                      )}

                      {/* Resize handle */}
                      <div
                        onMouseDown={(e) => handleResizeStart(col.id, e)}
                        style={{
                          position: "absolute", top: 0, right: 0, width: 5, height: "100%",
                          cursor: "col-resize", zIndex: 15,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--blue)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      />
                    </th>
                  );
                })}
                <th
                  ref={addColBtnRef}
                  style={{
                    padding: 0, background: "var(--bg-secondary)",
                    borderBottom: "1px solid var(--border)", textAlign: "center", position: "relative",
                  }}
                >
                  <button
                    onClick={() => setShowAddCol(true)}
                    title="Add column"
                    style={{
                      background: "none", border: "none", cursor: "pointer", padding: "8px",
                      color: "var(--text-tertiary)", display: "flex", alignItems: "center", justifyContent: "center", width: "100%",
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
                  <td
                    style={{
                      padding: "0 4px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)",
                      fontSize: 11, color: "var(--text-tertiary)", textAlign: "center", background: "var(--bg-secondary)",
                      position: "sticky", left: 0, zIndex: 5,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 34 }}>
                      <span className="row-num">{rowIndex + 1}</span>
                      <button
                        className="row-del"
                        onClick={() => handleDeleteRow(row.id)}
                        title="Delete row"
                        style={{ display: "none", background: "none", border: "none", cursor: "pointer", color: "var(--red)", padding: 0, lineHeight: 1 }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>

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
                          borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)",
                          cursor: isEditing ? "text" : "cell", minHeight: 34, verticalAlign: "middle",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
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

                  <td style={{ borderBottom: "1px solid var(--border)" }} />
                </tr>
              ))}

              <tr>
                <td colSpan={columns.length + 2} style={{ padding: 0 }}>
                  <button
                    onClick={handleAddRow}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "8px 12px",
                      background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--text-tertiary)", textAlign: "left",
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

      {/* Row hover styles + tab bar scrollbar */}
      <style>{`
        tr:hover .row-num { display: none !important; }
        tr:hover .row-del { display: block !important; }
        .table-tabs-bar::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Add Column Popover */}
      {showAddCol && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setShowAddCol(false)} />
          <div
            ref={addColPopoverRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: (() => { const rect = addColBtnRef.current?.getBoundingClientRect(); return rect ? rect.bottom + 4 : 0; })(),
              left: (() => { const rect = addColBtnRef.current?.getBoundingClientRect(); return rect ? rect.right - 300 : 0; })(),
              width: 300, background: "var(--bg)", borderRadius: "var(--radius-lg)", padding: 16,
              boxShadow: "0 4px 24px rgba(0,0,0,0.16), 0 0 0 1px var(--border)", zIndex: 100,
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
                  width: "100%", padding: "7px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                  fontSize: 13, outline: "none", background: "var(--bg)", color: "var(--text)", boxSizing: "border-box",
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
                        display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", border: "none",
                        background: selected ? "rgba(59,130,246,0.1)" : "transparent",
                        color: selected ? "var(--blue)" : "var(--text)", borderRadius: "var(--radius-sm)",
                        fontSize: 13, cursor: "pointer", fontWeight: selected ? 500 : 400, width: "100%", textAlign: "left",
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
                    width: "100%", padding: "7px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                    fontSize: 13, outline: "none", background: "var(--bg)", color: "var(--text)", boxSizing: "border-box",
                  }}
                />
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <button
                onClick={() => setShowAddCol(false)}
                style={{ padding: "6px 12px", background: "none", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)" }}
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
                  border: "none", borderRadius: "var(--radius-sm)", fontSize: 12, fontWeight: 500,
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
        <div style={{ position: "fixed", inset: 0, zIndex: 15 }} onClick={() => setColMenuOpen(null)} />
      )}

      {/* Create Table Modal */}
      {showCreateTable && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
          onClick={() => setShowCreateTable(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--bg)", borderRadius: "var(--radius-lg)", padding: 24, width: 400, boxShadow: "var(--shadow-lg, 0 10px 40px rgba(0,0,0,0.15))" }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 16px", color: "var(--text)" }}>
              New Table in {selectedBase?.name}
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
                  width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                  fontSize: 13, outline: "none", background: "var(--bg)", color: "var(--text)", boxSizing: "border-box",
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
                  width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                  fontSize: 13, outline: "none", background: "var(--bg)", color: "var(--text)", boxSizing: "border-box",
                }}
              />
            </div>
            {createError && (
              <div style={{ padding: "8px 12px", marginBottom: 12, background: "var(--red-bg, #fef2f2)", border: "1px solid var(--red-border, #fecaca)", borderRadius: "var(--radius-sm)", color: "var(--red, #dc2626)", fontSize: 12 }}>
                {createError}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setShowCreateTable(false); setCreateError(null); }}
                style={{ padding: "8px 14px", background: "none", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 13, cursor: "pointer", color: "var(--text-secondary)" }}
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
                  border: "none", borderRadius: "var(--radius-sm)", fontSize: 13, fontWeight: 500,
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
