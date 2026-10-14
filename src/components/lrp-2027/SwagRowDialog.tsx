"use client";

import { useEffect, useId, useState } from "react";
import { Button, FieldError, Input, Label, Modal, Textarea } from "@/components/ui";
import type { SwagRowPatch } from "@/lib/swag-draft";
import {
  SWAG_FUNCTIONS,
  SWAG_FUNCTION_LABELS,
  SWAG_TAB_LABELS,
  parseEoPercent,
  parseNonNegative,
} from "@/lib/lrp-2027";
import type { SwagCostingRow, SwagFunction, SwagTab } from "@/lib/types";
import { SIZE_LIST_ID } from "./swag-cells";

// Phone add/edit sheet for a Swag Costing row (docs/specs/planning-2027.md §9.7, §10.7).

type CostDraft = Record<SwagFunction, { size: string; days: string }>;

function toDraft(row?: SwagCostingRow) {
  const costs = {} as CostDraft;
  for (const fn of SWAG_FUNCTIONS) {
    costs[fn] = {
      size: row?.costs[fn]?.size ?? "",
      days: row?.costs[fn]?.days == null ? "" : String(row.costs[fn].days),
    };
  }
  return {
    featureName: row?.featureName ?? "",
    onePager: row?.onePager ?? "",
    eo: row?.eoPercent == null ? "" : String(row.eoPercent),
    priority: row?.priority ?? "",
    costs,
  };
}

export function SwagRowDialog({
  row,
  tab,
  onClose,
  onSubmit,
}: {
  /** Existing row to edit; omitted = add a new row to `tab`. */
  row?: SwagCostingRow;
  tab: SwagTab;
  onClose: () => void;
  /** Returns false when the save failed (the dialog stays open with the typed values). */
  onSubmit: (patch: SwagRowPatch & { featureName: string }) => Promise<boolean>;
}) {
  const id = useId();
  const [draft, setDraft] = useState(() => toDraft(row));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const canSave = draft.featureName.trim().length > 0 && !saving;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    const nextErrors: Record<string, string> = {};
    const eo = parseEoPercent(draft.eo);
    if (!eo.ok) nextErrors.eo = eo.error;
    const costs: NonNullable<SwagRowPatch["costs"]> = {};
    for (const fn of SWAG_FUNCTIONS) {
      const days = parseNonNegative(draft.costs[fn].days);
      if (!days.ok) {
        nextErrors[fn] = days.error;
        continue;
      }
      costs[fn] = { size: draft.costs[fn].size.trim() || null, days: days.value ?? null };
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    const ok = await onSubmit({
      featureName: draft.featureName,
      onePager: draft.onePager.trim() || null,
      eoPercent: eo.ok ? (eo.value ?? null) : null,
      priority: draft.priority.trim() || null,
      costs,
    });
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Modal
      onClose={onClose}
      title={row ? "Edit feature" : `Add row to ${SWAG_TAB_LABELS[tab]}`}
      module="lrp2027"
      onSubmit={submit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div>
        <Label htmlFor={`${id}-name`}>Feature name</Label>
        <Input
          id={`${id}-name`}
          value={draft.featureName}
          autoFocus
          required
          onChange={(e) => setDraft({ ...draft, featureName: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`${id}-eo`} hint="%">
            EO
          </Label>
          <Input
            id={`${id}-eo`}
            inputMode="decimal"
            value={draft.eo}
            aria-invalid={Boolean(errors.eo) || undefined}
            onChange={(e) => setDraft({ ...draft, eo: e.target.value })}
          />
          {errors.eo && <FieldError>{errors.eo}</FieldError>}
        </div>
      </div>
      <div>
        <Label htmlFor={`${id}-onepager`}>1-pager</Label>
        <Textarea
          id={`${id}-onepager`}
          value={draft.onePager}
          onChange={(e) => setDraft({ ...draft, onePager: e.target.value })}
        />
      </div>
      {SWAG_FUNCTIONS.map((fn) => (
        <fieldset key={fn}>
          <legend className="mb-1.5 text-xs font-semibold text-foreground">
            {SWAG_FUNCTION_LABELS[fn].full}
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <Input
              aria-label={`${SWAG_FUNCTION_LABELS[fn].short} size`}
              placeholder="Size"
              list={SIZE_LIST_ID}
              value={draft.costs[fn].size}
              onChange={(e) =>
                setDraft({ ...draft, costs: { ...draft.costs, [fn]: { ...draft.costs[fn], size: e.target.value } } })
              }
            />
            <Input
              aria-label={`${SWAG_FUNCTION_LABELS[fn].short} days`}
              placeholder="Days"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={draft.costs[fn].days}
              aria-invalid={Boolean(errors[fn]) || undefined}
              onChange={(e) =>
                setDraft({ ...draft, costs: { ...draft.costs, [fn]: { ...draft.costs[fn], days: e.target.value } } })
              }
            />
          </div>
          {errors[fn] && <FieldError>{errors[fn]}</FieldError>}
        </fieldset>
      ))}
      <div>
        <Label htmlFor={`${id}-priority`}>Priority</Label>
        <Input
          id={`${id}-priority`}
          value={draft.priority}
          onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
        />
      </div>
    </Modal>
  );
}
