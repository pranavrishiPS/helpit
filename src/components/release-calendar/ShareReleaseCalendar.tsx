"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Card, EmptyState } from "@/components/ui";
import { ReleaseCalendar } from "@/components/release-calendar/ReleaseCalendar";
import type { ReleaseCalendarWeek } from "@/lib/types";

// Public share viewer. No store hooks, no account details, no links into Helpit.

interface ShareData {
  weeks: ReleaseCalendarWeek[];
  syncedAt?: string;
  refreshFailed: boolean;
}

function formatSyncTime(iso: string): string {
  return new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export function ShareReleaseCalendar({
  token,
  initial,
  initialTodayKey,
}: {
  token: string;
  initial: ShareData;
  initialTodayKey: string;
}) {
  const [data, setData] = useState<ShareData>(initial);
  const [updating, setUpdating] = useState(false);
  // Times render in the viewer's locale, so only after hydration.
  const [mounted, setMounted] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    setMounted(true);
    if (started.current) return;
    started.current = true;
    setUpdating(true);
    fetch(`/api/share/release-calendar/${encodeURIComponent(token)}/sync`, { method: "POST" })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          weeks?: ReleaseCalendarWeek[];
          syncedAt?: string;
          error?: string;
        };
        setData((prev) => ({
          weeks: Array.isArray(body.weeks) ? body.weeks : prev.weeks,
          syncedAt: body.syncedAt ?? prev.syncedAt,
          refreshFailed: !res.ok || !!body.error,
        }));
      })
      .catch(() => setData((prev) => ({ ...prev, refreshFailed: true })))
      .finally(() => setUpdating(false));
  }, [token]);

  // A throttled refresh returns at once: only show "Updating…" if it is still pending after ~300ms.
  const [showUpdating, setShowUpdating] = useState(false);
  useEffect(() => {
    if (!updating) {
      setShowUpdating(false);
      return;
    }
    const t = setTimeout(() => setShowUpdating(true), 300);
    return () => clearTimeout(t);
  }, [updating]);

  const syncedLabel = mounted && data.syncedAt ? formatSyncTime(data.syncedAt) : null;

  return (
    <div>
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h1 className="font-display text-xl font-bold tracking-[-0.02em] text-foreground sm:text-2xl">
          Cryptogram Release Calendar
        </h1>
        <p className="text-xs text-muted" aria-live="polite">
          {syncedLabel && `Last updated ${syncedLabel}`}
          {showUpdating && `${syncedLabel ? " · " : ""}Updating…`}
        </p>
      </div>

      {data.refreshFailed && !updating && data.weeks.length > 0 && (
        <Alert tone="info" icon={null} className="mb-4">
          {syncedLabel ? `Couldn't refresh. Showing data from ${syncedLabel}.` : "Couldn't refresh."}
        </Alert>
      )}

      {data.weeks.length > 0 ? (
        <ReleaseCalendar weeks={data.weeks} initialTodayKey={initialTodayKey} />
      ) : (
        <Card>
          <EmptyState
            title={data.syncedAt ? "No calendar entries yet." : "Release calendar isn't available yet."}
          />
        </Card>
      )}
    </div>
  );
}
