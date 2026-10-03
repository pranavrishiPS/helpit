"use client";

import { useEffect, useState } from "react";
import { GripVertical, ListOrdered, Plus, X } from "lucide-react";
import type { PlotBacklogItem } from "@/lib/types";
import { Card, Button, Badge, EmptyState, Input } from "@/components/ui";
import {
  createPlotBacklogItem,
  deletePlotBacklogItem,
  reorderPlotBacklog,
} from "@/lib/api-client";
import { cn } from "@/lib/cn";

interface PlotBacklogPanelProps {
  items: PlotBacklogItem[];
  onChange: () => void | Promise<void>;
}

export function PlotBacklogPanel({ items, onChange }: PlotBacklogPanelProps) {
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [orderedItems, setOrderedItems] = useState(items);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    setOrderedItems(items);
  }, [items]);

  async function handleAdd() {
    const trimmed = draft.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await createPlotBacklogItem({ title: trimmed });
      setDraft("");
      await onChange();
    } catch {
      // keep draft so the user can retry
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id: string) {
    await deletePlotBacklogItem(id);
    await onChange();
  }

  function moveItem(fromId: string, toId: string): PlotBacklogItem[] {
    const fromIndex = orderedItems.findIndex((item) => item.id === fromId);
    const toIndex = orderedItems.findIndex((item) => item.id === toId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return orderedItems;

    const next = [...orderedItems];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  }

  async function persistOrder(next: PlotBacklogItem[]) {
    const previous = orderedItems;
    setOrderedItems(next);
    try {
      await reorderPlotBacklog(next.map((item) => item.id));
      await onChange();
    } catch {
      setOrderedItems(previous);
    }
  }

  function handleDragStart(id: string) {
    setDraggingId(id);
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    if (draggingId && draggingId !== id) {
      setDragOverId(id);
    }
  }

  function handleDrop(targetId: string) {
    if (!draggingId) return;
    const next = moveItem(draggingId, targetId);
    setDraggingId(null);
    setDragOverId(null);
    const prevIds = orderedItems.map((item) => item.id).join("\0");
    const nextIds = next.map((item) => item.id).join("\0");
    if (prevIds !== nextIds) {
      void persistOrder(next);
    }
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragOverId(null);
  }

  return (
    <Card className="w-full min-w-0">
      <div className="flex gap-2">
        <Input
          type="text"
          aria-label="Queue a feature"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleAdd();
            }
          }}
          placeholder="Queue a feature for a future sprint…"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => void handleAdd()}
          disabled={!draft.trim() || submitting}
          aria-label="Add to queue"
          className="w-10 shrink-0 px-0"
        >
          <Plus />
        </Button>
      </div>

      {orderedItems.length > 0 ? (
        <ul className="mt-3 max-h-[min(24rem,50vh)] divide-y divide-border overflow-y-auto rounded-xl border border-border bg-card">
          {orderedItems.map((item, index) => (
            <li
              key={item.id}
              onDragOver={(e) => handleDragOver(e, item.id)}
              onDrop={() => handleDrop(item.id)}
              className={cn(
                "group flex items-center gap-2 px-2 py-1.5 text-sm transition-colors hover:bg-surface-2/60",
                draggingId === item.id && "bg-surface-2 opacity-50",
                dragOverId === item.id &&
                  draggingId !== item.id &&
                  "border-t-2 border-t-accent bg-accent-soft/50"
              )}
            >
              <button
                type="button"
                draggable
                onDragStart={() => handleDragStart(item.id)}
                onDragEnd={handleDragEnd}
                className="grid h-8 w-6 shrink-0 cursor-grab touch-none place-items-center rounded-md text-subtle active:cursor-grabbing hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label={`Drag to reorder ${item.title}`}
              >
                <GripVertical className="h-4 w-4" />
              </button>
              <span
                className={cn(
                  "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums",
                  "bg-accent-soft text-accent"
                )}
              >
                {index + 1}
              </span>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="min-w-0 flex-1 truncate leading-snug text-foreground">
                  {item.title}
                </span>
                {(item.tags ?? []).map((tag) => (
                  <Badge key={tag} tone="accent" className="shrink-0 uppercase tracking-wide">
                    {tag}
                  </Badge>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void handleRemove(item.id)}
                className={cn(
                  "grid h-8 w-8 shrink-0 place-items-center rounded-control text-muted transition-[opacity,background-color,color]",
                  "hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  "opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                )}
                aria-label={`Remove ${item.title}`}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact icon={ListOrdered} title="Nothing queued yet." />
      )}
    </Card>
  );
}
