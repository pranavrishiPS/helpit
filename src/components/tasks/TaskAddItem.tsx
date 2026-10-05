"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

/**
 * "+ Add item" row input at the end of a day section. Enter saves and keeps focus for the next
 * item, Esc clears and leaves, blank is ignored. `onAdd` resolves to false when the create
 * failed: the text is kept.
 */
export function AddItem({
  onAdd,
  ariaLabel,
}: {
  onAdd: (title: string) => Promise<boolean>;
  ariaLabel: string;
}) {
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const refocus = useRef(false);

  // The input is disabled while saving, which drops focus; take it back afterwards.
  useEffect(() => {
    if (!submitting && refocus.current) {
      refocus.current = false;
      inputRef.current?.focus();
    }
  }, [submitting]);

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    refocus.current = true;
    try {
      const ok = await onAdd(trimmed);
      if (ok !== false) setTitle("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <label className="group/add flex min-h-8 cursor-text items-center gap-2 px-3 text-muted transition-colors focus-within:bg-surface-2/60 hover:bg-surface-2/60 sm:pl-5">
      <Plus aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={title}
        disabled={submitting}
        aria-label={ariaLabel}
        placeholder="Add item"
        className="h-8 min-w-0 flex-1 scroll-mt-20 bg-transparent text-sm text-foreground outline-none placeholder:text-muted disabled:text-muted"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setTitle("");
            e.currentTarget.blur();
          }
        }}
      />
      <span className="hidden text-[11px] sm:group-focus-within/add:inline">
        Enter to add, Esc to cancel
      </span>
    </label>
  );
}
