"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import type { ReleasePlatform } from "@/lib/types";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { createRelease } from "@/lib/api-client";
import { formatSprintItems } from "@/lib/utils";

interface NewReleaseDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-accent";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close dialog"
        onClick={handleClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-release-title"
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="new-release-title" className="text-lg font-semibold text-foreground">
            New release
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md p-1 text-muted hover:bg-slate-100 hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="space-y-4 px-5 py-4">
            <div>
              <p className="mb-2 text-xs font-medium text-muted">Platform</p>
              <div className="flex gap-2">
                {(["android", "ios"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlatform(p)}
                    aria-pressed={platform === p}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      platform === p
                        ? p === "android"
                          ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                          : "border-blue-500 bg-blue-50 text-blue-800"
                        : "border-border bg-white text-muted hover:bg-slate-50"
                    )}
                  >
                    {p === "android" ? "Android" : "iOS"}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="build-number" className="mb-1.5 block text-xs font-medium text-muted">
                  Build number
                </label>
                <input
                  id="build-number"
                  type="text"
                  value={buildNumber}
                  onChange={(e) => setBuildNumber(e.target.value)}
                  placeholder="1.184"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="planned-date" className="mb-1.5 block text-xs font-medium text-muted">
                  Planned date
                </label>
                <input
                  id="planned-date"
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="sprint-item-input" className="mb-1.5 block text-xs font-medium text-muted">
                Sprint Items
              </label>
              <div className="flex gap-2">
                <input
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
                  className={inputClass}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={addSprintItem}
                  disabled={!newSprintItem.trim()}
                  aria-label="Add sprint item"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {sprintItems.length > 0 ? (
                <ul className="mt-2 space-y-1 rounded-lg border border-border bg-white px-2 py-1.5">
                  {sprintItems.map((item, index) => (
                    <li
                      key={`${item}-${index}`}
                      className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50"
                    >
                      <span className="min-w-0 flex-1 text-foreground">{item}</span>
                      <button
                        type="button"
                        onClick={() => removeSprintItem(index)}
                        className="shrink-0 rounded p-0.5 text-muted hover:bg-slate-100 hover:text-foreground"
                        aria-label={`Remove ${item}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {error && <p className="text-sm text-warning">{error}</p>}
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
            <Button type="button" variant="secondary" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create release"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
