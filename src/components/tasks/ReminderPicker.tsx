"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, BellOff, Calendar, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, Input } from "@/components/ui";
import {
  formatReminderAt,
  fromDateTimeLocalValue,
  getReminderPresets,
  toDateTimeLocalValue,
} from "@/lib/reminder-utils";
import { requestReminderPermission } from "@/lib/use-task-reminder-notifications";

export function ReminderPicker({
  value,
  onChange,
  compact,
}: {
  value?: string;
  onChange: (reminderAt: string | undefined) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0 });
  const [customValue, setCustomValue] = useState(toDateTimeLocalValue(value));
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setCustomValue(toDateTimeLocalValue(value));
  }, [value]);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const panelWidth = 256;
      const maxLeft = window.innerWidth - panelWidth - 8;
      setPanelPosition({
        top: rect.bottom + 6,
        left: Math.max(8, Math.min(rect.left, maxLeft)),
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const label = formatReminderAt(value);

  function selectPreset(iso: string) {
    requestReminderPermission();
    onChange(iso);
    setCustomValue(toDateTimeLocalValue(iso));
    setOpen(false);
  }

  function applyCustom() {
    if (!customValue) return;
    requestReminderPermission();
    onChange(fromDateTimeLocalValue(customValue));
    setOpen(false);
  }

  const panel = open ? (
    <div
      ref={panelRef}
      className="fixed z-50 w-64 animate-scale-in rounded-card border border-border bg-card p-2 shadow-overlay"
      style={{ top: panelPosition.top, left: panelPosition.left }}
    >
      <div className="mb-1 flex items-center justify-between px-2 py-1">
        <span className="text-xs font-semibold text-foreground">Set reminder</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-0.5">
        {getReminderPresets().map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => selectPreset(preset.getValue())}
            className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-xs text-foreground transition-colors hover:bg-surface-2"
          >
            <Calendar className="h-3.5 w-3.5 text-accent" />
            {preset.label}
          </button>
        ))}
      </div>

      <div className="mt-2 border-t border-border pt-2">
        <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
          Pick date & time
        </p>
        <Input
          type="datetime-local"
          size="sm"
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          aria-label="Reminder date and time"
        />
        <div className="mt-2 flex gap-1.5">
          <Button size="sm" onClick={applyCustom} disabled={!customValue} className="flex-1">
            Set
          </Button>
          {value && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onChange(undefined);
                setCustomValue("");
                setOpen(false);
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal",
          compact ? "px-2 py-0.5 text-[11px] leading-4" : "px-2.5 py-1 text-xs",
          value
            ? "border-transparent bg-accent-soft text-accent hover:border-accent/30"
            : "border-border bg-card text-muted hover:border-accent/40 hover:text-accent"
        )}
      >
        {value ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
        {label ?? "Remind me"}
      </button>

      {mounted && panel ? createPortal(panel, document.body) : null}
    </>
  );
}
