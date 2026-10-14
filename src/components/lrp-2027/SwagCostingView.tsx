"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { AlertTriangle, ChevronDown, MoreHorizontal, Plus, Table2 } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  Skeleton,
  Tabs,
  Textarea,
  tableClasses,
} from "@/components/ui";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { cn } from "@/lib/cn";
import { useDashboard } from "@/lib/use-dashboard";
import { saveSwagDraft } from "@/lib/api-client";
import {
  SWAG_FUNCTIONS,
  SWAG_FUNCTION_LABELS,
  SWAG_TAB_LABELS,
  emptyCosts,
  formatNumber,
  formatPercent,
  isRowIncomplete,
  missingCellsLabel,
  parseEoPercent,
  parseNonNegative,
  rowsForTab,
  swagRoi,
  swagTotal,
} from "@/lib/lrp-2027";
import {
  applySwagRowPatch,
  initSwagDraft,
  sameSwagRows,
  swagChanges,
  swagDraftReducer,
  swagSavePayload,
  type SwagDraftAction,
  type SwagDraftState,
  type SwagEdit,
  type SwagRowPatch,
} from "@/lib/swag-draft";
import type { SwagCostingRow, SwagFunction, SwagTab } from "@/lib/types";
import { CELL, EditableCell, GRID_WRAPPER, GridProvider, MissingValue } from "./grid";
import { useDraftSession, type Validity } from "./draft-ui";
import { FunctionCostDisplay, OnePagerDisplay, SizeDatalist, SIZE_LIST_ID } from "./swag-cells";
import { SwagRowDialog } from "./SwagRowDialog";

// 2027 Planning > Swag Costing (docs/specs/planning-2027.md §5, §9.3–§9.7, §10.5–§10.7).
// Same draft model as Capacity Plan: every edit (cells, add, delete, move between tabs) changes a
// local draft of both tabs with Undo/Redo; nothing is stored until Save (one bulk request).
// Owner is hidden in the UI (user request); the field stays in the data and is kept on save.

const OTHER_TAB: Record<SwagTab, SwagTab> = { lrp: "adhoc", adhoc: "lrp" };
const NOTICE_MS = 8000;
const HIGHLIGHT_MS = 2000;

/** Column widths (rem) — fixed so the sticky left/right offsets stay stable. */
const COLS = {
  feature: "w-60 min-w-60",
  onePager: "w-48 min-w-48",
  eo: "w-16 min-w-16",
  fn: "w-24 min-w-24",
  priority: "w-20 min-w-20",
  total: "w-20 min-w-20",
  roi: "w-20 min-w-20",
  menu: "w-10 min-w-10",
};
const PIN = {
  feature: "sticky left-0 z-10 shadow-[1px_0_0_var(--border-strong)]",
  total: "sticky right-[7.5rem] z-10 shadow-[-1px_0_0_var(--border-strong)]",
  roi: "sticky right-10 z-10",
  menu: "sticky right-0 z-10",
};
const COLUMN_COUNT = 12;
const TABLE_WIDTH = "min-w-[84.5rem]";

interface MoveNotice {
  id: string;
  name: string;
  to: SwagTab;
}

function isPhone(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;
}

function displayName(row: Pick<SwagCostingRow, "featureName">): string {
  return row.featureName.trim() || "Untitled";
}

function draftReducer(state: SwagDraftState | null, action: SwagDraftAction): SwagDraftState | null {
  if (action.type === "reset") return initSwagDraft(action.value);
  return state ? swagDraftReducer(state, action) : state;
}

function newRow(tab: SwagTab, featureName: string): SwagCostingRow {
  const now = new Date().toISOString();
  return { id: uuidv4(), tab, order: 0, featureName, costs: emptyCosts(), createdAt: now, updatedAt: now };
}

export function SwagCostingView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab: SwagTab = searchParams.get("tab") === "adhoc" ? "adhoc" : "lrp";
  const { store, loading, error, reload } = useDashboard();
  const [state, dispatch] = useReducer(draftReducer, null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [pendingNew, setPendingNew] = useState<SwagTab | null>(null);
  const [notice, setNotice] = useState<MoveNotice | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SwagCostingRow | null>(null);
  const [dialog, setDialog] = useState<{ row?: SwagCostingRow } | null>(null);

  const changes = state ? swagChanges(state.saved, state.draft) : null;

  const session = useDraftSession({
    changeCount: changes?.count ?? 0,
    canUndo: Boolean(state && state.past.length > 0),
    canRedo: Boolean(state && state.future.length > 0),
    undo: () => {
      setNotice(null);
      dispatch({ type: "undo" });
    },
    redo: () => {
      setNotice(null);
      dispatch({ type: "redo" });
    },
    discard: () => {
      setNotice(null);
      const s = stateRef.current;
      if (s) dispatch({ type: "reset", value: s.saved });
    },
    persist: async () => {
      const s = stateRef.current;
      const payload = s && swagSavePayload(s.saved, s.draft);
      if (!payload) return;
      const rows = await saveSwagDraft(payload);
      dispatch({ type: "reset", value: rows });
    },
    reloadFromServer: () => {
      if (store) dispatch({ type: "reset", value: store.swagCosting ?? [] });
    },
    noun: "Swag Costing",
  });
  const { setExternalChange } = session;

  // Take server data; keep a dirty draft and say it changed elsewhere instead.
  useEffect(() => {
    if (!store) return;
    const rows = store.swagCosting ?? [];
    const s = stateRef.current;
    if (!s) {
      dispatch({ type: "reset", value: rows });
      return;
    }
    if (sameSwagRows(rows, s.saved)) return;
    if (swagChanges(s.saved, s.draft).count > 0) setExternalChange(true);
    else dispatch({ type: "reset", value: rows });
  }, [store, setExternalChange]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  // View: wait until the row is rendered in the new tab, scroll to it, then fade the highlight.
  useEffect(() => {
    if (!highlight) return;
    const el = Array.from(document.querySelectorAll<HTMLElement>(`[data-row-id="${highlight}"]`)).find(
      (node) => node.offsetParent !== null
    );
    if (!el) return;
    el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    const t = setTimeout(() => setHighlight(null), HIGHLIGHT_MS);
    return () => clearTimeout(t);
  }, [highlight, tab, state]);

  const setTab = useCallback(
    (next: SwagTab) => router.replace(`/lrp-2027/swag-costing?tab=${next}`, { scroll: false }),
    [router]
  );

  if (loading || (store && !state)) return <SwagSkeleton />;

  if (!store || !state) {
    return (
      <Alert
        tone="danger"
        role="alert"
        action={
          <Button variant="ghost" size="sm" className="-my-1 h-7 text-current" onClick={() => void reload()}>
            Retry
          </Button>
        }
      >
        Couldn&apos;t load Swag Costing.{error ? ` ${error}` : ""}
      </Alert>
    );
  }

  const rows = state.draft;
  const changed = changes!.cells;
  const tabRows = rowsForTab(rows, tab);
  const counts = { lrp: rowsForTab(rows, "lrp"), adhoc: rowsForTab(rows, "adhoc") };
  const incomplete = (list: SwagCostingRow[]) => list.filter(isRowIncomplete).length;
  const totalDays = tabRows.reduce((sum, r) => sum + (swagTotal(r) ?? 0), 0);
  const showNew = pendingNew === tab;

  /* ---------------- draft edits ---------------- */

  function edit(e: SwagEdit, keepNotice = false) {
    session.clearSaveError();
    if (!keepNotice) setNotice(null);
    dispatch({ type: "edit", edit: e });
  }

  function addRow() {
    setNotice(null);
    if (isPhone()) {
      setDialog({});
      return;
    }
    if (showNew) {
      requestAnimationFrame(() => {
        const field = document.querySelector<HTMLElement>('[data-row-id="draft"] input');
        if (field) field.focus();
        else document.querySelector<HTMLElement>('[data-row-id="draft"] [data-cell]')?.click();
      });
      return;
    }
    setPendingNew(tab);
  }

  function commitNew(featureName: string) {
    setPendingNew(null);
    if (featureName.trim()) edit({ kind: "add", row: newRow(tab, featureName) });
  }

  function moveToOtherTab(row: SwagCostingRow) {
    const to = OTHER_TAB[row.tab];
    edit({ kind: "move", id: row.id, tab: to }, true);
    setNotice({ id: row.id, name: displayName(row), to });
  }

  function deleteRow(row: SwagCostingRow) {
    const list = rowsForTab(rows, row.tab);
    const at = list.findIndex((r) => r.id === row.id);
    setConfirmDelete(null);
    edit({ kind: "delete", id: row.id });
    const remaining = list.length - 1;
    if (remaining <= 0) return;
    const focusIndex = Math.min(at, remaining - 1);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(`[data-grid="swag-${row.tab}"] [data-cell="${focusIndex}:0"]`)
        ?.focus()
    );
  }

  function submitDialog(row: SwagCostingRow | undefined, patch: SwagRowPatch & { featureName: string }) {
    if (row) edit({ kind: "patch", id: row.id, patch });
    else edit({ kind: "add", row: applySwagRowPatch(newRow(tab, patch.featureName), patch) });
    return Promise.resolve(true);
  }

  function rowMenuItems(row: SwagCostingRow, withEdit: boolean): MenuItem[] {
    const other = OTHER_TAB[row.tab];
    return [
      ...(withEdit ? [{ id: "edit", label: "Edit row", onSelect: () => setDialog({ row }) }] : []),
      { id: "move", label: `Move to ${SWAG_TAB_LABELS[other]}`, onSelect: () => moveToOtherTab(row) },
      { id: "delete", label: "Delete row", destructive: true, onSelect: () => setConfirmDelete(row) },
    ];
  }

  /* ---------------- render ---------------- */

  const empty = tabRows.length === 0 && !showNew;
  const addButton = (
    <Button size="sm" onMouseDown={(e) => e.preventDefault()} onClick={addRow}>
      <Plus aria-hidden="true" />
      Add row
    </Button>
  );

  return (
    <div className={cn(session.dirty && "max-sm:pb-20")}>
      <SizeDatalist />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <PageHeader title="Swag Costing" module="lrp2027" />
          <p className="-mt-4 text-xs text-muted">
            <span className="font-semibold text-foreground">{tabRows.length}</span> features ·{" "}
            <span className="font-semibold text-caution">{incomplete(tabRows)}</span> incomplete ·{" "}
            <span className="font-semibold text-foreground">{formatNumber(totalDays)}</span> total days
          </p>
        </div>
        {session.headerActions(addButton)}
      </div>

      <div className="mb-3 space-y-2 empty:hidden">{session.alerts}</div>

      {notice && (
        <Alert
          tone="info"
          role="status"
          className="mb-3"
          onDismiss={() => setNotice(null)}
          action={
            <div className="-my-1 flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-current"
                onClick={() => {
                  setNotice(null);
                  dispatch({ type: "undo" });
                }}
              >
                Undo
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-current"
                onClick={() => {
                  const n = notice;
                  setNotice(null);
                  setTab(n.to);
                  setHighlight(n.id);
                }}
              >
                View
              </Button>
            </div>
          }
        >
          Moved {notice.name} to {SWAG_TAB_LABELS[notice.to]}. Not saved yet.
        </Alert>
      )}

      <div className="max-sm:sticky max-sm:top-0 max-sm:z-20 max-sm:-mx-4 max-sm:bg-background max-sm:px-4">
        <Tabs
          variant="sheet"
          aria-label="Swag Costing tabs"
          value={tab}
          onChange={(next) => {
            setNotice(null);
            setTab(next);
          }}
          items={(["lrp", "adhoc"] as const).map((id) => ({
            id,
            label: SWAG_TAB_LABELS[id],
            count: counts[id].length,
            marker: incomplete(counts[id]),
            controls: "swag-panel",
          }))}
        />
      </div>

      <div id="swag-panel" role="tabpanel" aria-label={`${SWAG_TAB_LABELS[tab]} features`}>
        {empty ? (
          <Card className="rounded-t-none border-t-0">
            <EmptyState
              icon={Table2}
              title={tab === "adhoc" ? "No adhoc features yet" : "No LRP features"}
              description={tab === "adhoc" ? "Or move a row here from LRP using ⋯." : undefined}
              action={addButton}
            />
          </Card>
        ) : (
          <>
            {/* Desktop / tablet grid */}
            <GridProvider id={`swag-${tab}`}>
              <div data-grid={`swag-${tab}`} className={cn(GRID_WRAPPER, "rounded-t-none border-t-0 max-sm:hidden")}>
                <table className={cn("w-full table-fixed border-separate border-spacing-0 text-xs", TABLE_WIDTH)}>
                  <SwagHead />
                  <tbody>
                    {tabRows.map((row, index) => (
                      <SwagGridRow
                        key={row.id}
                        row={row}
                        index={index}
                        changed={changed}
                        highlighted={highlight === row.id}
                        menuItems={rowMenuItems(row, false)}
                        onValidity={session.onValidity}
                        onPatch={(patch) => edit({ kind: "patch", id: row.id, patch })}
                      />
                    ))}
                    {showNew && (
                      <NewRow index={tabRows.length} onCommit={commitNew} onCancel={() => setPendingNew(null)} />
                    )}
                    <tr>
                      <td colSpan={COLUMN_COUNT} className="border-t border-border p-0">
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={addRow}
                          className="flex h-9 w-full items-center gap-1.5 px-3 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal"
                        >
                          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                          Add row
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </GridProvider>

            {/* Phone cards */}
            <div className="space-y-2 pt-2 sm:hidden">
              {tabRows.map((row) => (
                <SwagCard
                  key={row.id}
                  row={row}
                  edited={Array.from(changed).some((k) => k.startsWith(`${row.id}:`))}
                  highlighted={highlight === row.id}
                  menuItems={rowMenuItems(row, true)}
                  onEdit={() => setDialog({ row })}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {confirmDelete && (
        <DeleteRowModal
          row={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => deleteRow(confirmDelete)}
        />
      )}

      {dialog && (
        <SwagRowDialog
          row={dialog.row}
          tab={tab}
          onClose={() => setDialog(null)}
          onSubmit={(patch) => submitDialog(dialog.row, patch)}
        />
      )}

      {session.mobileBar}
      {session.modals}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Grid                                                                */
/* ------------------------------------------------------------------ */

function SwagHead() {
  const head = cn(CELL.headCell, tableClasses.headRow);
  return (
    <thead>
      <tr>
        <th scope="col" className={cn(head, COLS.feature, PIN.feature, "z-30")}>
          Feature Name
        </th>
        <th scope="col" className={cn(head, COLS.onePager)}>
          1-pager
        </th>
        <th scope="col" className={cn(head, COLS.eo, "text-right")}>
          EO
        </th>
        {SWAG_FUNCTIONS.map((fn) => (
          <th key={fn} scope="col" title={SWAG_FUNCTION_LABELS[fn].full} className={cn(head, COLS.fn)}>
            <abbr title={SWAG_FUNCTION_LABELS[fn].full} className="no-underline">
              {SWAG_FUNCTION_LABELS[fn].short}
            </abbr>
          </th>
        ))}
        <th scope="col" title="Priority" className={cn(head, COLS.priority)}>
          <abbr title="Priority" className="no-underline">
            Pri
          </abbr>
        </th>
        <th scope="col" title="Total costing" className={cn(head, COLS.total, PIN.total, "z-30 text-right")}>
          Total
        </th>
        <th scope="col" title="ROI (LTV/costing)" className={cn(head, COLS.roi, PIN.roi, "z-30 text-right")}>
          ROI
        </th>
        <th scope="col" className={cn(head, COLS.menu, PIN.menu, "z-30")}>
          <span className="sr-only">Row actions</span>
        </th>
      </tr>
    </thead>
  );
}

const textEditorClass = cn(CELL.bareField, "h-6 text-xs font-medium text-info");

function SwagGridRow({
  row,
  index,
  changed,
  highlighted,
  menuItems,
  onValidity,
  onPatch,
}: {
  row: SwagCostingRow;
  index: number;
  /** "<rowId>:<field>" keys with unsaved draft changes. */
  changed: Set<string>;
  highlighted: boolean;
  menuItems: MenuItem[];
  onValidity: Validity;
  onPatch: (patch: SwagRowPatch) => void;
}) {
  const name = displayName(row);
  const incomplete = isRowIncomplete(row);
  const missingLabel = missingCellsLabel(row);
  const total = swagTotal(row);
  const roi = swagRoi(row);
  const missingId = `swag-missing-${row.id}`;
  const cellProps = (field: string) => ({
    changed: changed.has(`${row.id}:${field}`),
    fieldKey: `${row.id}:${field}`,
    onValidity,
  });
  const rowBorder = "border-t border-border";
  const pinnedBg = highlighted ? "bg-accent-soft transition-colors" : "";


  return (
    <tr
      data-row-id={row.id}
      className={cn("group align-top", highlighted && tableClasses.selectedRow)}
      onKeyDown={(e) => {
        if (e.shiftKey && e.key === "F10") {
          e.preventDefault();
          e.currentTarget.querySelector<HTMLButtonElement>("[data-row-menu] button")?.click();
        }
      }}
    >
      {/* Feature (pinned) */}
      <EditableCell<string>
        row={index}
        col={0}
        ariaLabel={`Feature name: ${name}${incomplete ? `. Incomplete. ${missingLabel}` : ""}`}
        className={cn(
          rowBorder,
          COLS.feature,
          PIN.feature,
          incomplete && "shadow-[inset_3px_0_0_var(--caution-mark),1px_0_0_var(--border-strong)]",
          pinnedBg
        )}
        {...cellProps("featureName")}
        revertOnError
        display={
          <span className="flex min-w-0 items-center gap-1.5">
            <span title={row.featureName} className="min-w-0 truncate text-xs font-medium text-foreground">
              {name}
            </span>
            {incomplete && (
              <>
                <Badge tone="caution" title={missingLabel} className="shrink-0">
                  <AlertTriangle aria-hidden="true" className="h-3 w-3" />
                  <span aria-describedby={missingId}>Incomplete</span>
                </Badge>
                <span id={missingId} className="sr-only">
                  {missingLabel}
                </span>
              </>
            )}
          </span>
        }
        startDraft={() => row.featureName}
        typedDraft={(ch) => ch}
        validate={(d) => (d.trim() ? null : "Feature name can't be empty.")}
        onCommit={(d) => {
          if (d !== row.featureName) onPatch({ featureName: d });
        }}
        renderEditor={({ draft, setDraft, focusRef, invalid }) => (
          <Input
            ref={focusRef as React.Ref<HTMLInputElement>}
            size="sm"
            aria-label="Feature name"
            aria-invalid={invalid || undefined}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className={textEditorClass}
          />
        )}
      />

      {/* 1-pager */}
      <EditableCell<string>
        row={index}
        col={1}
        ariaLabel={`1-pager, ${name}`}
        className={cn(rowBorder, COLS.onePager, "font-normal", pinnedBg)}
        {...cellProps("onePager")}
        display={<OnePagerDisplay key={row.onePager} value={row.onePager} />}
        startDraft={() => row.onePager ?? ""}
        onCommit={(d) => {
          if (d !== (row.onePager ?? "")) onPatch({ onePager: d.trim() ? d : null });
        }}
        renderEditor={({ draft, setDraft, focusRef }) => (
          <Textarea
            ref={focusRef as React.Ref<HTMLTextAreaElement>}
            aria-label={`1-pager, ${name}`}
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className={cn(CELL.bareField, "min-h-0 resize-none py-0.5 text-xs text-info")}
          />
        )}
      />

      {/* EO */}
      <EditableCell<string>
        row={index}
        col={2}
        ariaLabel={`EO, ${name}: ${row.eoPercent == null ? "missing" : `${row.eoPercent}%`}`}
        className={cn(rowBorder, COLS.eo, "text-right", pinnedBg)}
        {...cellProps("eoPercent")}
        display={row.eoPercent == null ? <MissingValue /> : formatPercent(row.eoPercent)}
        startDraft={() => (row.eoPercent == null ? "" : String(row.eoPercent))}
        typedDraft={(ch) => ch}
        validate={(d) => {
          const p = parseEoPercent(d);
          return p.ok ? null : p.error;
        }}
        onCommit={(d) => {
          const p = parseEoPercent(d);
          if (p.ok && p.value !== row.eoPercent) onPatch({ eoPercent: p.value ?? null });
        }}
        renderEditor={({ draft, setDraft, focusRef, invalid }) => (
          <Input
            ref={focusRef as React.Ref<HTMLInputElement>}
            size="sm"
            inputMode="decimal"
            aria-label={`EO %, ${name}`}
            aria-invalid={invalid || undefined}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className={cn(textEditorClass, "text-right")}
          />
        )}
      />

      {/* Function cells */}
      {SWAG_FUNCTIONS.map((fn, i) => (
        <FunctionCell
          key={fn}
          fn={fn}
          row={row}
          index={index}
          col={3 + i}
          changed={changed.has(`${row.id}:cost-${fn}`)}
          onValidity={onValidity}
          highlightClass={pinnedBg}
          onPatch={onPatch}
        />
      ))}

      {/* Priority */}
      <EditableCell<string>
        row={index}
        col={9}
        ariaLabel={`Priority, ${name}: ${row.priority ?? "blank"}`}
        className={cn(rowBorder, COLS.priority, "truncate", pinnedBg)}
        {...cellProps("priority")}
        title={row.priority}
        display={row.priority ?? <span className="text-muted">—</span>}
        startDraft={() => row.priority ?? ""}
        typedDraft={(ch) => ch}
        onCommit={(d) => {
          if (d !== (row.priority ?? "")) onPatch({ priority: d.trim() ? d : null });
        }}
        renderEditor={({ draft, setDraft, focusRef }) => (
          <Input
            ref={focusRef as React.Ref<HTMLInputElement>}
            size="sm"
            aria-label={`Priority, ${name}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className={textEditorClass}
          />
        )}
      />

      {/* Total / ROI / menu (pinned right) */}
      <td className={cn(CELL.base, CELL.computed, rowBorder, COLS.total, PIN.total, "text-right", pinnedBg)}>
        {total == null ? <MissingValue /> : formatNumber(total)}
        {incomplete && total != null && <span className="block text-[10px] text-caution">partial</span>}
      </td>
      <td className={cn(CELL.base, CELL.computed, rowBorder, COLS.roi, PIN.roi, "text-right", pinnedBg)}>
        {roi == null ? <span className="text-muted">—</span> : formatPercent(roi)}
      </td>
      <td className={cn(CELL.base, rowBorder, COLS.menu, PIN.menu, "bg-card px-1", pinnedBg)}>
        <span data-row-menu>
          <Menu
            label={`Row actions for ${name}`}
            icon={MoreHorizontal}
            items={menuItems}
            triggerClassName="h-7 w-7"
          />
        </span>
      </td>
    </tr>
  );
}

function FunctionCell({
  fn,
  row,
  index,
  col,
  changed,
  highlightClass,
  onValidity,
  onPatch,
}: {
  fn: SwagFunction;
  row: SwagCostingRow;
  index: number;
  col: number;
  changed: boolean;
  highlightClass?: string;
  onValidity: Validity;
  onPatch: (patch: SwagRowPatch) => void;
}) {
  const cost = row.costs[fn] ?? {};
  const label = SWAG_FUNCTION_LABELS[fn];
  const name = displayName(row);
  return (
    <EditableCell<{ size: string; days: string }>
      row={index}
      col={col}
      ariaLabel={`${label.full}, ${name}: size ${cost.size ?? "missing"}, days ${cost.days ?? "missing"}`}
      className={cn("border-t border-border", COLS.fn, "whitespace-nowrap", highlightClass)}
      changed={changed}
      fieldKey={`${row.id}:cost-${fn}`}
      onValidity={onValidity}
      display={<FunctionCostDisplay cost={cost} />}
      startDraft={() => ({ size: cost.size ?? "", days: cost.days == null ? "" : String(cost.days) })}
      validate={(d) => {
        const p = parseNonNegative(d.days);
        return p.ok ? null : p.error;
      }}
      onCommit={(d) => {
        const days = parseNonNegative(d.days);
        if (!days.ok) return;
        const size = d.size.trim();
        const patch: { size?: string | null; days?: number | null } = {};
        if (size !== (cost.size ?? "")) patch.size = size || null;
        if (days.value !== cost.days) patch.days = days.value ?? null;
        if (Object.keys(patch).length > 0) {
          onPatch({ costs: { [fn]: patch } });
        }
      }}
      renderEditor={({ draft, setDraft, focusRef, invalid }) => (
        <span className="absolute inset-y-0 left-0 z-20 flex w-[10.5rem] items-center gap-1 bg-card px-1 shadow-raised ring-2 ring-inset ring-signal">
          <Input
            ref={focusRef as React.Ref<HTMLInputElement>}
            size="sm"
            list={SIZE_LIST_ID}
            placeholder="Size"
            aria-label={`${label.short} size, ${name}`}
            value={draft.size}
            onChange={(e) => setDraft({ ...draft, size: e.target.value })}
            className={cn(CELL.bareField, "h-6 w-[5.5rem] min-w-0 shrink-0 rounded-chip bg-surface-2 text-xs")}
          />
          <Input
            size="sm"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            aria-label={`${label.short} days, ${name}`}
            aria-invalid={invalid || undefined}
            placeholder="Days"
            value={draft.days}
            onChange={(e) => setDraft({ ...draft, days: e.target.value })}
            className={cn(CELL.bareField, "h-6 w-14 min-w-0 shrink-0 rounded-chip bg-surface-2 text-right text-xs text-info")}
          />
        </span>
      )}
    />
  );
}

/** New row: only Feature Name is editable; it joins the draft once it has text (Esc / blank removes it). */
function NewRow({
  index,
  onCommit,
  onCancel,
}: {
  index: number;
  onCommit: (featureName: string) => void;
  onCancel: () => void;
}) {
  return (
    <tr data-row-id="draft">
      <EditableCell<string>
        row={index}
        col={0}
        autoEdit
        ariaLabel="New feature name"
        className={cn("border-t border-border", COLS.feature, PIN.feature)}
        display={<span className="text-muted">New feature</span>}
        startDraft={() => ""}
        onCommit={onCommit}
        onCancel={onCancel}
        renderEditor={({ draft, setDraft, focusRef }) => (
          <Input
            ref={focusRef as React.Ref<HTMLInputElement>}
            size="sm"
            aria-label="New feature name"
            placeholder="Feature name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className={textEditorClass}
          />
        )}
      />
      {Array.from({ length: 9 }, (_, i) => (
        <td key={i} className={cn(CELL.base, "border-t border-border bg-card")} />
      ))}
      <td className={cn(CELL.base, CELL.computed, "border-t border-border", PIN.total)} />
      <td className={cn(CELL.base, CELL.computed, "border-t border-border", PIN.roi)} />
      <td className={cn(CELL.base, "border-t border-border bg-card", PIN.menu)} />
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/* Phone cards                                                         */
/* ------------------------------------------------------------------ */

function SwagCard({
  row,
  edited,
  highlighted,
  menuItems,
  onEdit,
}: {
  row: SwagCostingRow;
  /** Has unsaved draft changes. */
  edited: boolean;
  highlighted: boolean;
  menuItems: MenuItem[];
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const incomplete = isRowIncomplete(row);
  const missingLabel = missingCellsLabel(row);
  const total = swagTotal(row);
  const name = displayName(row);
  const detailsId = `swag-card-${row.id}`;

  return (
    <Card
      data-row-id={row.id}
      className={cn(
        "p-3 sm:p-3",
        incomplete && "shadow-[inset_3px_0_0_var(--caution-mark)]",
        edited && "ring-1 ring-inset ring-accent",
        highlighted && tableClasses.selectedRow
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-start gap-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          <ChevronDown
            aria-hidden="true"
            className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")}
          />
          <span className="line-clamp-2 text-sm font-semibold text-foreground">{name}</span>
          {edited && <span className="sr-only">, edited</span>}
        </button>
        {incomplete && (
          <Badge tone="caution" title={missingLabel} className="shrink-0">
            <AlertTriangle aria-hidden="true" className="h-3 w-3" />
            Incomplete
            <span className="sr-only">. {missingLabel}</span>
          </Badge>
        )}
        <Menu label={`Row actions for ${name}`} icon={MoreHorizontal} items={menuItems} triggerClassName="h-7 w-7" />
      </div>
      <p className="mt-1 text-xs text-muted">
        EO{" "}
        <span className="tabular-nums text-foreground">{formatPercent(row.eoPercent)}</span>{" "}
        · Total{" "}
        <span className="tabular-nums text-foreground">{total == null ? "—" : formatNumber(total)}</span>
        {incomplete && total != null && <span className="text-caution"> (partial)</span>} · ROI{" "}
        <span className="tabular-nums text-foreground">{formatPercent(swagRoi(row))}</span>
      </p>
      {open && (
        <div id={detailsId} className="mt-3 space-y-3">
          <div className="grid grid-cols-3 gap-1.5">
            {SWAG_FUNCTIONS.map((fn) => (
              <div key={fn} className="rounded-chip bg-surface-2 p-1.5">
                <p className="text-[10px] uppercase text-muted">{SWAG_FUNCTION_LABELS[fn].short}</p>
                <FunctionCostDisplay cost={row.costs[fn]} />
              </div>
            ))}
          </div>
          <div className="text-xs">
            <p className="text-[10px] uppercase text-muted">1-pager</p>
            <OnePagerDisplay value={row.onePager} />
          </div>
          <p className="text-xs text-muted">
            Priority: <span className="text-foreground">{row.priority ?? "—"}</span>
          </p>
          <Button variant="secondary" size="sm" onClick={onEdit}>
            Edit
          </Button>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Delete confirm + skeleton                                           */
/* ------------------------------------------------------------------ */

function DeleteRowModal({
  row,
  onCancel,
  onConfirm,
}: {
  row: SwagCostingRow;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <Modal
      onClose={onCancel}
      title={`Delete ${displayName(row)}?`}
      footer={
        <>
          <Button variant="secondary" autoFocus onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Delete
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">You can undo this until you save.</p>
    </Modal>
  );
}

function SwagSkeleton() {
  return (
    <div role="status">
      <span className="sr-only">Loading Swag Costing...</span>
      <Skeleton className="mb-2 h-8 w-48" />
      <Skeleton className="mb-6 h-4 w-64" />
      <div className="flex gap-0.5 border-b border-border">
        <Skeleton className="h-9 w-24 rounded-b-none" />
        <Skeleton className="h-9 w-24 rounded-b-none" />
      </div>
      <div className={cn(GRID_WRAPPER, "rounded-t-none border-t-0")}>
        <table className={cn("w-full table-fixed border-separate border-spacing-0", TABLE_WIDTH)}>
          <tbody>
            {Array.from({ length: 8 }, (_, i) => (
              <tr key={i}>
                {[COLS.feature, COLS.onePager, COLS.eo, ...SWAG_FUNCTIONS.map(() => COLS.fn), COLS.priority, COLS.total, COLS.roi, COLS.menu].map(
                  (w, j) => (
                    <td key={j} className={cn(CELL.base, w, "border-t border-border")}>
                      <Skeleton className="h-4 w-full" />
                    </td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
