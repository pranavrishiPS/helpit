"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import type { Outing, OutingAttendee } from "@/lib/types";
import {
  Badge,
  Button,
  FieldError,
  Input,
  Label,
  Modal,
  Textarea,
  fieldClasses,
} from "@/components/ui";
import { createOuting, updateOuting } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  formatCurrency,
  isOutingPast,
  OUTING_BUDGET_PER_PERSON,
} from "@/lib/utils";

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
  // Latest outing without making it an effect dependency: store reloads hand us a
  // new object each time and must not wipe what the user is typing.
  const outingRef = useRef(outing);
  useEffect(() => {
    outingRef.current = outing;
  }, [outing]);
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
    const outing = outingRef.current;
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
    // Seed only when the dialog opens or targets a different outing.
  }, [open, outing?.id]);

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
    <Modal
      onClose={handleClose}
      title={isEdit ? "Edit outing" : "New outing"}
      titleId="outing-dialog-title"
      module="outings"
      onSubmit={handleSubmit}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting
              ? "Saving…"
              : isEdit
                ? "Save changes"
                : "Create outing"}
          </Button>
        </>
      }
    >
          <div>
            <Label htmlFor="outing-title">
              Title
            </Label>
            <Input
              id="outing-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Q4 team outing"
              required
            />
          </div>

          <div>
            <Label htmlFor="outing-new-member">
              Team members
              {members.length > 0 &&
                (isEdit
                  ? ` · ${members.length} total · ${goingCount} ${goingLabel.toLowerCase()}`
                  : ` · ${members.length}`)}
            </Label>
            <p className="-mt-1 mb-2 text-[11px] text-muted">
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
                    className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-accent hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
                      className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border-strong bg-card px-2.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <Plus className="h-3 w-3" aria-hidden="true" />
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Input
                id="outing-new-member"
                value={newMember}
                onChange={(e) => setNewMember(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTypedMember();
                  }
                }}
                placeholder="Add a new member"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={addTypedMember}
                disabled={!newMember.trim()}
                aria-label="Add member"
                className="w-10 shrink-0 px-0"
              >
                <Plus />
              </Button>
            </div>
            {members.length > 0 && (
              <ul className="mt-2 space-y-0.5 rounded-control border border-border bg-card px-1.5 py-1">
                {members.map((member, index) => (
                  <li
                    key={`${member.name}-${index}`}
                    className="flex items-center justify-between gap-2 rounded-md py-0.5 pl-1.5 pr-0.5 text-sm hover:bg-surface-2"
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
                          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          <Badge
                            tone={member.confirmed ? "success" : "neutral"}
                            dot={member.confirmed}
                          >
                            {member.confirmed ? goingLabel : notGoingLabel}
                          </Badge>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setMembers((prev) =>
                            prev.filter((_, i) => i !== index),
                          )
                        }
                        className="grid h-7 w-7 place-items-center rounded-md text-muted transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="outing-date">
                Date (optional)
              </Label>
              <Input
                id="outing-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="outing-venue">
                Venue (optional)
              </Label>
              <Input
                id="outing-venue"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Restaurant, resort…"
              />
            </div>
          </div>

          <div>
            <p className="mb-1.5 block text-xs font-semibold text-foreground">
              Total budget
            </p>
            <div
              className={cn(
                fieldClasses(),
                "flex items-center bg-surface-2 font-semibold tabular-nums hover:border-input",
              )}
            >
              {formatCurrency(totalBudget)}
            </div>
            <p className="mt-1 text-[11px] text-muted">
              {members.length} team members ×{" "}
              {formatCurrency(OUTING_BUDGET_PER_PERSON)} per person
            </p>
          </div>

          <div>
            <Label htmlFor="outing-notes">
              Notes (optional)
            </Label>
            <Textarea
              id="outing-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Planning notes, dietary prefs…"
              rows={2}
            />
          </div>

          {error && <FieldError>{error}</FieldError>}
    </Modal>
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
