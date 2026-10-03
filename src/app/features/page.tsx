"use client";

import { useState } from "react";
import { PageHeader, ErrorBanner, PageSkeleton, SectionTitle } from "@/components/ui";
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
  const { store, loading, error, clearError, reload } = useDashboard();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (loading) {
    return <PageSkeleton label="Loading features..." />;
  }

  if (!store) {
    return <ErrorBanner message={error ?? "Failed to load features"} />;
  }

  const features = sortFeatures(store.features ?? []);
  const plotBacklog = store.plotBacklog ?? [];

  async function handlePlotBacklogChange() {
    await reload();
    notifyStoreUpdated();
  }

  return (
    <div>
      {error && <ErrorBanner message={error} onDismiss={clearError} />}
      <PageHeader
        title="Feature tracker"
        module="features"
        description="In-progress features, upcoming sprint queue, milestones, and function effort"
        action={<AddFeatureButton onClick={() => setDialogOpen(true)} />}
      />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="min-w-0">
          <SectionTitle count={features.length}>In progress</SectionTitle>
          <FeatureList features={features} onChanged={reload} />
        </section>

        <section className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <SectionTitle count={plotBacklog.length}>Upcoming items</SectionTitle>
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
