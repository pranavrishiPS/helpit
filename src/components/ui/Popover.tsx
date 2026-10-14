"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

const VIEWPORT_MARGIN = 8;
const GAP = 6;

/**
 * Small non-modal dialog anchored to an element (same surface as `Menu`). Fixed-positioned in a
 * portal, below the anchor and flipped up near the bottom; follows scroll/resize. Esc and an
 * outside press call `onClose` (the caller returns focus to the anchor).
 */
export function Popover({
  anchor,
  onClose,
  labelledBy,
  children,
  className,
}: {
  anchor: HTMLElement | null;
  /** "outside" = pointer pressed elsewhere (don't steal focus back); "escape" = Esc key. */
  onClose: (reason: "outside" | "escape") => void;
  labelledBy?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    function place() {
      if (!anchor || !ref.current) return;
      const a = anchor.getBoundingClientRect();
      const p = ref.current.getBoundingClientRect();
      const below = window.innerHeight - a.bottom - VIEWPORT_MARGIN;
      const top = below < p.height + GAP && a.top > p.height + GAP ? a.top - p.height - GAP : a.bottom + GAP;
      const left = Math.min(
        Math.max(VIEWPORT_MARGIN, a.left + a.width / 2 - p.width / 2),
        Math.max(VIEWPORT_MARGIN, window.innerWidth - p.width - VIEWPORT_MARGIN)
      );
      setPos((prev) => (prev && prev.top === top && prev.left === left ? prev : { top, left }));
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor]);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target) || anchor?.contains(target)) return;
      onClose("outside");
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose("escape");
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  // Move focus in only after the first placement, when the popover is visible
  // (an autoFocus on a still-invisible element is ignored and typing would go elsewhere).
  const placed = pos !== null;
  useEffect(() => {
    if (!placed || !ref.current) return;
    if (ref.current.contains(document.activeElement)) return;
    const target =
      ref.current.querySelector<HTMLElement>("[data-autofocus]") ??
      ref.current.querySelector<HTMLElement>("input, select, textarea, button");
    target?.focus();
    if (target instanceof HTMLInputElement) target.select();
  }, [placed]);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-labelledby={labelledBy}
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0 }}
      className={cn(
        "fixed z-50 animate-scale-in rounded-card border border-border bg-card shadow-card",
        !pos && "invisible",
        className
      )}
    >
      {children}
    </div>,
    document.body
  );
}
