"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader, Button, ErrorBanner, PageSkeleton, Tabs } from "@/components/ui";
import { useDashboard } from "@/lib/use-dashboard";
import type { ProjectResourceType } from "@/lib/types";
import { AddResourceDialog, ResourceList } from "@/components/resources/ResourceList";

type Filter = "all" | ProjectResourceType;

const TABS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "doc", label: "Docs" },
  { id: "figma", label: "Figma" },
  { id: "sheets", label: "Sheets" },
  { id: "slides", label: "Slides" },
  { id: "link", label: "Links" },
];

export default function ResourcesPage() {
  const { store, loading, error, clearError, reload } = useDashboard();
  const [filter, setFilter] = useState<Filter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);

  if (loading) {
    return <PageSkeleton label="Loading resources..." />;
  }

  if (!store) {
    return <ErrorBanner message={error ?? "Failed to load resources"} />;
  }

  const resources = store.projectResources ?? [];
  const filtered =
    filter === "all" ? resources : resources.filter((r) => r.type === filter);

  const counts: Record<Filter, number> = {
    all: resources.length,
    doc: resources.filter((r) => r.type === "doc").length,
    figma: resources.filter((r) => r.type === "figma").length,
    sheets: resources.filter((r) => r.type === "sheets").length,
    slides: resources.filter((r) => r.type === "slides").length,
    link: resources.filter((r) => r.type === "link").length,
  };

  return (
    <div>
      {error && <ErrorBanner message={error} onDismiss={clearError} />}
      <PageHeader
        title="Resources"
        module="resources"
        description="Docs, Figma, Sheets, Slides, and project links in one place"
        action={
          <Button onClick={() => setDialogOpen(true)} className="w-full sm:w-auto">
            <Plus />
            Add link
          </Button>
        }
      />

      <Tabs
        className="mb-4"
        aria-label="Filter resources"
        value={filter}
        onChange={setFilter}
        items={TABS.map((tab) => ({ ...tab, count: counts[tab.id] }))}
      />

      <ResourceList resources={filtered} onChanged={reload} />

      <AddResourceDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onAdded={reload}
      />
    </div>
  );
}
