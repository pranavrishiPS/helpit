"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, MoreHorizontal, Redo2, Save, Undo2 } from "lucide-react";
import { Alert, Button, Modal } from "@/components/ui";
import { Menu } from "@/components/ui/Menu";
import { notifyStoreUpdated } from "@/lib/store-events";

// Shared draft session for 2027 Planning screens (docs/specs/planning-2027.md §9.2 "Editing
// model", §10.4 "Header + draft bar"): status, Undo/Redo, Discard, Save, shortcuts, leave guard.

const SAVED_MS = 2000;

export type Validity = (key: string, invalid: boolean) => void;

export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export interface DraftSessionOptions {
  changeCount: number;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  /** Throw away the draft (back to the last saved version). */
  discard: () => void;
  /** Sends the draft (one request) and resets it to the server result. Throws on failure. */
  persist: () => Promise<void>;
  /** Back to the latest server data after "changed elsewhere" → Reload. */
  reloadFromServer: () => void;
  /** e.g. "Plan" / "Swag Costing" for "<noun> changed elsewhere." */
  noun: string;
}

export function useDraftSession(options: DraftSessionOptions) {
  const router = useRouter();
  const opts = useRef(options);
  opts.current = options;

  const [invalid, setInvalid] = useState<Record<string, true>>({});
  const invalidRef = useRef(invalid);
  invalidRef.current = invalid;
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [fixMessage, setFixMessage] = useState<string | null>(null);
  const [externalChange, setExternalChange] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const dirty = options.changeCount > 0;
  const invalidCount = Object.keys(invalid).length;

  const onValidity = useCallback<Validity>((key, isInvalid) => {
    setInvalid((current) => {
      if (Boolean(current[key]) === isInvalid) return current;
      const next = { ...current };
      if (isInvalid) next[key] = true;
      else delete next[key];
      return next;
    });
  }, []);

  useEffect(() => {
    if (invalidCount === 0) setFixMessage(null);
  }, [invalidCount]);

  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), SAVED_MS);
    return () => clearTimeout(t);
  }, [justSaved]);

  const save = useCallback(async (): Promise<boolean> => {
    const keys = Object.keys(invalidRef.current);
    if (keys.length > 0) {
      setFixMessage(`Fix ${keys.length} field${keys.length === 1 ? "" : "s"}`);
      const el = document.querySelector<HTMLElement>(`[data-field-key="${keys[0]}"]`);
      (el?.matches("input, select, textarea") ? el : el?.querySelector<HTMLElement>("input, select, textarea") ?? el)?.focus();
      return false;
    }
    if (opts.current.changeCount === 0) return true;
    setSaving(true);
    setSaveError(false);
    try {
      await opts.current.persist();
      setExternalChange(false);
      setJustSaved(true);
      notifyStoreUpdated();
      return true;
    } catch {
      setSaveError(true);
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  // Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo (not while typing), Ctrl/Cmd+S save.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        // Commit the field being typed in first (blur), then save the updated draft.
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        setTimeout(() => void save(), 30);
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        opts.current.undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        opts.current.redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  // Leave guard: browser reload/close, and in-app links while there are unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank") return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(url.pathname + url.search);
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  const { changeCount, canUndo, canRedo, undo, redo, discard, reloadFromServer, noun } = options;
  const saveLabel = fixMessage ?? (saving ? "Saving…" : "Save");

  const status = (
    <p aria-live="polite" className="inline-flex items-center gap-1.5 text-xs">
      {saving ? (
        <span className="inline-flex items-center gap-1.5 text-muted">
          <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
          Saving…
        </span>
      ) : dirty ? (
        <span className="inline-flex items-center gap-1.5 font-medium text-caution">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-caution-mark" />
          Unsaved changes ({changeCount})
        </span>
      ) : justSaved ? (
        <span className="inline-flex items-center gap-1.5 text-muted">
          <Check aria-hidden="true" className="h-3 w-3 text-success" />
          Saved
        </span>
      ) : (
        <span className="text-muted">All changes saved</span>
      )}
    </p>
  );

  const discardButton = (className?: string) => (
    <Button
      variant="secondary"
      size="sm"
      className={className}
      disabled={!dirty || saving}
      onClick={() => setConfirmDiscard(true)}
    >
      Discard
    </Button>
  );
  const saveButton = (className?: string) => (
    <Button size="sm" className={className} disabled={!dirty || saving} onClick={() => void save()}>
      <Save aria-hidden="true" className="h-3.5 w-3.5" />
      {saveLabel}
    </Button>
  );

  /** PageHeader actions: status, Undo/Redo, Discard, Save (Undo/Redo in a ⋯ menu on phones). */
  const headerActions = (extra?: React.ReactNode) => (
    <div className="flex flex-wrap items-center gap-2">
      {status}
      <div className="hidden items-center gap-2 sm:flex">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 [&_svg]:h-4 [&_svg]:w-4"
          aria-label="Undo (Ctrl+Z)"
          title="Undo (Ctrl+Z)"
          disabled={!canUndo || saving}
          onClick={undo}
        >
          <Undo2 />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 [&_svg]:h-4 [&_svg]:w-4"
          aria-label="Redo (Ctrl+Shift+Z)"
          title="Redo (Ctrl+Shift+Z)"
          disabled={!canRedo || saving}
          onClick={redo}
        >
          <Redo2 />
        </Button>
        {discardButton()}
        {saveButton()}
      </div>
      <div className="sm:hidden">
        <Menu
          label="Undo or redo"
          icon={MoreHorizontal}
          items={[
            { id: "undo", label: "Undo", onSelect: undo },
            { id: "redo", label: "Redo", onSelect: redo },
          ]}
          disabled={(!canUndo && !canRedo) || saving}
        />
      </div>
      {extra}
    </div>
  );

  const alerts = (
    <>
      {saveError && (
        <Alert
          tone="danger"
          role="alert"
          action={
            <Button variant="ghost" size="sm" className="-my-1 h-7 text-current" onClick={() => void save()}>
              Retry
            </Button>
          }
        >
          Couldn&apos;t save. Your changes are kept.
        </Alert>
      )}
      {externalChange && (
        <Alert
          tone="info"
          role="status"
          action={
            <Button
              variant="ghost"
              size="sm"
              className="-my-1 h-7 text-current"
              onClick={() => {
                setExternalChange(false);
                reloadFromServer();
              }}
            >
              Reload
            </Button>
          }
        >
          {noun} changed elsewhere. Saving will overwrite it.
        </Alert>
      )}
    </>
  );

  /** Phone: Save/Discard stick to the bottom while there are unsaved changes. */
  const mobileBar = dirty ? (
    <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-border bg-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
      {discardButton("flex-1")}
      {saveButton("flex-1")}
    </div>
  ) : null;

  const modals = (
    <>
      {confirmDiscard && (
        <ConfirmModal
          title={`Discard ${changeCount} unsaved change${changeCount === 1 ? "" : "s"}?`}
          onCancel={() => setConfirmDiscard(false)}
          actions={
            <Button
              variant="danger"
              onClick={() => {
                setConfirmDiscard(false);
                setExternalChange(false);
                setSaveError(false);
                discard();
              }}
            >
              Discard
            </Button>
          }
        />
      )}
      {pendingHref && (
        <ConfirmModal
          title="You have unsaved changes"
          cancelLabel="Stay"
          onCancel={() => setPendingHref(null)}
          actions={
            <>
              <Button
                variant="danger"
                onClick={() => {
                  const href = pendingHref;
                  setPendingHref(null);
                  discard();
                  router.push(href);
                }}
              >
                Discard and leave
              </Button>
              <Button
                onClick={async () => {
                  const href = pendingHref;
                  setPendingHref(null);
                  if (await save()) router.push(href);
                }}
              >
                Save and leave
              </Button>
            </>
          }
        />
      )}
    </>
  );

  return {
    dirty,
    saving,
    invalid,
    onValidity,
    save,
    clearSaveError: () => setSaveError(false),
    setExternalChange,
    headerActions,
    alerts,
    mobileBar,
    modals,
  };
}

export function ConfirmModal({
  title,
  cancelLabel = "Cancel",
  onCancel,
  actions,
  body = "Unsaved edits are kept only until you leave this page.",
}: {
  title: string;
  cancelLabel?: string;
  onCancel: () => void;
  actions: React.ReactNode;
  body?: string;
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
      title={title}
      footer={
        <>
          <Button variant="secondary" autoFocus onClick={onCancel}>
            {cancelLabel}
          </Button>
          {actions}
        </>
      }
    >
      <p className="text-sm text-muted">{body}</p>
    </Modal>
  );
}
