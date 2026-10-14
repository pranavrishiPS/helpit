"use client";

import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui";
import { SwagCostingView } from "@/components/lrp-2027/SwagCostingView";

export default function SwagCostingPage() {
  // useSearchParams (?tab=lrp|adhoc) needs a Suspense boundary for static rendering.
  return (
    <Suspense fallback={<PageSkeleton label="Loading Swag Costing..." />}>
      <SwagCostingView />
    </Suspense>
  );
}
