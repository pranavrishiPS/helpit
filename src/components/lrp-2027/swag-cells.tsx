"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { T_SHIRT_SIZES, formatNumber, isHttpUrl, sizeLetter } from "@/lib/lrp-2027";
import type { SwagCost } from "@/lib/types";
import { MissingValue } from "./grid";

// Display pieces shared by the Swag Costing grid and phone cards (§10.5, §10.7).

export const SIZE_LIST_ID = "lrp-2027-tshirt-sizes";

/** Suggestions for the size fields; free text is still accepted. */
export function SizeDatalist() {
  return (
    <datalist id={SIZE_LIST_ID}>
      {T_SHIRT_SIZES.map((size) => (
        <option key={size} value={size} />
      ))}
    </datalist>
  );
}

/** `XS · 2`: neutral size chip, dot, days. A blank half uses the missing style. */
export function FunctionCostDisplay({ cost }: { cost: SwagCost | undefined }) {
  return (
    <span className="inline-flex items-center gap-1">
      {cost?.size ? (
        <Badge tone="neutral" title={cost.size} className="min-w-7 justify-center font-mono">
          <span aria-hidden="true">{sizeLetter(cost.size)}</span>
          <span className="sr-only">{cost.size}</span>
        </Badge>
      ) : (
        <MissingValue />
      )}
      <span aria-hidden="true" className="text-subtle">
        ·
      </span>
      {cost?.days != null ? (
        <span className="font-medium tabular-nums text-info">{formatNumber(cost.days)}</span>
      ) : (
        <MissingValue />
      )}
    </span>
  );
}

const LONG_TEXT = 70;

/** URL → "Open" link (new tab); text → 2-line clamp with Show more / Show less. */
export function OnePagerDisplay({ value, className }: { value: string | undefined; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!value) return <span className="text-muted">—</span>;
  if (isHttpUrl(value)) {
    return (
      <a
        href={value.trim()}
        target="_blank"
        rel="noopener"
        title={value}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 font-semibold text-accent underline-offset-2 hover:text-accent-hover hover:underline"
      >
        Open
        <ExternalLink aria-hidden="true" className="h-3 w-3" />
        <span className="sr-only">1-pager (opens in a new tab)</span>
      </a>
    );
  }
  const long = value.length > LONG_TEXT;
  return (
    <div className={className}>
      <p className={cn("whitespace-pre-line break-words text-muted", !expanded && "line-clamp-2")}>{value}</p>
      {long && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          onKeyDown={(e) => e.stopPropagation()}
          aria-expanded={expanded}
          className="mt-0.5 text-[11px] font-semibold text-accent hover:text-accent-hover"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
