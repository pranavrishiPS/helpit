"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal";

/**
 * Click-to-edit text cell. Enter or blur saves, Esc cancels. `onSave` resolves to false when the
 * save failed: the cell then shows the stored value again (the error banner explains why).
 * `multiline` cells (comments) use Shift+Enter for a new line.
 */
export function EditableText({
  value,
  onSave,
  ariaLabel,
  placeholder,
  multiline,
  className,
}: {
  value: string;
  onSave: (next: string) => Promise<boolean>;
  ariaLabel: string;
  /** Shown (muted) when the value is empty. */
  placeholder?: string;
  multiline?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const fieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Set by Esc / Enter so the blur that follows the field unmounting does not save twice.
  const finished = useRef(false);
  const refocus = useRef(false);

  useEffect(() => {
    if (editing) {
      const field = fieldRef.current;
      field?.focus();
      field?.setSelectionRange(field.value.length, field.value.length);
    } else if (refocus.current) {
      refocus.current = false;
      buttonRef.current?.focus();
    }
  }, [editing]);

  function begin() {
    finished.current = false;
    setDraft(value);
    setEditing(true);
  }

  async function commit(viaKeyboard: boolean) {
    if (finished.current) return;
    finished.current = true;
    refocus.current = viaKeyboard;
    setEditing(false);
    if (draft.trim() === value.trim()) return;
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    finished.current = true;
    refocus.current = true;
    setEditing(false);
  }

  if (editing) {
    const shared = {
      ref: fieldRef,
      value: draft,
      "aria-label": ariaLabel,
      placeholder,
      className:
        "w-full rounded-chip border border-signal bg-card px-2 py-1 text-sm leading-5 text-foreground outline-none ring-2 ring-signal/15 placeholder:text-subtle",
      onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) =>
        setDraft(e.target.value),
      onBlur: () => void commit(false),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cancel();
        } else if (e.key === "Enter" && !(multiline && e.shiftKey) && !e.nativeEvent.isComposing) {
          e.preventDefault();
          void commit(true);
        }
      },
    };
    return multiline ? (
      <textarea {...shared} rows={1} className={cn(shared.className, "field-sizing-content resize-none")} />
    ) : (
      <input {...shared} type="text" />
    );
  }

  const shown = saving ? draft : value;
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={begin}
      title="Click to edit"
      className={cn(
        "block min-h-8 w-full min-w-0 cursor-text whitespace-pre-wrap break-words rounded-chip px-2 py-1.5 text-left text-sm leading-5 hover:bg-surface-2",
        FOCUS_RING,
        !shown &&
          "text-subtle sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100",
        saving && "opacity-60",
        className
      )}
    >
      {shown || placeholder}
    </button>
  );
}
