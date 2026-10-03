"use client";

import { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  Figma,
  FileText,
  Link2,
  Pencil,
  Presentation,
  ScanSearch,
  Sheet,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { ProjectResource, ProjectResourceType } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FieldError,
  Input,
  Label,
  Modal,
  Select,
  buttonClasses,
} from "@/components/ui";
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

const TYPE_CHIPS: Record<ProjectResourceType, { icon: LucideIcon; className: string }> = {
  doc: { icon: FileText, className: "bg-info-soft text-info" },
  figma: { icon: Figma, className: "bg-accent-soft text-accent" },
  sheets: { icon: Sheet, className: "bg-success-soft text-success" },
  slides: { icon: Presentation, className: "bg-caution-soft text-caution" },
  link: { icon: Link2, className: "bg-surface-2 text-muted" },
};

// Always visible on touch; on sm+ revealed on row hover or keyboard focus.
const actionButtonClass = cn(
  buttonClasses({ variant: "ghost", size: "icon" }),
  "opacity-100 transition-[opacity,background-color,color] sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
);

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
    <Modal
      onClose={handleClose}
      title={isEdit ? "Edit link" : "Add link"}
      titleId="resource-dialog-title"
      module="resources"
      onSubmit={handleSubmit}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
          <div>
            <Label htmlFor="resource-title">Title</Label>
            <Input
              id="resource-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Sprint spec, design file…"
              required
            />
          </div>
          <div>
            <Label htmlFor="resource-url">URL</Label>
            <Input
              id="resource-url"
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="docs.google.com/… or figma.com/…"
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="resource-type">Type</Label>
              <Select
                id="resource-type"
                value={type}
                onChange={(e) => {
                  setTypeOverridden(true);
                  setType(e.target.value as ProjectResourceType);
                }}
              >
                <option value="doc">Doc</option>
                <option value="figma">Figma</option>
                <option value="sheets">Sheets</option>
                <option value="slides">Slides</option>
                <option value="link">Link</option>
              </Select>
              {url.trim() &&
                (typeOverridden ? (
                  <p className="mt-1.5 text-[11px] text-muted">Changed manually — edit anytime</p>
                ) : (
                  <Badge tone="info" className="mt-1.5">
                    <ScanSearch className="h-3 w-3" />
                    {TYPE_DETECTED_HINTS[type]}
                  </Badge>
                ))}
            </div>
            <div>
              <Label htmlFor="resource-note">Note (optional)</Label>
              <Input
                id="resource-note"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this is for"
              />
            </div>
          </div>
          {error && <FieldError>{error}</FieldError>}
    </Modal>
  );
}

function TypeIcon({ type }: { type: ProjectResourceType }) {
  const Icon = TYPE_CHIPS[type].icon;
  return <Icon aria-hidden="true" className="h-4 w-4" />;
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
      <Card className="max-w-3xl">
        <EmptyState icon={Link2} title="No docs or links yet. Use Add link to get started." />
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-3xl overflow-hidden p-0 sm:p-0">
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
      <li className="group flex h-12 items-center gap-3 px-3 transition-colors hover:bg-surface-2/60">
        <span
          title={TYPE_LABELS[resource.type]}
          className={cn(
            "grid h-7 w-7 shrink-0 place-items-center rounded-lg",
            TYPE_CHIPS[resource.type].className
          )}
        >
          <TypeIcon type={resource.type} />
          <span className="sr-only">{TYPE_LABELS[resource.type]}</span>
        </span>

        <a
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer"
          title={resource.url}
          className="min-w-0 flex-1 truncate rounded-sm text-sm font-semibold text-foreground transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          {resource.title}
        </a>

        {resource.description && (
          <span className="hidden max-w-[14rem] shrink truncate text-xs text-muted sm:inline">
            {resource.description}
          </span>
        )}

        <div className="-mr-1 flex shrink-0 items-center">
          <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(actionButtonClass, "hover:text-accent")}
            aria-label={`Open ${resource.title}`}
          >
            <ExternalLink />
          </a>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={cn(actionButtonClass, "hover:text-accent")}
            aria-label={`Edit ${resource.title}`}
          >
            <Pencil />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className={cn(actionButtonClass, "hover:bg-danger-soft hover:text-danger")}
            aria-label={`Delete ${resource.title}`}
          >
            <Trash2 />
          </button>
        </div>
      </li>
      {error && <li className="px-3 py-1.5 text-xs font-medium text-danger">{error}</li>}

      <ResourceDialog
        open={editing}
        onClose={() => setEditing(false)}
        onSaved={onChanged}
        resource={resource}
      />
    </>
  );
}
