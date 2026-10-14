import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { updateStore } from "@/lib/db";
import { emptyCosts, moveSwagRow, nextOrder, SWAG_FUNCTIONS } from "@/lib/lrp-2027";
import type { CapacityPlan, SwagCost, SwagCostingRow, SwagFunction } from "@/lib/types";
import {
  bulkSaveSwagSchema,
  createSwagRowSchema,
  deleteSwagRowSchema,
  parseBody,
  patchLrp2027Schema,
} from "@/lib/validation";
import { guardMutation, isErrorResponse, parseJsonBody } from "@/lib/request";

// 2027 Planning (docs/specs/planning-2027.md): capacity plan inputs and Swag Costing rows.
// Only user input is written; computed values (potential, mandays, Total, ROI) are never stored.

type CostsPatch = Partial<Record<SwagFunction, { size?: string | null; days?: number | null }>>;

/** null / blank clears the field (blank = missing, never 0). */
function textOrUndefined(value: string | null | undefined, current: string | undefined): string | undefined {
  if (value === undefined) return current;
  if (value === null || value.trim() === "") return undefined;
  return value;
}

function applyCosts(
  current: Record<SwagFunction, SwagCost>,
  patch: CostsPatch | undefined
): Record<SwagFunction, SwagCost> {
  if (!patch) return current;
  const next = { ...current };
  for (const fn of SWAG_FUNCTIONS) {
    const p = patch[fn];
    if (!p) continue;
    const cost: SwagCost = { ...next[fn] };
    if (p.size !== undefined) {
      const size = textOrUndefined(p.size, cost.size);
      if (size === undefined) delete cost.size;
      else cost.size = size.trim();
    }
    if (p.days !== undefined) {
      if (p.days === null) delete cost.days;
      else cost.days = p.days;
    }
    next[fn] = cost;
  }
  return next;
}

function setOptional<T extends object, K extends keyof T>(obj: T, key: K, value: T[K] | undefined): void {
  if (value === undefined) delete obj[key];
  else obj[key] = value;
}

export async function POST(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;

  const parsed = parseBody(createSwagRowSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const now = new Date().toISOString();
  const input = parsed.data;
  let created: SwagCostingRow | undefined;

  await updateStore((s) => {
    const rows = s.swagCosting ?? [];
    const row: SwagCostingRow = {
      id: uuidv4(),
      tab: input.tab,
      order: nextOrder(rows, input.tab),
      featureName: input.featureName,
      costs: applyCosts(emptyCosts(), input.costs),
      createdAt: now,
      updatedAt: now,
    };
    setOptional(row, "owner", textOrUndefined(input.owner, undefined));
    setOptional(row, "onePager", textOrUndefined(input.onePager, undefined));
    setOptional(row, "priority", textOrUndefined(input.priority, undefined));
    setOptional(row, "eoPercent", input.eoPercent ?? undefined);
    created = row;
    return { ...s, swagCosting: [...rows, row] };
  });

  return NextResponse.json(created, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;

  const parsed = parseBody(patchLrp2027Schema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const data = parsed.data;

  if (data.action === "capacity") {
    let plan: CapacityPlan | undefined;
    let missing = false;
    await updateStore((s) => {
      plan = undefined; // reset: the updater re-runs on optimistic retries
      missing = false;
      const current = s.capacityPlan;
      const monthPatches = [...(data.months ?? []), ...(data.month ? [data.month] : [])];
      if (!current || monthPatches.some((m) => !current.months[m.index])) {
        missing = true;
        return s;
      }
      const months = [...current.months];
      for (const { index, ...fields } of monthPatches) {
        months[index] = { ...months[index], ...fields };
      }
      plan = {
        ...current,
        year: data.year ?? current.year,
        headcount: { ...current.headcount, ...data.headcount },
        months,
        updatedAt: new Date().toISOString(),
      };
      return { ...s, capacityPlan: plan };
    });
    if (missing) {
      return NextResponse.json({ error: "Capacity plan not found" }, { status: 404 });
    }
    return NextResponse.json(plan);
  }

  if (data.action === "move") {
    let rows: SwagCostingRow[] | null = null;
    await updateStore((s) => {
      rows = moveSwagRow(s.swagCosting ?? [], data.id, data.tab, data.index);
      return rows ? { ...s, swagCosting: rows } : s;
    });
    if (!rows) {
      return NextResponse.json({ error: "Row not found" }, { status: 404 });
    }
    return NextResponse.json({ rows });
  }

  let updated: SwagCostingRow | undefined;
  await updateStore((s) => {
    updated = undefined;
    const rows = s.swagCosting ?? [];
    const index = rows.findIndex((r) => r.id === data.id);
    if (index === -1) return s;
    const current = rows[index];
    const row: SwagCostingRow = {
      ...current,
      featureName: data.featureName ?? current.featureName,
      costs: applyCosts(current.costs, data.costs),
      updatedAt: new Date().toISOString(),
    };
    setOptional(row, "owner", textOrUndefined(data.owner, current.owner));
    setOptional(row, "onePager", textOrUndefined(data.onePager, current.onePager));
    setOptional(row, "priority", textOrUndefined(data.priority, current.priority));
    setOptional(
      row,
      "eoPercent",
      data.eoPercent === undefined ? current.eoPercent : data.eoPercent ?? undefined
    );
    updated = row;
    const next = [...rows];
    next[index] = row;
    return { ...s, swagCosting: next };
  });

  if (!updated) {
    return NextResponse.json({ error: "Row not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

/** Swag Costing draft Save: upserts + deletes applied in one store update (all or nothing). */
export async function PUT(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;

  const parsed = parseBody(bulkSaveSwagSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { upserts, deletes } = parsed.data;

  let rows: SwagCostingRow[] = [];
  await updateStore((s) => {
    const now = new Date().toISOString();
    const deleted = new Set(deletes);
    const existing = new Map((s.swagCosting ?? []).map((r) => [r.id, r]));
    const incoming = new Map(upserts.map((r) => [r.id, r]));
    const next: SwagCostingRow[] = [];
    for (const row of s.swagCosting ?? []) {
      if (deleted.has(row.id)) continue;
      const update = incoming.get(row.id);
      next.push(update ? { ...update, createdAt: row.createdAt, updatedAt: now } : row);
    }
    for (const row of upserts) {
      if (!existing.has(row.id)) next.push({ ...row, createdAt: now, updatedAt: now });
    }
    rows = next;
    return { ...s, swagCosting: next };
  });

  return NextResponse.json({ rows });
}

export async function DELETE(request: NextRequest) {
  const guard = guardMutation(request);
  if (guard) return guard;
  const parsed = parseBody(deleteSwagRowSchema, { id: request.nextUrl.searchParams.get("id") });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  let found = false;
  await updateStore((s) => {
    found = false; // reset: the updater re-runs on optimistic retries
    const next = (s.swagCosting ?? []).filter((row) => {
      if (row.id === parsed.data.id) {
        found = true;
        return false;
      }
      return true;
    });
    return found ? { ...s, swagCosting: next } : s;
  });

  if (!found) {
    return NextResponse.json({ error: "Row not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
