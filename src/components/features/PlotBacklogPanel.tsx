"use client";

import { useEffect, useState } from "react";
import { GripVertical, Plus, X } from "lucide-react";
import type { PlotBacklogItem } from "@/lib/types";
import { Card, Button, Badge } from "@/components/ui";
import {
  createPlotBacklogItem,
  deletePlotBacklogItem,
  reorderPlotBacklog,
} from "@/lib/api-client";
import { cn } from "@/lib/cn";

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-accent";

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
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleAdd();
            }
          }}
          placeholder="Queue a feature for a future sprint…"
          className={inputClass}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void handleAdd()}
          disabled={!draft.trim() || submitting}
          aria-label="Add to queue"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {orderedItems.length > 0 ? (
        <ul className="mt-3 max-h-[min(24rem,50vh)] overflow-y-auto rounded-lg border border-border bg-white">
          {orderedItems.map((item, index) => (
            <li
              key={item.id}
              onDragOver={(e) => handleDragOver(e, item.id)}
              onDrop={() => handleDrop(item.id)}
              className={cn(
                "group flex items-center gap-2 border-b border-border/70 px-3 py-2 text-sm last:border-b-0",
                draggingId === item.id && "bg-slate-50 opacity-50",
                dragOverId === item.id &&
                  draggingId !== item.id &&
                  "border-t-2 border-t-violet-400 bg-violet-50/40"
              )}
            >
              <button
                type="button"
                draggable
                onDragStart={() => handleDragStart(item.id)}
                onDragEnd={handleDragEnd}
                className="shrink-0 cursor-grab touch-none rounded p-0.5 text-muted active:cursor-grabbing hover:text-foreground"
                aria-label={`Drag to reorder ${item.title}`}
              >
                <GripVertical className="h-4 w-4" />
              </button>
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold tabular-nums",
                  "bg-violet-50 text-violet-700"
                )}
              >
                {index + 1}
              </span>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="min-w-0 flex-1 truncate leading-snug text-foreground">
                  {item.title}
                </span>
                {(item.tags ?? []).map((tag) => (
                  <Badge
                    key={tag}
                    className="shrink-0 border-violet-200 bg-violet-50 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-violet-700"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void handleRemove(item.id)}
                className={cn(
                  "shrink-0 rounded-md p-1 text-muted transition-colors",
                  "hover:bg-slate-100 hover:text-foreground",
                  "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                )}
                aria-label={`Remove ${item.title}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-lg border border-dashed border-border/80 bg-white/60 px-3 py-5 text-center text-sm text-muted">
          Nothing queued yet.
        </p>
      )}
    </Card>
  );
}
