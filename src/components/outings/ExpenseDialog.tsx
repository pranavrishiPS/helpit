"use client";

import { useEffect, useState } from "react";
import type { Outing, OutingExpense, OutingExpenseType } from "@/lib/types";
import { Button, FieldError, Input, Label, Modal, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { createOutingExpense, updateOutingExpense } from "@/lib/api-client";

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
    <Modal
      onClose={onClose}
      title={isEdit ? "Edit expense" : "Add expense"}
      titleId="expense-dialog-title"
      module="outings"
      onSubmit={handleSubmit}
      className="sm:max-w-md"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : isEdit ? "Save changes" : "Add expense"}
          </Button>
        </>
      }
    >
          <div>
            <Label htmlFor="expense-title">
              Title
            </Label>
            <Input
              id="expense-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Team dinner, snacks…"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="expense-amount">
                Amount (₹)
              </Label>
              <Input
                id="expense-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="22000"
                inputMode="decimal"
                required
              />
            </div>
            <div>
              <Label htmlFor="expense-date">
                Date (optional)
              </Label>
              <Input
                id="expense-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <p id="expense-type-label" className="mb-1.5 block text-xs font-semibold text-foreground">
              Type
            </p>
            <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="expense-type-label">
              {(
                [
                  { value: "outing", label: "Outing" },
                  { value: "follow_up", label: "Other" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setType(option.value)}
                  aria-pressed={type === option.value}
                  className={cn(
                    "h-10 rounded-control border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2",
                    type === option.value
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-border bg-card text-muted hover:bg-surface-2"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {type === "follow_up" && (
            <div>
              <Label htmlFor="expense-attendees">
                People covered (optional)
              </Label>
              <Input
                id="expense-attendees"
                value={attendeeCount}
                onChange={(e) => setAttendeeCount(e.target.value)}
                placeholder="8"
                inputMode="numeric"
              />
            </div>
          )}

          <div>
            <Label htmlFor="expense-notes">
              Notes (optional)
            </Label>
            <Textarea
              id="expense-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Vendor, split, receipt…"
              rows={2}
            />
          </div>

          {error && <FieldError>{error}</FieldError>}
    </Modal>
  );
}
