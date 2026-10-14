"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

// Shared spreadsheet-style cells for 2027 Planning (docs/specs/planning-2027.md §9.4, §10.2).

export const CELL = {
  base: "px-2 py-1.5 text-xs max-sm:py-2.5",
  editable:
    "bg-card text-info font-medium tabular-nums cursor-text hover:ring-1 hover:ring-inset hover:ring-border-strong",
  computed: "bg-surface-2 text-foreground tabular-nums cursor-default",
  active: "ring-2 ring-inset ring-signal bg-card",
  error: "ring-2 ring-inset ring-danger bg-danger-soft",
  /** Borderless field inside an editing cell so the cell keeps its size. */
  bareField: "border-0 bg-transparent px-1 shadow-none focus:ring-0 hover:border-0",
  headCell: "sticky top-0 z-20 whitespace-nowrap bg-surface-2 px-2 py-2",
} as const;

/**
 * Grid scroll box: its own vertical scroll so the sticky header sticks (main scrolls too).
 * No scroll-fade-x: it would mask the pinned right columns (§10.3).
 */
export const GRID_WRAPPER =
  "overflow-auto rounded-card border border-border bg-card shadow-card max-h-[calc(100dvh-13rem)]";

/** Blank value: muted dash on caution-soft, with a screen-reader "missing". */
export function MissingValue({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex min-w-5 justify-center rounded-chip bg-caution-soft px-1 text-muted", className)}>
      <span aria-hidden="true">—</span>
      <span className="sr-only">missing</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Grid navigation (roving tabindex)                                   */
/* ------------------------------------------------------------------ */

interface GridState {
  id: string;
  active: string | null;
  setActive: (key: string) => void;
}

const GridContext = createContext<GridState | null>(null);

export function GridProvider({ id, children }: { id: string; children: React.ReactNode }) {
  const [active, setActive] = useState<string | null>(null);
  return <GridContext.Provider value={{ id, active, setActive }}>{children}</GridContext.Provider>;
}

function cellKey(row: number, col: number) {
  return `${row}:${col}`;
}

function findCell(gridId: string, row: number, col: number): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-grid="${gridId}"] [data-cell="${cellKey(row, col)}"]`
  );
}

/** Focuses the nearest editable cell in a direction (skips computed columns). */
export function focusCell(gridId: string, row: number, col: number, dRow: number, dCol: number): boolean {
  for (let step = 1; step <= 40; step++) {
    const el = findCell(gridId, row + dRow * step, col + dCol * step);
    if (el) {
      el.focus();
      return true;
    }
  }
  return false;
}

const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

/* ------------------------------------------------------------------ */
/* Editable cell                                                       */
/* ------------------------------------------------------------------ */

export interface EditorApi<D> {
  draft: D;
  setDraft: (d: D) => void;
  /** Ref for the field that gets focus when editing starts. */
  focusRef: React.RefObject<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>;
  invalid: boolean;
}

export function EditableCell<D>({
  row,
  col,
  className,
  display,
  title,
  ariaLabel,
  startDraft,
  typedDraft,
  renderEditor,
  validate,
  revertOnError,
  onCommit,
  onCancel,
  failed,
  changed,
  fieldKey,
  onValidity,
  autoEdit,
  as: Tag = "td",
  rowSpan,
}: {
  row: number;
  col: number;
  className?: string;
  display: React.ReactNode;
  title?: string;
  ariaLabel: string;
  startDraft: () => D;
  /** Typing a printable key starts editing with this draft (text/number cells). */
  typedDraft?: (ch: string) => D;
  renderEditor: (api: EditorApi<D>) => React.ReactNode;
  /** Returns an error message; the value is not saved. */
  validate?: (draft: D) => string | null;
  /** On a validation error, leave edit mode with the old value (and still show the message). */
  revertOnError?: boolean;
  onCommit: (draft: D) => void;
  /** Called when editing ends without a commit (Esc). */
  onCancel?: () => void;
  failed?: boolean;
  /** Unsaved draft change: accent ring + sr-only "edited". */
  changed?: boolean;
  /** Key for draft validity (an invalid open edit blocks Save) and "Fix n fields" focus. */
  fieldKey?: string;
  onValidity?: (key: string, invalid: boolean) => void;
  autoEdit?: boolean;
  as?: "td" | "div";
  rowSpan?: number;
}) {
  const grid = useContext(GridContext);
  const key = cellKey(row, col);
  const [editing, setEditing] = useState(Boolean(autoEdit));
  const [draft, setDraft] = useState<D>(() => startDraft());
  const [error, setError] = useState<string | null>(null);

  // An open edit with a validation error counts as an invalid field for the draft Save.
  const invalidNow = Boolean(error) && editing;
  useEffect(() => {
    if (fieldKey && onValidity) onValidity(fieldKey, invalidNow);
  }, [fieldKey, onValidity, invalidNow]);
  useEffect(
    () => () => {
      if (fieldKey && onValidity) onValidity(fieldKey, false);
    },
    [fieldKey, onValidity]
  );
  const cellRef = useRef<HTMLTableCellElement & HTMLDivElement>(null);
  const focusRef = useRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editing) {
      const el = focusRef.current;
      el?.focus();
      if (el && "select" in el && typeof el.select === "function" && el.tagName === "INPUT") {
        (el as HTMLInputElement).select();
      }
    }
  }, [editing]);

  // Clear a reverted-edit message after a moment.
  useEffect(() => {
    if (!error || editing) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error, editing]);

  function begin(initial?: D) {
    setDraft(initial ?? startDraft());
    setError(null);
    setEditing(true);
  }

  function finish(refocus: boolean) {
    setEditing(false);
    if (refocus) requestAnimationFrame(() => cellRef.current?.focus());
  }

  function commit(move: "down" | "right" | "left" | null): boolean {
    const message = validate?.(draft) ?? null;
    if (message) {
      setError(message);
      if (revertOnError) finish(move !== null);
      return false;
    }
    setError(null);
    onCommit(draft);
    finish(move === null ? false : true);
    if (move && grid) {
      const [dr, dc] = move === "down" ? [1, 0] : move === "right" ? [0, 1] : [0, -1];
      requestAnimationFrame(() => focusCell(grid.id, row, col, dr, dc));
    }
    return true;
  }

  function cancel() {
    setError(null);
    setEditing(false);
    onCancel?.();
    requestAnimationFrame(() => cellRef.current?.focus());
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (editing) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      } else if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement && e.shiftKey)) {
        e.preventDefault();
        commit("down");
      } else if (e.key === "Tab") {
        const fields = Array.from(
          cellRef.current?.querySelectorAll<HTMLElement>("input, select, textarea") ?? []
        );
        const at = fields.indexOf(e.target as HTMLElement);
        const leaving = e.shiftKey ? at <= 0 : at === fields.length - 1;
        if (leaving) {
          e.preventDefault();
          commit(e.shiftKey ? "left" : "right");
        }
      }
      return;
    }
    if (e.target !== cellRef.current) return;
    if (ARROWS[e.key] && grid) {
      e.preventDefault();
      const [dr, dc] = ARROWS[e.key];
      focusCell(grid.id, row, col, dr, dc);
    } else if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      begin();
    } else if (typedDraft && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      begin(typedDraft(e.key));
    }
  }

  function onBlur(e: React.FocusEvent) {
    if (!editing) return;
    const next = e.relatedTarget as Node | null;
    if (next && cellRef.current?.contains(next)) return;
    commit(null);
  }

  const tabbable = grid ? grid.active === key || (grid.active === null && row === 0 && col === 0) : true;

  return (
    <Tag
      ref={cellRef}
      rowSpan={rowSpan}
      data-cell={key}
      data-field-key={fieldKey}
      tabIndex={editing ? -1 : tabbable ? 0 : -1}
      aria-label={editing ? undefined : ariaLabel}
      title={title}
      onFocus={() => grid?.setActive(key)}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      onClick={() => {
        if (!editing) begin();
      }}
      className={cn(
        CELL.base,
        "relative outline-none",
        editing ? CELL.active : failed || error ? CELL.error : CELL.editable,
        changed && !editing && !failed && !error && "ring-1 ring-inset ring-accent",
        "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal",
        className
      )}
    >
      {editing ? renderEditor({ draft, setDraft, focusRef, invalid: Boolean(error) }) : display}
      {changed && !editing && <span className="sr-only">, edited</span>}
      {error && (
        <p role="alert" className="mt-0.5 whitespace-normal text-[11px] font-medium leading-4 text-danger">
          {error}
        </p>
      )}
    </Tag>
  );
}
