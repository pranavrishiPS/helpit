"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, ChevronDown, Plus, X } from "lucide-react";
import type { Release, ReleasePhase, ReleaseStatus } from "@/lib/types";
import { Badge, Card, Button } from "@/components/ui";
import { DateCommitInput } from "@/components/ui/DateCommitInput";
import {
  RELEASE_PHASE_LABELS,
  RELEASE_PHASE_ORDER,
} from "@/lib/release-constants";
import {
  releasePhaseColor,
  statusColor,
  getReleasePlatform,
  releasePlatformTitleClass,
  releasePlatformCardClass,
  releasePlatformDateClass,
  formatReleaseDate,
  parseSprintItems,
  formatSprintItems,
} from "@/lib/utils";
import { cn } from "@/lib/cn";

const sprintInputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-accent";

const MARK_SHIPPED_VALUE = "__mark_shipped__";

interface ReleaseCardProps {
  release: Release;
  className?: string;
  defaultExpanded?: boolean;
  detailPanel?: boolean;
  detailDateLabel?: string;
  onUpdate?: (updates: {
    phase?: ReleasePhase;
    status?: ReleaseStatus;
    targetDate?: string | null;
    actualDate?: string | null;
    notes?: string | null;
    sprintNote?: string | null;
  }) => void;
}

export function ReleaseCard({
  release,
  className,
  defaultExpanded = false,
  detailPanel = false,
  detailDateLabel,
  onUpdate,
}: ReleaseCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded || detailPanel);
  const [sprintItemsDraft, setSprintItemsDraft] = useState(() =>
    parseSprintItems(release.notes)
  );
  const [newSprintItem, setNewSprintItem] = useState("");
  const [sprintNoteDraft, setSprintNoteDraft] = useState(() => release.sprintNote ?? "");

  useEffect(() => {
    setExpanded(defaultExpanded || detailPanel);
  }, [release.id, defaultExpanded, detailPanel]);

  useEffect(() => {
    setSprintItemsDraft(parseSprintItems(release.notes));
  }, [release.notes]);

  useEffect(() => {
    setSprintNoteDraft(release.sprintNote ?? "");
  }, [release.sprintNote]);

  function persistSprintItems(items: string[]) {
    if (!onUpdate) return;
    const formatted = formatSprintItems(items) ?? null;
    if (formatted !== (release.notes ?? null)) {
      onUpdate({ notes: formatted });
    }
  }

  function addSprintItem() {
    const trimmed = newSprintItem.trim();
    if (!trimmed || !onUpdate) return;
    const next = [...sprintItemsDraft, trimmed];
    setSprintItemsDraft(next);
    setNewSprintItem("");
    persistSprintItems(next);
  }

  function removeSprintItem(index: number) {
    if (!onUpdate) return;
    const next = sprintItemsDraft.filter((_, i) => i !== index);
    setSprintItemsDraft(next);
    persistSprintItems(next);
  }

  const platform = getReleasePlatform(release);
  const sprintItems = parseSprintItems(release.notes);
  const isCompleted = release.status === "live";
  const isExpanded = detailPanel || expanded;
  const sectionClass = detailPanel
    ? "rounded-lg border border-border/80 bg-slate-50/40 p-2"
    : "rounded-lg border border-border/80 bg-slate-50/40 p-3";

  const phaseControl = isCompleted ? (
    <Badge className={cn("shrink-0", statusColor("live"))}>Live</Badge>
  ) : onUpdate ? (
    <select
      value={release.phase ?? ""}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        if (e.target.value === MARK_SHIPPED_VALUE) {
          onUpdate({
            status: "live",
            actualDate:
              release.actualDate ?? format(new Date(), "yyyy-MM-dd"),
          });
          return;
        }
        onUpdate({ phase: e.target.value as ReleasePhase });
      }}
      className={cn(
        "shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-medium outline-none focus:border-accent",
        releasePhaseColor(release.phase)
      )}
      aria-label="Release phase"
    >
      <option value="" disabled>
        Yet to Start
      </option>
      {RELEASE_PHASE_ORDER.map((phase) => (
        <option key={phase} value={phase}>
          {RELEASE_PHASE_LABELS[phase]}
        </option>
      ))}
      <option disabled>────────</option>
      <option value={MARK_SHIPPED_VALUE}>Mark shipped</option>
    </select>
  ) : (
    <Badge className={cn("shrink-0", releasePhaseColor(release.phase))}>
      {release.phase ? RELEASE_PHASE_LABELS[release.phase] : "Yet to Start"}
    </Badge>
  );

  return (
    <Card
      className={cn(
        releasePlatformCardClass(platform),
        isCompleted && !isExpanded && "py-3",
        "w-full min-w-0",
        detailPanel && "p-3",
        className
      )}
    >
      {detailPanel ? (
        <div className="space-y-2">
          {detailDateLabel && (
            <p className="text-[11px] font-medium text-muted">{detailDateLabel}</p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <h3
              className={cn(
                "min-w-0 text-sm font-semibold leading-tight",
                releasePlatformTitleClass(platform)
              )}
            >
              {release.name}
            </h3>
            <div className="shrink-0">{phaseControl}</div>
          </div>
        </div>
      ) : (
        // Header is a div so the phase <select> is not nested inside the toggle <button>.
        <div className="w-full text-left">
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-2.5 text-left"
              aria-expanded={isExpanded}
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted transition-transform",
                  isExpanded && "rotate-180"
                )}
              />
              <h3 className={cn("font-medium", releasePlatformTitleClass(platform))}>
                {release.name}
              </h3>
              {!isExpanded && (
                <time
                  dateTime={release.targetDate}
                  className={releasePlatformDateClass(platform)}
                >
                  {formatReleaseDate(release.targetDate)}
                </time>
              )}
            </button>
            {phaseControl}
          </div>

          {!isCompleted && (
            <div
              className="mt-3 cursor-pointer pl-0 sm:pl-6"
              onClick={() => setExpanded((open) => !open)}
            >
              {!isExpanded &&
                (sprintItems.length > 0 ? (
                  <ul className="list-inside list-disc text-sm text-muted">
                    {sprintItems.map((item, index) => (
                      <li key={`${item}-${index}`}>{item}</li>
                    ))}
                  </ul>
                ) : release.notes ? (
                  <p className="text-sm text-muted">{release.notes}</p>
                ) : onUpdate ? (
                  <p className="text-sm italic text-muted">No sprint items yet</p>
                ) : null)}
              {release.blockers.length > 0 && (
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <div>
                    <p className="text-xs font-medium text-foreground">Blockers</p>
                    <ul className="mt-1 text-sm text-muted">
                      {release.blockers.map((b) => (
                        <li key={b}>· {b}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {isExpanded && (
        <div
          className={cn(
            "border-t border-border pt-3",
            detailPanel ? "mt-2.5 space-y-2.5" : "mt-3 space-y-3"
          )}
        >
          {onUpdate ? (
            <div className={sectionClass}>
              <label
                htmlFor={`sprint-item-input-${release.id}`}
                className="mb-1 block text-[11px] font-medium text-muted"
              >
                Sprint Items
              </label>
              <div className="flex gap-1.5">
                <input
                  id={`sprint-item-input-${release.id}`}
                  type="text"
                  value={newSprintItem}
                  onChange={(e) => setNewSprintItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSprintItem();
                    }
                  }}
                  placeholder="Add item…"
                  className={cn(
                    sprintInputClass,
                    detailPanel && "px-2 py-1.5 text-xs"
                  )}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={addSprintItem}
                  disabled={!newSprintItem.trim()}
                >
                  <Plus className={detailPanel ? "h-3.5 w-3.5" : "h-4 w-4"} />
                </Button>
              </div>
              {sprintItemsDraft.length > 0 ? (
                <ul
                  className={cn(
                    "mt-1.5 space-y-0.5 rounded-lg border border-border bg-white px-1.5 py-1",
                    detailPanel && "max-h-36 overflow-y-auto overscroll-contain"
                  )}
                >
                  {sprintItemsDraft.map((item, index) => (
                    <li
                      key={`${item}-${index}`}
                      className="flex items-center justify-between gap-1.5 rounded px-1 py-0.5 text-xs hover:bg-slate-50"
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
          ) : (
            <div className={sectionClass}>
              <p className="mb-1 text-[11px] font-medium text-muted">Sprint Items</p>
              {sprintItems.length > 0 ? (
                <ul className="list-inside list-disc text-sm text-muted">
                  {sprintItems.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">—</p>
              )}
            </div>
          )}
          <div className={sectionClass}>
            <div
              className={cn(
                "grid w-full gap-1.5",
                detailPanel ? "grid-cols-1" : "grid-cols-2"
              )}
            >
              <div
                className={cn(
                  "rounded-md border border-border bg-white px-2 py-1.5",
                  platform && "border-t-2",
                  platform === "android" && "border-t-emerald-500",
                  platform === "ios" && "border-t-blue-500"
                )}
              >
                <p className="text-[9px] font-medium uppercase tracking-wider text-muted">
                  Planned
                </p>
                {onUpdate ? (
                  <DateCommitInput
                    value={release.targetDate ?? ""}
                    onCommit={(value) => onUpdate({ targetDate: value || null })}
                    className="mt-0.5 w-full rounded border border-border bg-white px-1.5 py-0.5 text-xs font-semibold text-foreground outline-none focus:border-accent"
                    aria-label="Planned release date"
                  />
                ) : (
                  <p className="mt-0.5 text-xs font-semibold leading-tight text-foreground">
                    {formatReleaseDate(release.targetDate)}
                  </p>
                )}
              </div>
              <div className="rounded-md border border-border bg-white px-2 py-1.5">
                <p className="text-[9px] font-medium uppercase tracking-wider text-muted">
                  Actual
                </p>
                {onUpdate ? (
                  <DateCommitInput
                    value={release.actualDate ?? ""}
                    onCommit={(value) => onUpdate({ actualDate: value || null })}
                    className={cn(
                      "mt-0.5 w-full rounded border border-border bg-white px-1.5 py-0.5 text-xs outline-none focus:border-accent",
                      release.actualDate
                        ? "font-semibold text-foreground"
                        : "text-muted"
                    )}
                    aria-label="Actual release date"
                  />
                ) : (
                  <p
                    className={cn(
                      "mt-0.5 text-xs leading-tight",
                      release.actualDate
                        ? "font-semibold text-foreground"
                        : "text-muted"
                    )}
                  >
                    {release.actualDate ? formatReleaseDate(release.actualDate) : "Pending"}
                  </p>
                )}
              </div>
            </div>
          </div>

          {isCompleted && release.blockers.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div>
                <p className="text-xs font-medium text-foreground">Blockers</p>
                <ul className="mt-1 text-sm text-muted">
                  {release.blockers.map((b) => (
                    <li key={b}>· {b}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {onUpdate ? (
            <div className={sectionClass}>
              <label
                htmlFor={`sprint-note-${release.id}`}
                className="mb-1 block text-[11px] font-medium text-muted"
              >
                Sprint note
              </label>
              <textarea
                id={`sprint-note-${release.id}`}
                rows={detailPanel ? 2 : 2}
                value={sprintNoteDraft}
                onChange={(e) => setSprintNoteDraft(e.target.value)}
                onBlur={() => {
                  const trimmed = sprintNoteDraft.trim();
                  const next = trimmed || null;
                  if (next !== (release.sprintNote ?? null)) {
                    onUpdate({ sprintNote: next });
                  }
                }}
                placeholder="Planning context…"
                className={cn(
                  sprintInputClass,
                  "resize-none",
                  detailPanel && "px-2 py-1.5 text-xs"
                )}
              />
            </div>
          ) : release.sprintNote ? (
            <div className={sectionClass}>
              <p className="mb-1 text-[11px] font-medium text-muted">Sprint note</p>
              <p className="whitespace-pre-wrap text-sm text-muted">{release.sprintNote}</p>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
