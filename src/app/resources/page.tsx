"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader, Button } from "@/components/ui";
import { useDashboard } from "@/lib/use-dashboard";
import type { ProjectResourceType } from "@/lib/types";
import { AddResourceDialog, ResourceList } from "@/components/resources/ResourceList";
import { cn } from "@/lib/cn";

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
  const { store, loading, error, reload } = useDashboard();
  const [filter, setFilter] = useState<Filter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);

  if (loading) {
    return <div className="text-sm text-muted">Loading resources...</div>;
  }

  if (error || !store) {
    return <div className="text-sm text-warning">{error ?? "Failed to load resources"}</div>;
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
      <PageHeader
        title="Resources"
        description="Docs, Figma, Sheets, Slides, and project links in one place"
        action={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add link
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap gap-1.5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              filter === tab.id
                ? "bg-brand text-white"
                : "text-muted hover:bg-slate-100"
            )}
          >
            {tab.label}
            <span className="ml-1 tabular-nums opacity-80">{counts[tab.id]}</span>
          </button>
        ))}
      </div>

      <ResourceList resources={filtered} onChanged={reload} />

      <AddResourceDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onAdded={reload}
      />
    </div>
  );
}
