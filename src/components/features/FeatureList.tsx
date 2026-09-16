"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2, X } from "lucide-react";
import type { Feature } from "@/lib/types";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import {
  createFeature,
  deleteFeature,
  updateFeature,
} from "@/lib/api-client";
import { notifyStoreUpdated } from "@/lib/store-events";
import { formatFeatureDate } from "@/lib/feature-utils";
import { FunctionEffortGrid } from "@/components/features/FunctionEffortGrid";
import { sumEffortDays } from "@/lib/effort-utils";

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-accent";

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
    if (feature) {
      setTitle(feature.title);
      setStartDate(feature.startDate ?? "");
      setScopeClosureDate(feature.scopeClosureDate ?? "");
      setPreProductionClosureDate(feature.preProductionClosureDate ?? "");
      setReleaseDate(feature.releaseDate ?? "");
    } else {
      setTitle("");
      setStartDate(new Date().toISOString().split("T")[0]);
      setScopeClosureDate("");
      setPreProductionClosureDate("");
      setReleaseDate("");
    }
    setError(null);
  }, [open, feature]);

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
        aria-labelledby="feature-dialog-title"
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="feature-dialog-title" className="text-lg font-semibold text-foreground">
            {isEdit ? "Edit feature" : "Track feature"}
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

        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          <div className="space-y-4 overflow-y-auto px-5 py-4">
            {!isEdit && (
              <p className="text-sm text-muted">
                Set milestone dates as you track the feature through scope, pre-production, and
                release.
              </p>
            )}

            <div>
              <label htmlFor="feature-title" className="mb-1 block text-sm font-medium">
                Feature name
              </label>
              <input
                id="feature-title"
                className={inputClass}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Bubble Pop v2"
                required
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="start-date" className="mb-1 block text-sm font-medium">
                Start date
              </label>
              <input
                id="start-date"
                type="date"
                className={inputClass}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="scope-closure" className="mb-1 block text-sm font-medium">
                Scope closure date
              </label>
              <input
                id="scope-closure"
                type="date"
                className={inputClass}
                value={scopeClosureDate}
                onChange={(e) => setScopeClosureDate(e.target.value)}
                min={startDate || undefined}
              />
            </div>

            <div>
              <label htmlFor="pre-prod-closure" className="mb-1 block text-sm font-medium">
                Pre-production closure date
              </label>
              <input
                id="pre-prod-closure"
                type="date"
                className={inputClass}
                value={preProductionClosureDate}
                onChange={(e) => setPreProductionClosureDate(e.target.value)}
                min={scopeClosureDate || startDate || undefined}
              />
            </div>

            <div>
              <label htmlFor="release-date" className="mb-1 block text-sm font-medium">
                Release date
              </label>
              <input
                id="release-date"
                type="date"
                className={inputClass}
                value={releaseDate}
                onChange={(e) => setReleaseDate(e.target.value)}
                min={preProductionClosureDate || scopeClosureDate || startDate || undefined}
              />
            </div>

            {error && <p className="text-sm text-warning">{error}</p>}
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
            <Button variant="secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !title.trim()}>
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Track feature"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MilestonePill({
  label,
  date,
  editable,
  onDateChange,
}: {
  label: string;
  date?: string;
  editable?: boolean;
  onDateChange?: (value: string) => void;
}) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-border bg-slate-50 px-2 py-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</p>
      {editable && onDateChange ? (
        <input
          type="date"
          value={date ?? ""}
          onChange={(e) => onDateChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 w-full rounded border border-border bg-white px-1 py-0.5 text-xs font-semibold outline-none focus:border-accent"
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

  async function handleDateChange(
    field: "startDate" | "scopeClosureDate" | "preProductionClosureDate" | "releaseDate",
    value: string
  ) {
    await updateFeature(feature.id, { [field]: value || null });
    onChanged();
    notifyStoreUpdated();
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${feature.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteFeature(feature.id);
      onChanged();
      notifyStoreUpdated();
    } finally {
      setDeleting(false);
    }
  }

  async function handleFunctionCostsSave(
    costs: NonNullable<Feature["functionCosts"]>
  ) {
    await updateFeature(feature.id, {
      functionCosts: costs.length > 0 ? costs : [],
    });
    onChanged();
    notifyStoreUpdated();
  }

  const totalEst = sumEffortDays(feature.functionCosts, "effortDays");
  const hasEffort = (feature.functionCosts?.length ?? 0) > 0;

  return (
    <>
      <Card className="overflow-hidden p-0">
        <div className="px-3 py-2.5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-start justify-between gap-2 text-left"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="text-sm font-semibold text-foreground">{feature.title}</h3>
                {hasEffort && (
                  <Badge className="border-slate-200 bg-slate-50 text-muted">
                    Est {totalEst}d
                  </Badge>
                )}
              </div>
            </div>
            {expanded ? (
              <ChevronUp className="mt-1 h-5 w-5 shrink-0 text-muted" />
            ) : (
              <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-muted" />
            )}
          </button>

          <div className="mt-2 flex items-start gap-1.5">
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5 sm:grid-cols-4">
              <MilestonePill
                label="Start"
                date={feature.startDate}
                editable
                onDateChange={(value) => handleDateChange("startDate", value)}
              />
              <MilestonePill
                label="Scope closure"
                date={feature.scopeClosureDate}
                editable
                onDateChange={(value) => handleDateChange("scopeClosureDate", value)}
              />
              <MilestonePill
                label="Pre-prod closure"
                date={feature.preProductionClosureDate}
                editable
                onDateChange={(value) => handleDateChange("preProductionClosureDate", value)}
              />
              <MilestonePill
                label="Release date"
                date={feature.releaseDate}
                editable
                onDateChange={(value) => handleDateChange("releaseDate", value)}
              />
            </div>
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="shrink-0 rounded-md p-1 text-muted hover:bg-slate-100 hover:text-foreground"
              aria-label="Edit feature dates"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>
        </div>

        {expanded && (
          <div className="border-t border-border px-3 pb-3 pt-2.5">
            <div className="mb-2.5 rounded-lg border border-border/80 bg-slate-50/40 p-2">
              <FunctionEffortGrid
                idPrefix={`feature-${feature.id}`}
                functionCosts={feature.functionCosts}
                onSave={handleFunctionCostsSave}
              />
            </div>

            <div className="flex justify-end">
              <Button size="sm" variant="danger" onClick={handleDelete} disabled={deleting}>
                <Trash2 className="mr-1.5 h-4 w-4" />
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
    <Button size="sm" onClick={onClick}>
      <Plus className="mr-1.5 h-4 w-4" />
      Track feature
    </Button>
  );
}
