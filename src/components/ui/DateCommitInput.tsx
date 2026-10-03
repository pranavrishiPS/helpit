"use client";

import { useEffect, useRef, useState } from "react";
import { isCommittableDate } from "@/lib/date-input";

const COMMIT_DELAY_MS = 600;

interface DateCommitInputProps {
  /** Stored value (yyyy-MM-dd) or empty string. */
  value: string;
  /** Called with a complete valid date, or "" when the user explicitly clears the field. */
  onCommit: (value: string) => void | Promise<void>;
  className?: string;
  "aria-label"?: string;
  id?: string;
  min?: string;
}

/**
 * Date input that keeps in-progress typing local. Chrome emits intermediate values
 * while typing a date (e.g. year 0002), so only complete valid dates are committed:
 * debounced after a pick, or immediately on blur / Enter. A partially typed or invalid
 * value is reverted to the stored one on blur; an explicit clear commits "".
 */
export function DateCommitInput({
  value,
  onCommit,
  className,
  "aria-label": ariaLabel,
  id,
  min,
}: DateCommitInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<string | null>(null);
  const valueRef = useRef(value);
  const onCommitRef = useRef(onCommit);
  useEffect(() => {
    valueRef.current = value;
    onCommitRef.current = onCommit;
  });

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  function cancelTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  async function commit(next: string) {
    if (next === valueRef.current || next === inFlightRef.current) return;
    inFlightRef.current = next;
    try {
      await onCommitRef.current(next);
    } finally {
      inFlightRef.current = null;
      // Show the stored value again (the new one on success, the old one on failure).
      setDraft(null);
    }
  }

  function flush(input: HTMLInputElement) {
    cancelTimer();
    const next = input.value;
    if (isCommittableDate(next)) {
      void commit(next);
    } else if (next === "" && !input.validity.badInput && valueRef.current !== "") {
      void commit("");
    } else {
      setDraft(null);
    }
  }

  return (
    <input
      type="date"
      id={id}
      min={min}
      value={draft ?? value}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        cancelTimer();
        if (isCommittableDate(next)) {
          timerRef.current = setTimeout(() => {
            timerRef.current = null;
            void commit(next);
          }, COMMIT_DELAY_MS);
        }
      }}
      onBlur={(e) => flush(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === "Enter") flush(e.currentTarget);
      }}
      onClick={(e) => e.stopPropagation()}
      className={className}
      aria-label={ariaLabel}
    />
  );
}
