"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronUp, Layers, Pencil, Plus, Timer, Trash2 } from "lucide-react";
import type { Feature } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FieldError,
  Input,
  Label,
  Modal,
  fieldClasses,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { DateCommitInput } from "@/components/ui/DateCommitInput";
import {
  createFeature,
  deleteFeature,
  updateFeature,
} from "@/lib/api-client";
import { notifyStoreUpdated } from "@/lib/store-events";
import { formatFeatureDate } from "@/lib/feature-utils";
import { FunctionEffortGrid } from "@/components/features/FunctionEffortGrid";
import { sumEffortDays } from "@/lib/effort-utils";

function FeatureDialog({
  open,
  onClose,
  onSaved,
  feature,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  feature?: Feature;
}) {
  const isEdit = !!feature;
  // Latest feature without making it an effect dependency (see seeding effect).
  const featureRef = useRef(feature);
  useEffect(() => {
    featureRef.current = feature;
  }, [feature]);
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [scopeClosureDate, setScopeClosureDate] = useState("");
  const [preProductionClosureDate, setPreProductionClosureDate] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
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
    const feature = featureRef.current;
    if (feature) {
      setTitle(feature.title);
      setStartDate(feature.startDate ?? "");
      setScopeClosureDate(feature.scopeClosureDate ?? "");
      setPreProductionClosureDate(feature.preProductionClosureDate ?? "");
      setReleaseDate(feature.releaseDate ?? "");
    } else {
      setTitle("");
      setStartDate(format(new Date(), "yyyy-MM-dd"));
      setScopeClosureDate("");
      setPreProductionClosureDate("");
      setReleaseDate("");
    }
    setError(null);
    // Seed only when the dialog opens or targets a different feature, so store
    // reloads don't wipe unsaved edits.
  }, [open, feature?.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isEdit && feature) {
        await updateFeature(feature.id, {
          title: title.trim(),
          startDate: startDate || null,
          scopeClosureDate: scopeClosureDate || null,
          preProductionClosureDate: preProductionClosureDate || null,
          releaseDate: releaseDate || null,
        });
      } else {
        await createFeature({
          title: title.trim(),
          startDate: startDate || undefined,
          scopeClosureDate: scopeClosureDate || undefined,
          preProductionClosureDate: preProductionClosureDate || undefined,
          releaseDate: releaseDate || undefined,
        });
      }

      onClose();
      onSaved();
      notifyStoreUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save feature");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <Modal
      onClose={onClose}
      title={isEdit ? "Edit feature" : "Track feature"}
      titleId="feature-dialog-title"
      module="features"
      onSubmit={handleSubmit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !title.trim()}>
            {submitting ? "Saving…" : isEdit ? "Save changes" : "Track feature"}
          </Button>
        </>
      }
    >
            {!isEdit && (
              <p className="text-sm text-muted">
                Set milestone dates as you track the feature through scope, pre-production, and
                release.
              </p>
            )}

            <div>
              <Label htmlFor="feature-title">Feature name</Label>
              <Input
                id="feature-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Bubble Pop v2"
                required
                autoFocus
              />
            </div>

            <div>
              <Label htmlFor="start-date">Start date</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="scope-closure">Scope closure date</Label>
              <Input
                id="scope-closure"
                type="date"
                value={scopeClosureDate}
                onChange={(e) => setScopeClosureDate(e.target.value)}
                min={startDate || undefined}
              />
            </div>

            <div>
              <Label htmlFor="pre-prod-closure">Pre-production closure date</Label>
              <Input
                id="pre-prod-closure"
                type="date"
                value={preProductionClosureDate}
                onChange={(e) => setPreProductionClosureDate(e.target.value)}
                min={scopeClosureDate || startDate || undefined}
              />
            </div>

            <div>
              <Label htmlFor="release-date">Release date</Label>
              <Input
                id="release-date"
                type="date"
                value={releaseDate}
                onChange={(e) => setReleaseDate(e.target.value)}
                min={preProductionClosureDate || scopeClosureDate || startDate || undefined}
              />
            </div>

            {error && <FieldError>{error}</FieldError>}
    </Modal>
  );
}

// Sequence colors so the milestone order reads at a glance.
const MILESTONE_BARS = {
  start: "shadow-[inset_2px_0_0_var(--info)]",
  scope: "shadow-[inset_2px_0_0_var(--signal)]",
  preprod: "shadow-[inset_2px_0_0_var(--caution)]",
  release: "shadow-[inset_2px_0_0_var(--success)]",
} as const;

function MilestonePill({
  label,
  date,
  editable,
  onDateChange,
  bar,
}: {
  label: string;
  date?: string;
  editable?: boolean;
  onDateChange?: (value: string) => void | Promise<void>;
  bar: keyof typeof MILESTONE_BARS;
}) {
  return (
    <div className={cn("min-w-0 flex-1 rounded-lg bg-surface-2 px-2.5 py-2", MILESTONE_BARS[bar])}>
      <p className="break-words text-[11px] font-semibold uppercase leading-[14px] tracking-[0.04em] text-muted">{label}</p>
      {editable && onDateChange ? (
        <DateCommitInput
          value={date ?? ""}
          onCommit={onDateChange}
          className={cn(
            fieldClasses({ size: "sm" }),
            "-mx-1 mt-0.5 w-[calc(100%+0.5rem)] border-transparent bg-transparent px-1 font-semibold shadow-none hover:border-input focus:bg-card"
          )}
          aria-label={label}
        />
      ) : (
        <p className="mt-0.5 truncate text-xs font-semibold">{formatFeatureDate(date)}</p>
      )}
    </div>
  );
}

function FeatureCard({
  feature,
  onChanged,
}: {
  feature: Feature;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDateChange(
    field: "startDate" | "scopeClosureDate" | "preProductionClosureDate" | "releaseDate",
    value: string
  ) {
    setError(null);
    try {
      await updateFeature(feature.id, { [field]: value || null });
      onChanged();
      notifyStoreUpdated();
    } catch (err) {
      // Inputs are controlled by the stored value, so a failed save reverts the field.
      setError(err instanceof Error ? err.message : "Failed to update feature");
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${feature.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteFeature(feature.id);
      onChanged();
      notifyStoreUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete feature");
    } finally {
      setDeleting(false);
    }
  }

  async function handleFunctionCostsSave(
    costs: NonNullable<Feature["functionCosts"]>
  ): Promise<boolean> {
    setError(null);
    try {
      await updateFeature(feature.id, {
        functionCosts: costs.length > 0 ? costs : [],
      });
      onChanged();
      notifyStoreUpdated();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save function effort");
      return false;
    }
  }

  const totalEst = sumEffortDays(feature.functionCosts, "effortDays");
  const hasEffort = (feature.functionCosts?.length ?? 0) > 0;

  return (
    <>
      <Card className="overflow-hidden p-0 sm:p-0">
        <div className="px-4 py-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="group flex w-full items-start justify-between gap-2 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="break-words font-display text-[15px] font-semibold text-foreground">
                  {feature.title}
                </h3>
                {hasEffort && (
                  <Badge tone="neutral">
                    <Timer className="h-3 w-3" />
                    Est {totalEst}d
                  </Badge>
                )}
              </div>
            </div>
            <span className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-control text-muted transition-colors group-hover:bg-surface-2 group-hover:text-foreground">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </button>

          <div className="@container mt-2.5 flex items-start gap-1.5">
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5 @[40rem]:grid-cols-4">
              <MilestonePill
                bar="start"
                label="Start"
                date={feature.startDate}
                editable
                onDateChange={(value) => handleDateChange("startDate", value)}
              />
              <MilestonePill
                bar="scope"
                label="Scope closure"
                date={feature.scopeClosureDate}
                editable
                onDateChange={(value) => handleDateChange("scopeClosureDate", value)}
              />
              <MilestonePill
                bar="preprod"
                label="Pre-prod closure"
                date={feature.preProductionClosureDate}
                editable
                onDateChange={(value) => handleDateChange("preProductionClosureDate", value)}
              />
              <MilestonePill
                bar="release"
                label="Release date"
                date={feature.releaseDate}
                editable
                onDateChange={(value) => handleDateChange("releaseDate", value)}
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditOpen(true)}
              className="shrink-0"
              aria-label="Edit feature dates"
            >
              <Pencil />
            </Button>
          </div>
          {error && <FieldError className="mt-2">{error}</FieldError>}
        </div>

        {expanded && (
          <div className="border-t border-border px-4 pb-4 pt-3">
            <div className="mb-3 rounded-xl bg-surface-2/70 p-3">
              <FunctionEffortGrid
                idPrefix={`feature-${feature.id}`}
                functionCosts={feature.functionCosts}
                onSave={handleFunctionCostsSave}
              />
            </div>

            <div className="flex justify-end">
              <Button size="sm" variant="danger" onClick={handleDelete} disabled={deleting}>
                <Trash2 />
                Delete
              </Button>
            </div>
          </div>
        )}
      </Card>

      <FeatureDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={onChanged}
        feature={feature}
      />
    </>
  );
}

export function FeatureList({
  features,
  onChanged,
}: {
  features: Feature[];
  onChanged: () => void;
}) {
  if (features.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Layers}
          title="No features in progress"
          description="Start a feature to set milestone dates and add function effort."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {features.map((feature) => (
        <FeatureCard key={feature.id} feature={feature} onChanged={onChanged} />
      ))}
    </div>
  );
}

export function NewFeatureDialog({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  return <FeatureDialog open={open} onClose={onClose} onSaved={onAdded} />;
}

export function AddFeatureButton({ onClick }: { onClick: () => void }) {
  return (
    <Button onClick={onClick} className="w-full sm:w-auto">
      <Plus />
      Track feature
    </Button>
  );
}
