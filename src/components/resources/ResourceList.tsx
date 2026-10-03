"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Pencil, Trash2, X } from "lucide-react";
import type { ProjectResource, ProjectResourceType } from "@/lib/types";
import { Badge, Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  createProjectResource,
  deleteProjectResource,
  updateProjectResource,
} from "@/lib/api-client";
import { notifyStoreUpdated } from "@/lib/store-events";
import { detectProjectResourceType } from "@/lib/utils";

const TYPE_LABELS: Record<ProjectResourceType, string> = {
  doc: "Doc",
  figma: "Figma",
  link: "Link",
  sheets: "Sheets",
  slides: "Slides",
};

const TYPE_DETECTED_HINTS: Record<ProjectResourceType, string> = {
  doc: "Doc detected",
  figma: "Figma file detected",
  link: "Link detected",
  sheets: "Sheets detected",
  slides: "Slides detected",
};

const TYPE_COLORS: Record<ProjectResourceType, string> = {
  doc: "border-slate-200 bg-slate-50 text-slate-600",
  figma: "border-violet-200 bg-violet-50 text-violet-700",
  link: "border-accent/30 bg-accent/5 text-accent",
  sheets: "border-emerald-200 bg-emerald-50 text-emerald-700",
  slides: "border-amber-200 bg-amber-50 text-amber-700",
};

const actionButtonClass =
  "shrink-0 rounded p-1 text-muted hover:bg-slate-100 hover:text-foreground";

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-accent";

function ResourceDialog({
  open,
  onClose,
  onSaved,
  resource,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  resource?: ProjectResource;
}) {
  const isEdit = !!resource;
  // Latest resource without making it an effect dependency (see seeding effect).
  const resourceRef = useRef(resource);
  useEffect(() => {
    resourceRef.current = resource;
  }, [resource]);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<ProjectResourceType>("link");
  const [typeOverridden, setTypeOverridden] = useState(false);
  const [description, setDescription] = useState("");
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
    const resource = resourceRef.current;
    if (resource) {
      const detected = detectProjectResourceType(resource.url);
      setTitle(resource.title);
      setUrl(resource.url);
      setType(resource.type);
      setTypeOverridden(resource.type !== detected);
      setDescription(resource.description ?? "");
    } else {
      setTitle("");
      setUrl("");
      setType("link");
      setTypeOverridden(false);
      setDescription("");
    }
    setError(null);
    // Seed only when the dialog opens or targets a different resource, so store
    // reloads don't wipe unsaved edits.
  }, [open, resource?.id]);

  function handleUrlChange(nextUrl: string) {
    setUrl(nextUrl);
    if (!typeOverridden) {
      setType(detectProjectResourceType(nextUrl));
    }
  }

  function handleClose() {
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        url: url.trim(),
        type,
        description: description.trim() || undefined,
      };

      if (isEdit && resource) {
        await updateProjectResource(resource.id, payload);
      } else {
        await createProjectResource(payload);
      }

      onClose();
      onSaved();
      notifyStoreUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save resource");
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
        aria-labelledby="resource-dialog-title"
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="resource-dialog-title" className="text-lg font-semibold text-foreground">
            {isEdit ? "Edit link" : "Add link"}
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
              placeholder="Sprint spec, design file…"
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">URL</label>
            <input
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="docs.google.com/… or figma.com/…"
              className={inputClass}
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Type</label>
              <select
                value={type}
                onChange={(e) => {
                  setTypeOverridden(true);
                  setType(e.target.value as ProjectResourceType);
                }}
                className={inputClass}
              >
                <option value="doc">Doc</option>
                <option value="figma">Figma</option>
                <option value="sheets">Sheets</option>
                <option value="slides">Slides</option>
                <option value="link">Link</option>
              </select>
              {url.trim() && (
                <p className="mt-1 text-[11px] text-muted">
                  {typeOverridden
                    ? "Changed manually — edit anytime"
                    : TYPE_DETECTED_HINTS[type]}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Note (optional)
              </label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this is for"
                className={inputClass}
              />
            </div>
          </div>
          {error && <p className="text-sm text-warning">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="sm" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AddResourceDialog({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  return <ResourceDialog open={open} onClose={onClose} onSaved={onAdded} />;
}

export function ResourceList({
  resources,
  onChanged,
}: {
  resources: ProjectResource[];
  onChanged: () => void;
}) {
  if (resources.length === 0) {
    return (
      <Card className="py-8 text-center">
        <p className="text-sm text-muted">No docs or links yet. Use Add link to get started.</p>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-lg overflow-hidden p-0">
      <ul className="divide-y divide-border">
        {resources.map((resource) => (
          <ResourceRow key={resource.id} resource={resource} onChanged={onChanged} />
        ))}
      </ul>
    </Card>
  );
}

function ResourceRow({
  resource,
  onChanged,
}: {
  resource: ProjectResource;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteProjectResource(resource.id);
      onChanged();
      notifyStoreUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete link");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <li className="group flex items-center gap-1.5 px-2.5 py-1.5">
        <Badge
          className={cn(
            TYPE_COLORS[resource.type],
            "shrink-0 px-1.5 py-0 text-[10px] font-medium"
          )}
        >
          {TYPE_LABELS[resource.type]}
        </Badge>

        <a
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer"
          title={resource.url}
          className="min-w-0 flex-1 truncate text-sm font-medium text-foreground hover:text-accent"
        >
          {resource.title}
        </a>

        {resource.description && (
          <span className="hidden max-w-[8rem] shrink truncate text-xs text-muted lg:inline">
            {resource.description}
          </span>
        )}

        <div className="flex shrink-0 items-center">
          <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(actionButtonClass, "text-muted hover:text-accent")}
            aria-label={`Open ${resource.title}`}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={cn(actionButtonClass, "hover:text-accent")}
            aria-label={`Edit ${resource.title}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className={cn(actionButtonClass, "hover:text-warning")}
            aria-label={`Delete ${resource.title}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </li>
      {error && <li className="px-2.5 py-1 text-xs text-warning">{error}</li>}

      <ResourceDialog
        open={editing}
        onClose={() => setEditing(false)}
        onSaved={onChanged}
        resource={resource}
      />
    </>
  );
}
