import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { updateStore } from "@/lib/db";
import type { PlotBacklogItem } from "@/lib/types";
import {
  parseBody,
  createPlotBacklogItemSchema,
  deletePlotBacklogItemSchema,
  reorderPlotBacklogSchema,
} from "@/lib/validation";
import { isErrorResponse, parseJsonBody } from "@/lib/request";

export async function POST(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;

  const parsed = parseBody(createPlotBacklogItemSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const now = new Date().toISOString();
  const item: PlotBacklogItem = {
    id: uuidv4(),
    title: parsed.data.title.trim(),
    tags: parsed.data.tags?.map((t) => t.trim()).filter(Boolean) ?? [],
    createdAt: now,
    updatedAt: now,
  };

  await updateStore((s) => ({
    ...s,
    plotBacklog: [item, ...(s.plotBacklog ?? [])],
  }));

  return NextResponse.json(item, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;

  const parsed = parseBody(reorderPlotBacklogSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { ids } = parsed.data;
  let updated: PlotBacklogItem[] | undefined;

  try {
    await updateStore((s) => {
      const current = s.plotBacklog ?? [];
      const byId = new Map(current.map((item) => [item.id, item]));

      if (ids.length !== current.length) {
        throw new Error("INVALID_ORDER");
      }
      for (const id of ids) {
        if (!byId.has(id)) throw new Error("INVALID_ORDER");
      }

      const now = new Date().toISOString();
      updated = ids.map((id) => {
        const item = byId.get(id)!;
        return { ...item, updatedAt: now };
      });

      return { ...s, plotBacklog: updated };
    });
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_ORDER") {
      return NextResponse.json({ error: "Invalid plot backlog order" }, { status: 400 });
    }
    throw err;
  }

  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const parsed = parseBody(deletePlotBacklogItemSchema, { id });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  let found = false;
  await updateStore((s) => {
    found = false; // reset: the updater re-runs on optimistic retries
    const next = (s.plotBacklog ?? []).filter((item) => {
      if (item.id === parsed.data.id) {
        found = true;
        return false;
      }
      return true;
    });
    return { ...s, plotBacklog: next };
  });

  if (!found) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
