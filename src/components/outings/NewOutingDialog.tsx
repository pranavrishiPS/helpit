"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import type { Outing } from "@/lib/types";
import { Button } from "@/components/ui";
import { createOuting, updateOuting } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-accent";

function parseOptionalAmount(value: string): number | undefined {
  const trimmed = value.trim().replace(/,/g, "");
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

function OutingDialog({
  open,
  onClose,
  onSaved,
  outing,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  outing?: Outing;
}) {
  const isEdit = !!outing;
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [destination, setDestination] = useState("");
  const [budgetPerPerson, setBudgetPerPerson] = useState("");
  const [budget, setBudget] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [newMember, setNewMember] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const perPerson = parseOptionalAmount(budgetPerPerson);
  const totalBudget = parseOptionalAmount(budget);

  const calculatedTotal = useMemo(() => {
    if (perPerson != null && members.length > 0) {
      return perPerson * members.length;
    }
    return null;
  }, [perPerson, members.length]);

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
    if (outing) {
      setTitle(outing.title);
      setDate(outing.date ?? "");
      setDestination(outing.destination ?? "");
      setBudgetPerPerson(outing.budgetPerPerson != null ? String(outing.budgetPerPerson) : "");
      setBudget(String(outing.budget));
      setMembers(outing.attendees.map((a) => a.name));
      setNotes(outing.notes ?? "");
    } else {
      setTitle("");
      setDate("");
      setDestination("");
      setBudgetPerPerson("");
      setBudget("");
      setMembers([]);
      setNotes("");
    }
    setNewMember("");
    setError(null);
  }, [open, outing]);

  function handleClose() {
    onClose();
  }

  function addMember() {
    const trimmed = newMember.trim();
    if (!trimmed) return;
    if (members.some((m) => m.toLowerCase() === trimmed.toLowerCase())) {
      setNewMember("");
      return;
    }
    setMembers((prev) => [...prev, trimmed]);
    setNewMember("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const payload = {
      title: title.trim(),
      destination: destination.trim() || undefined,
      date: date || undefined,
      budget: totalBudget ?? calculatedTotal ?? undefined,
      budgetPerPerson: perPerson,
      members: members.length > 0 ? members : undefined,
      notes: notes.trim() || undefined,
    };

    try {
      if (isEdit && outing) {
        await updateOuting(outing.id, payload);
      } else {
        await createOuting(payload);
      }
      onClose();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save outing");
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
        aria-labelledby="outing-dialog-title"
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="outing-dialog-title" className="text-lg font-semibold text-foreground">
            {isEdit ? "Edit outing" : "New outing"}
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

        <form onSubmit={handleSubmit} className="space-y-3 overflow-y-auto p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Title</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Q4 team outing"
              className={inputClass}
              required
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Date (optional)</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Venue (optional)</label>
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Restaurant, resort…"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Budget per person (₹)
              </label>
              <input
                value={budgetPerPerson}
                onChange={(e) => setBudgetPerPerson(e.target.value)}
                placeholder="2500"
                inputMode="decimal"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Total budget (₹)</label>
              <input
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder={calculatedTotal != null ? String(calculatedTotal) : "42500"}
                inputMode="decimal"
                className={inputClass}
              />
              {calculatedTotal != null && !totalBudget && (
                <p className="mt-1 text-[11px] text-muted">
                  Calculated: {formatCurrency(calculatedTotal)} ({members.length} members)
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Members (optional)</label>
            <div className="flex gap-2">
              <input
                value={newMember}
                onChange={(e) => setNewMember(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addMember();
                  }
                }}
                placeholder="Add team member"
                className={inputClass}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={addMember}
                disabled={!newMember.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {members.length > 0 && (
              <ul className="mt-2 space-y-1 rounded-lg border border-border bg-white px-2 py-1.5">
                {members.map((member, index) => (
                  <li
                    key={`${member}-${index}`}
                    className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50"
                  >
                    <span>{member}</span>
                    <button
                      type="button"
                      onClick={() => setMembers((prev) => prev.filter((_, i) => i !== index))}
                      className="text-muted hover:text-foreground"
                      aria-label={`Remove ${member}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Planning notes, dietary prefs…"
              rows={2}
              className={inputClass}
            />
          </div>

          {error && <p className="text-sm text-warning">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="sm" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Create outing"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function NewOutingDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  return <OutingDialog open={open} onClose={onClose} onSaved={onCreated} />;
}

export function EditOutingDialog({
  open,
  onClose,
  onSaved,
  outing,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  outing: Outing;
}) {
  return <OutingDialog open={open} onClose={onClose} onSaved={onSaved} outing={outing} />;
}
