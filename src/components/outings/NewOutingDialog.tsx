"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import type { Outing, OutingAttendee } from "@/lib/types";
import { Button } from "@/components/ui";
import { createOuting, updateOuting } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  formatCurrency,
  isOutingPast,
  OUTING_BUDGET_PER_PERSON,
} from "@/lib/utils";

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-accent";

function OutingDialog({
  open,
  onClose,
  onSaved,
  outing,
  memberSuggestions = [],
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  outing?: Outing;
  memberSuggestions?: string[];
}) {
  const isEdit = !!outing;
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [destination, setDestination] = useState("");
  const [members, setMembers] = useState<OutingAttendee[]>([]);
  const [newMember, setNewMember] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goingCount = members.filter((m) => m.confirmed).length;
  const isPast = isOutingPast({ date: date || undefined } as Outing);
  const goingLabel = isPast ? "Attended" : "Going";
  const notGoingLabel = isPast ? "Didn't go" : "Not going";
  const totalBudget = members.length * OUTING_BUDGET_PER_PERSON;

  const remainingSuggestions = useMemo(() => {
    const added = new Set(members.map((m) => m.name.toLowerCase()));
    return memberSuggestions.filter((name) => !added.has(name.toLowerCase()));
  }, [memberSuggestions, members]);

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
      setMembers(
        outing.attendees.map((a) => ({ name: a.name, confirmed: a.confirmed })),
      );
      setNotes(outing.notes ?? "");
    } else {
      setTitle("");
      setDate("");
      setDestination("");
      setMembers([]);
      setNotes("");
    }
    setNewMember("");
    setError(null);
  }, [open, outing]);

  function handleClose() {
    onClose();
  }

  function addMembers(names: string[]) {
    setMembers((prev) => {
      const seen = new Set(prev.map((m) => m.name.toLowerCase()));
      const next = [...prev];
      for (const raw of names) {
        const name = raw.trim();
        if (!name || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        next.push({ name, confirmed: true });
      }
      return next;
    });
  }

  function addTypedMember() {
    addMembers([newMember]);
    setNewMember("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (members.length === 0) {
      setError(
        "Add at least one team member — the budget is based on team size.",
      );
      return;
    }
    setSubmitting(true);

    const payload = {
      title: title.trim(),
      destination: destination.trim() || undefined,
      date: date || undefined,
      budget: totalBudget,
      budgetPerPerson: OUTING_BUDGET_PER_PERSON,
      attendees: members,
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
          <h2
            id="outing-dialog-title"
            className="text-lg font-semibold text-foreground"
          >
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
            <label className="mb-1 block text-xs font-medium text-muted">
              Title
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Q4 team outing"
              className={inputClass}
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Team members
              {members.length > 0 &&
                (isEdit
                  ? ` · ${members.length} total · ${goingCount} ${goingLabel.toLowerCase()}`
                  : ` · ${members.length}`)}
            </label>
            <p className="mb-1.5 text-[11px] text-muted">
              {isEdit
                ? "Mark who isn't going. Don't remove them; the budget counts the whole team."
                : "Add the whole team. The budget counts everyone."}
            </p>

            {remainingSuggestions.length > 0 && (
              <div className="mb-2">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-[11px] text-muted">
                    From previous outings
                  </p>
                  <button
                    type="button"
                    onClick={() => addMembers(remainingSuggestions)}
                    className="text-[11px] font-medium text-accent hover:underline"
                  >
                    Add all
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {remainingSuggestions.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => addMembers([name])}
                      className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 bg-white px-2.5 py-0.5 text-xs text-slate-600 hover:border-accent hover:text-accent"
                    >
                      <Plus className="h-3 w-3" aria-hidden="true" />
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <input
                value={newMember}
                onChange={(e) => setNewMember(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTypedMember();
                  }
                }}
                placeholder="Add a new member"
                className={inputClass}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={addTypedMember}
                disabled={!newMember.trim()}
                aria-label="Add member"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {members.length > 0 && (
              <ul className="mt-2 space-y-1 rounded-lg border border-border bg-white px-2 py-1.5">
                {members.map((member, index) => (
                  <li
                    key={`${member.name}-${index}`}
                    className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50"
                  >
                    <span className={cn(!member.confirmed && "text-muted")}>
                      {member.name}
                    </span>
                    <div className="flex items-center gap-2">
                      {/* Attendance is only known later, so it's marked when editing */}
                      {isEdit && (
                        <button
                          type="button"
                          onClick={() =>
                            setMembers((prev) =>
                              prev.map((m, i) =>
                                i === index
                                  ? { ...m, confirmed: !m.confirmed }
                                  : m,
                              ),
                            )
                          }
                          aria-pressed={member.confirmed}
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                            member.confirmed
                              ? "border-accent/30 bg-accent/10 text-accent"
                              : "border-rose-200 bg-rose-50 text-rose-600",
                          )}
                        >
                          {member.confirmed ? goingLabel : notGoingLabel}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setMembers((prev) =>
                            prev.filter((_, i) => i !== index),
                          )
                        }
                        className="text-muted hover:text-foreground"
                        aria-label={`Remove ${member.name} from team`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Date (optional)
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Venue (optional)
              </label>
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Restaurant, resort…"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Total budget
            </label>
            <div className={cn(inputClass, "bg-slate-50 font-medium")}>
              {formatCurrency(totalBudget)}
            </div>
            <p className="mt-1 text-[11px] text-muted">
              {members.length} team members ×{" "}
              {formatCurrency(OUTING_BUDGET_PER_PERSON)} per person
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Notes (optional)
            </label>
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
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting
                ? "Saving…"
                : isEdit
                  ? "Save changes"
                  : "Create outing"}
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
  memberSuggestions,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  memberSuggestions?: string[];
}) {
  return (
    <OutingDialog
      open={open}
      onClose={onClose}
      onSaved={onCreated}
      memberSuggestions={memberSuggestions}
    />
  );
}

export function EditOutingDialog({
  open,
  onClose,
  onSaved,
  outing,
  memberSuggestions,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  outing: Outing;
  memberSuggestions?: string[];
}) {
  return (
    <OutingDialog
      open={open}
      onClose={onClose}
      onSaved={onSaved}
      outing={outing}
      memberSuggestions={memberSuggestions}
    />
  );
}
