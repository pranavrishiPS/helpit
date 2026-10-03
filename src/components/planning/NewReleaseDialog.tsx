"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import type { ReleasePlatform } from "@/lib/types";
import { Button, FieldError, Input, Label, Modal } from "@/components/ui";
import { cn } from "@/lib/cn";
import { createRelease } from "@/lib/api-client";
import { formatSprintItems } from "@/lib/utils";

interface NewReleaseDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function NewReleaseDialog({ open, onClose, onCreated }: NewReleaseDialogProps) {
  const [platform, setPlatform] = useState<ReleasePlatform>("android");
  const [buildNumber, setBuildNumber] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [sprintItems, setSprintItems] = useState<string[]>([]);
  const [newSprintItem, setNewSprintItem] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escape follows the same path as Cancel (reset the form, then close).
  const handleCloseRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    handleCloseRef.current = handleClose;
  });

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleCloseRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function resetForm() {
    setPlatform("android");
    setBuildNumber("");
    setTargetDate("");
    setSprintItems([]);
    setNewSprintItem("");
    setError(null);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function addSprintItem() {
    const trimmed = newSprintItem.trim();
    if (!trimmed) return;
    setSprintItems((prev) => [...prev, trimmed]);
    setNewSprintItem("");
  }

  function removeSprintItem(index: number) {
    setSprintItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedBuild = buildNumber.trim();
    if (!trimmedBuild) {
      setError("Build number is required");
      return;
    }
    if (!/^\d+\.\d+$/.test(trimmedBuild)) {
      setError("Build number should look like 1.180");
      return;
    }
    if (!targetDate) {
      setError("Planned date is required");
      return;
    }

    setSubmitting(true);
    try {
      await createRelease({
        platform,
        buildNumber: trimmedBuild,
        targetDate,
        notes: formatSprintItems(sprintItems),
      });
      resetForm();
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create release");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <Modal
      onClose={handleClose}
      title="New release"
      titleId="new-release-title"
      module="planning"
      onSubmit={handleSubmit}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create release"}
          </Button>
        </>
      }
    >
      <div>
        <p className="mb-1.5 text-xs font-semibold text-foreground">Platform</p>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Platform">
          {(["android", "ios"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              aria-pressed={platform === p}
              className={cn(
                "flex h-10 items-center justify-center gap-2 rounded-control border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
                platform === p
                  ? p === "android"
                    ? "border-android bg-android-soft text-android-ink"
                    : "border-ios bg-ios-soft text-ios-ink"
                  : "border-border bg-card text-muted hover:bg-surface-2"
              )}
            >
              <span
                aria-hidden="true"
                className={cn("h-2 w-2 rounded-full", p === "android" ? "bg-android" : "bg-ios")}
              />
              {p === "android" ? "Android" : "iOS"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="build-number">Build number</Label>
          <Input
            id="build-number"
            type="text"
            value={buildNumber}
            onChange={(e) => setBuildNumber(e.target.value)}
            placeholder="1.184"
          />
        </div>
        <div>
          <Label htmlFor="planned-date">Planned date</Label>
          <Input
            id="planned-date"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="sprint-item-input">Sprint Items</Label>
        <div className="flex gap-2">
          <Input
            id="sprint-item-input"
            type="text"
            value={newSprintItem}
            onChange={(e) => setNewSprintItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSprintItem();
              }
            }}
            placeholder="Add a feature, catchup, or event…"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={addSprintItem}
            disabled={!newSprintItem.trim()}
            aria-label="Add sprint item"
            className="w-10 shrink-0 px-0"
          >
            <Plus />
          </Button>
        </div>
        {sprintItems.length > 0 ? (
          <ul className="mt-2 space-y-0.5 rounded-control border border-border bg-card px-1.5 py-1">
            {sprintItems.map((item, index) => (
              <li
                key={`${item}-${index}`}
                className="flex items-center justify-between gap-2 rounded-md py-0.5 pl-1.5 pr-0.5 text-sm hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1 text-foreground">{item}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeSprintItem(index)}
                  className="h-7 w-7 shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5"
                  aria-label={`Remove ${item}`}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {error && <FieldError>{error}</FieldError>}
    </Modal>
  );
}
