"use client";

import { useRef, useState } from "react";
import { Repeat } from "lucide-react";
import type { RecurringTask } from "@/lib/types";
import { Button } from "@/components/ui";
import type { RecurringRuleFields, RecurringRulePatch } from "@/lib/recurrence";
import type { RuleMutationResult } from "@/lib/use-dashboard";
import { RecurringPanel } from "./RecurringPanel";

/** Tasks header button ("Recurring" plus a count of active rules) that opens the rule panel. */
export function RecurringControl({
  rules,
  onCreate,
  onUpdate,
  onDelete,
}: {
  rules: RecurringTask[];
  onCreate: (fields: RecurringRuleFields) => Promise<RuleMutationResult>;
  onUpdate: (id: string, patch: RecurringRulePatch) => Promise<RuleMutationResult>;
  onDelete: (id: string) => Promise<RuleMutationResult>;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const activeCount = rules.filter((r) => r.active).length;

  return (
    <>
      <Button
        ref={buttonRef}
        variant="secondary"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <Repeat aria-hidden="true" />
        Recurring
        {activeCount > 0 && (
          <span
            aria-label={`${activeCount} active`}
            className="rounded-full bg-surface-3 px-1.5 text-[11px] tabular-nums text-foreground"
          >
            {activeCount}
          </span>
        )}
      </Button>
      {open && (
        <RecurringPanel
          rules={rules}
          returnFocusRef={buttonRef}
          onClose={() => setOpen(false)}
          onCreate={onCreate}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      )}
    </>
  );
}
