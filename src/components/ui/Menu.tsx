"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface MenuItem {
  id: string;
  label: React.ReactNode;
  /** Shows a check mark (current value). */
  checked?: boolean;
  onSelect: () => void;
  /** Keep the menu open after selecting (e.g. to reveal an inline date input). */
  keepOpen?: boolean;
  /** Danger styling (e.g. Delete). */
  destructive?: boolean;
}

const VIEWPORT_MARGIN = 8;
const GAP = 4;

/**
 * Small popover menu (status / day pickers). Rendered in a portal with fixed positioning so
 * scrolling column lists never clip it. Opens below the trigger and flips up near the bottom.
 * Click/Enter/Space opens, arrows move, Enter picks, Esc closes and returns focus to the trigger.
 */
export function Menu({
  label,
  icon: Icon,
  items,
  footer,
  children,
  triggerClassName,
  disabled,
  onOpenChange,
}: {
  /** Accessible name of the trigger button. */
  label: string;
  /** Icon for the default (ghost icon) trigger. */
  icon?: LucideIcon;
  items: MenuItem[];
  /** Extra content under the items; receives `close`. */
  footer?: (close: () => void) => React.ReactNode;
  /** Custom trigger content; renders a plain button styled by `triggerClassName`. */
  children?: React.ReactNode;
  triggerClassName?: string;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpenState] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const hasFooter = Boolean(footer);

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      if (!next) setPos(null);
      onOpenChange?.(next);
    },
    [onOpenChange]
  );

  const close = useCallback(
    (refocus: boolean) => {
      setOpen(false);
      if (refocus) triggerRef.current?.focus();
    },
    [setOpen]
  );

  // Position next to the trigger once the menu has been measured.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - trigger.bottom - VIEWPORT_MARGIN;
    const flipUp = spaceBelow < menu.height + GAP && trigger.top > menu.height + GAP;
    const top = flipUp ? trigger.top - menu.height - GAP : trigger.bottom + GAP;
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, trigger.right - menu.width),
      Math.max(VIEWPORT_MARGIN, window.innerWidth - menu.width - VIEWPORT_MARGIN)
    );
    setPos((prev) => (prev && prev.top === top && prev.left === left ? prev : { top, left }));
  }, [open, items.length, hasFooter]);

  // Focus the current (or first) item on open.
  useEffect(() => {
    if (!open || !pos) return;
    const root = menuRef.current;
    if (!root || root.contains(document.activeElement)) return;
    const target =
      root.querySelector<HTMLElement>('[role^="menuitem"][aria-checked="true"]') ??
      root.querySelector<HTMLElement>('[role^="menuitem"]');
    target?.focus();
  }, [open, pos]);

  // Close on outside press, scroll and resize (the menu is fixed-positioned).
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onDismiss(e: Event) {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onDismiss, true);
    window.addEventListener("resize", onDismiss);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onDismiss, true);
      window.removeEventListener("resize", onDismiss);
    };
  }, [open, setOpen]);

  function onMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    }
    if (e.key === "Tab") {
      // Return focus to the trigger first so Tab continues from there, not from the end of <body>.
      if ((e.target as HTMLElement).getAttribute("role")?.startsWith("menuitem")) close(true);
      return;
    }
    const entries = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []
    );
    if (entries.length === 0) return;
    const index = entries.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      entries[(index + 1) % entries.length].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      entries[(index - 1 + entries.length) % entries.length].focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      entries[0].focus();
    } else if (e.key === "End") {
      e.preventDefault();
      entries[entries.length - 1].focus();
    }
  }

  const triggerProps = {
    ref: triggerRef,
    "aria-label": label,
    "aria-haspopup": "menu" as const,
    "aria-expanded": open,
    "aria-controls": open ? menuId : undefined,
    disabled,
    onClick: () => setOpen(!open),
    onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "ArrowDown" && !open) {
        e.preventDefault();
        setOpen(true);
      }
    },
  };

  return (
    <>
      {children ? (
        <button type="button" {...triggerProps} className={triggerClassName}>
          {children}
        </button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          title={label}
          {...triggerProps}
          className={triggerClassName}
        >
          {Icon && <Icon />}
        </Button>
      )}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
            onBlur={(e) => {
              const next = e.relatedTarget as Node | null;
              if (next && !menuRef.current?.contains(next) && !triggerRef.current?.contains(next)) {
                setOpen(false);
              }
            }}
            style={{ top: pos?.top ?? 0, left: pos?.left ?? 0 }}
            className={cn(
              "fixed z-50 min-w-40 max-w-[calc(100vw-2rem)] animate-scale-in rounded-control border border-border bg-card p-1 shadow-overlay",
              !pos && "invisible"
            )}
          >
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                role={item.checked === undefined ? "menuitem" : "menuitemradio"}
                aria-checked={item.checked === undefined ? undefined : item.checked}
                onClick={() => {
                  item.onSelect();
                  if (!item.keepOpen) close(true);
                }}
                className={cn(
                  "flex h-8 w-full items-center justify-between gap-3 rounded-lg px-2.5 text-left text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal",
                  item.destructive
                    ? "text-danger hover:bg-danger-soft focus-visible:bg-danger-soft"
                    : "text-foreground hover:bg-surface-2 focus-visible:bg-surface-2"
                )}
              >
                <span className="truncate">{item.label}</span>
                {item.checked && <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-accent" />}
              </button>
            ))}
            {footer?.(() => close(true))}
          </div>,
          document.body
        )}
    </>
  );
}
