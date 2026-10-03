"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, BellOff, Calendar, X } from "lucide-react";
import { cn } from "@/lib/cn";
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
      className="fixed z-50 w-64 rounded-xl border border-border bg-card p-2 shadow-lg"
      style={{ top: panelPosition.top, left: panelPosition.left }}
    >
      <div className="mb-1 flex items-center justify-between px-2 py-1">
        <span className="text-xs font-medium text-foreground">Set reminder</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded p-0.5 text-muted hover:bg-slate-100"
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
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-foreground hover:bg-slate-50"
          >
            <Calendar className="h-3.5 w-3.5 text-accent" />
            {preset.label}
          </button>
        ))}
      </div>

      <div className="mt-2 border-t border-border pt-2">
        <p className="mb-1.5 px-2 text-[10px] font-medium tracking-wide text-muted uppercase">
          Pick date & time
        </p>
        <input
          type="datetime-local"
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          className="w-full rounded-lg border border-border px-2 py-1.5 text-xs outline-none focus:border-accent"
        />
        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            onClick={applyCustom}
            disabled={!customValue}
            className="flex-1 rounded-lg bg-accent px-2 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-40"
          >
            Set
          </button>
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                setCustomValue("");
                setOpen(false);
              }}
              className="rounded-lg border border-border px-2 py-1.5 text-xs text-muted hover:bg-slate-50"
            >
              Clear
            </button>
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
          "inline-flex items-center gap-1.5 rounded-full border transition-colors",
          compact ? "px-2 py-1 text-[11px]" : "px-2.5 py-1 text-xs",
          value
            ? "border-accent/30 bg-accent/10 text-accent hover:bg-accent/15"
            : "border-border bg-white text-muted hover:border-accent/30 hover:text-accent"
        )}
      >
        {value ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
        {label ?? "Remind me"}
      </button>

      {mounted && panel ? createPortal(panel, document.body) : null}
    </>
  );
}
