"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { SLACK_RATE_LIMITED_EVENT } from "@/lib/slack-events";
import { Button } from "@/components/ui";

export function SlackRateLimitToast() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    function onRateLimited(event: Event) {
      const detail = (event as CustomEvent<{ message: string }>).detail;
      setMessage(
        detail?.message ??
          "Slack rate limit reached. Sync will retry in 10 minutes."
      );
    }

    window.addEventListener(SLACK_RATE_LIMITED_EVENT, onRateLimited);
    return () =>
      window.removeEventListener(SLACK_RATE_LIMITED_EVENT, onRateLimited);
  }, []);

  if (!message) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div
        role="alert"
        className="pointer-events-auto flex max-w-md animate-scale-in items-start gap-3 rounded-card border border-caution/30 bg-card px-4 py-3 shadow-[inset_3px_0_0_var(--caution),var(--shadow-overlay)]"
      >
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-caution" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Slack sync paused</p>
          <p className="mt-0.5 text-sm text-muted">{message}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMessage(null)}
          className="-mr-1 -mt-1"
          aria-label="Dismiss"
        >
          <X />
        </Button>
      </div>
    </div>
  );
}
