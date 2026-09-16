"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Outing, OutingExpense, OutingExpenseType } from "@/lib/types";
import { Button } from "@/components/ui";
import { createOutingExpense, updateOutingExpense } from "@/lib/api-client";

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-accent";

function parseAmount(value: string): number | undefined {
  const trimmed = value.trim().replace(/,/g, "");
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

function parseCount(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n <= 0) return undefined;
  return n;
}

export function ExpenseDialog({
  open,
  onClose,
  onSaved,
  outing,
  expense,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  outing: Outing;
  expense?: OutingExpense;
}) {
  const isEdit = !!expense;
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<OutingExpenseType>("outing");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [attendeeCount, setAttendeeCount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    if (expense) {
      setTitle(expense.title);
      setAmount(String(expense.amount));
      setType(expense.type === "follow_up" ? "follow_up" : "outing");
      setDate(expense.date ?? "");
      setNotes(expense.notes ?? "");
      setAttendeeCount(expense.attendeeCount != null ? String(expense.attendeeCount) : "");
    } else {
      setTitle("");
      setAmount("");
      setType("outing");
      setDate("");
      setNotes("");
      setAttendeeCount("");
    }
    setError(null);
  }, [open, expense]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedAmount = parseAmount(amount);
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (parsedAmount == null) {
      setError("Enter a valid amount greater than 0");
      return;
    }

    const count = type === "follow_up" ? parseCount(attendeeCount) : undefined;
    setSubmitting(true);

    try {
      if (isEdit && expense) {
        await updateOutingExpense(outing.id, expense.id, {
          title: title.trim(),
          amount: parsedAmount,
          type,
          date: date || null,
          notes: notes.trim() || null,
          attendeeCount: type === "follow_up" ? count ?? null : null,
        });
      } else {
        await createOutingExpense(outing.id, {
          title: title.trim(),
          amount: parsedAmount,
          type,
          date: date || undefined,
          notes: notes.trim() || undefined,
          attendeeCount: count,
        });
      }
      onClose();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save expense");
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
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="expense-dialog-title"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="expense-dialog-title" className="text-lg font-semibold text-foreground">
            {isEdit ? "Edit expense" : "Add expense"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-slate-100 hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Title</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Team dinner, snacks…"
              className={inputClass}
              required
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Amount (₹)</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="22000"
                inputMode="decimal"
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Date (optional)</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Type</label>
            <div className="flex gap-2">
              {(
                [
                  { value: "outing", label: "Outing" },
                  { value: "follow_up", label: "Follow-up" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setType(option.value)}
                  className={
                    type === option.value
                      ? "rounded-lg border border-accent bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent"
                      : "rounded-lg border border-border bg-white px-3 py-1.5 text-sm text-muted hover:bg-slate-50"
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {type === "follow_up" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                People covered (optional)
              </label>
              <input
                value={attendeeCount}
                onChange={(e) => setAttendeeCount(e.target.value)}
                placeholder="8"
                inputMode="numeric"
                className={inputClass}
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Vendor, split, receipt…"
              rows={2}
              className={inputClass}
            />
          </div>

          {error && <p className="text-sm text-warning">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Add expense"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
