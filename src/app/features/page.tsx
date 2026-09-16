"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui";
import { useDashboard } from "@/lib/use-dashboard";
import { sortFeatures } from "@/lib/feature-utils";
import {
  AddFeatureButton,
  FeatureList,
  NewFeatureDialog,
} from "@/components/features/FeatureList";
import { PlotBacklogPanel } from "@/components/features/PlotBacklogPanel";
import { notifyStoreUpdated } from "@/lib/store-events";

export default function FeaturesPage() {
  const { store, loading, error, reload } = useDashboard();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (loading) {
    return <div className="text-sm text-muted">Loading features...</div>;
  }

  if (error || !store) {
    return <div className="text-sm text-warning">{error ?? "Failed to load features"}</div>;
  }

  const features = sortFeatures(store.features ?? []);
  const plotBacklog = store.plotBacklog ?? [];

  async function handlePlotBacklogChange() {
    await reload();
    notifyStoreUpdated();
  }

  return (
    <div>
      <PageHeader
        title="Feature tracker"
        description="In-progress features, upcoming sprint queue, milestones, and function effort"
        action={<AddFeatureButton onClick={() => setDialogOpen(true)} />}
      />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="min-w-0 space-y-3">
          <h2 className="text-sm font-medium text-muted">In progress</h2>
          <FeatureList features={features} onChanged={reload} />
        </section>

        <section className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <h2 className="mb-3 text-sm font-medium text-muted">Upcoming items</h2>
          <PlotBacklogPanel items={plotBacklog} onChange={handlePlotBacklogChange} />
        </section>
      </div>

      <NewFeatureDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onAdded={reload}
      />
    </div>
  );
}
