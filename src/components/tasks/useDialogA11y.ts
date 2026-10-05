"use client";

import { useEffect, useRef, useState } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The shared `Modal` leaves Escape and focus handling to each dialog. Put `anchorRef` on any
 * element inside the dialog body. While mounted this: closes on Escape (`onEscape`), keeps Tab
 * inside the dialog, and returns focus to the opener on unmount. Escape handled by an open Menu
 * (default prevented) is left alone.
 */
export function useDialogA11y({
  onEscape,
  returnFocusRef,
}: {
  onEscape: () => void;
  /** Element to refocus on close; defaults to whatever was focused when the dialog opened. */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const anchorRef = useRef<HTMLElement | null>(null);
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  });
  const [opener] = useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)
  );

  useEffect(() => {
    const returnTarget = returnFocusRef?.current ?? opener;
    function onKeyDown(e: KeyboardEvent) {
      const root = anchorRef.current?.closest<HTMLElement>('[role="dialog"]');
      if (!root) return;
      if (e.key === "Escape") {
        if (e.defaultPrevented) return;
        e.preventDefault();
        onEscapeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const target = e.target as HTMLElement;
      if (target.closest?.('[role="menu"]')) return; // the Menu manages its own Tab
      const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.getClientRects().length > 0
      );
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!root.contains(target)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && target === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && target === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (returnTarget && returnTarget.isConnected) returnTarget.focus();
    };
  }, [opener, returnFocusRef]);

  /** Focuses the dialog's `[data-autofocus]` element (call when the view changes). */
  function focusInitial() {
    anchorRef.current
      ?.closest<HTMLElement>('[role="dialog"]')
      ?.querySelector<HTMLElement>("[data-autofocus]")
      ?.focus();
  }

  return { anchorRef, focusInitial };
}
