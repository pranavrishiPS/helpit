"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ExternalLink, MoreHorizontal, RefreshCw, Sheet } from "lucide-react";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Skeleton,
  buttonClasses,
} from "@/components/ui";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { ReleaseCalendar } from "@/components/release-calendar/ReleaseCalendar";
import {
  CopyShareLinkButton,
  ShareUrlPopover,
  shareUrlFor,
  useCopyText,
} from "@/components/release-calendar/CopyShareLink";
import {
  fetchReleaseCalendar,
  syncReleaseCalendar,
  type ReleaseCalendarStatus,
} from "@/lib/api-client";
import { RELEASE_CALENDAR_SHEET_URL } from "@/lib/release-calendar-config";
import { cn } from "@/lib/cn";

const CONNECT_URL = "/api/scrum-attendance/sheet/auth?return=release-calendar";

function formatSyncTime(iso: string): string {
  return new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function CalendarSkeleton() {
  return (
    <Card className="p-4">
      <div role="status">
        <span className="sr-only">Loading release calendar...</span>
        <Skeleton className="mb-4 h-8 w-40" />
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="grid grid-cols-[4.5rem_repeat(5,1fr)] gap-2">
              {[0, 1, 2, 3, 4, 5].map((j) => (
                <Skeleton key={j} className="h-20 rounded-lg" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function ParseWarnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="border-t border-border bg-surface-2/60 px-4 py-2.5">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1 rounded-sm text-xs font-semibold text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal [&::-webkit-details-marker]:hidden">
          {warnings.length} {warnings.length === 1 ? "date couldn't" : "dates couldn't"} be matched
          <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <ul className="mt-2 space-y-1 text-xs text-muted">
          {warnings.map((w, i) => (
            <li key={i} className="break-words">
              {w}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/** Phone overflow menu: Open sheet + Copy share link. */
function MoreActions({ sharePath }: { sharePath: string | null }) {
  const { copied, copy } = useCopyText();
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);

  const items: MenuItem[] = [
    {
      id: "open-sheet",
      label: "Open sheet",
      onSelect: () => {
        window.open(RELEASE_CALENDAR_SHEET_URL, "_blank", "noopener,noreferrer");
      },
    },
  ];
  if (sharePath) {
    items.push({
      id: "copy-share",
      label: copied ? "Copied" : "Copy share link",
      onSelect: () => {
        void copy(shareUrlFor(sharePath)).then((ok) => {
          if (!ok) setFallbackOpen(true);
        });
      },
    });
  }

  return (
    <span ref={anchorRef} className="inline-flex sm:hidden">
      <Menu label="More actions" icon={MoreHorizontal} items={items} />
      <span className="sr-only" aria-live="polite">
        {copied ? "Share link copied" : ""}
      </span>
      {fallbackOpen && sharePath && (
        <ShareUrlPopover
          anchor={anchorRef.current}
          url={shareUrlFor(sharePath)}
          onClose={() => setFallbackOpen(false)}
        />
      )}
    </span>
  );
}

function ReleaseCalendarContent() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<ReleaseCalendarStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const autoSynced = useRef(false);

  const sheetParam = searchParams.get("sheet");
  const oauthError =
    sheetParam === "error" || sheetParam === "invalid_state" || sheetParam === "missing_code"
      ? "Google Sheets connection failed. Try connecting again."
      : null;

  const runSync = useCallback(async (force: boolean) => {
    setSyncing(true);
    try {
      const result = await syncReleaseCalendar(force);
      setData((prev) =>
        prev
          ? { ...prev, snapshot: result.snapshot ?? prev.snapshot, connected: !result.notConnected }
          : prev
      );
      setSyncError(result.ok ? null : (result.error ?? "Release calendar sync failed"));
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Release calendar sync failed");
    } finally {
      setSyncing(false);
    }
  }, []);

  // Load the snapshot, then sync once per page open when connected (same pattern as Mail).
  useEffect(() => {
    if (autoSynced.current) return;
    autoSynced.current = true;
    fetchReleaseCalendar()
      .then((status) => {
        setData(status);
        if (status.connected) void runSync(false);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load the release calendar"));
  }, [runSync]);

  // Throttled syncs return fast; only show the spinner if the request is still pending after ~300ms.
  useEffect(() => {
    if (!syncing) {
      setShowSpinner(false);
      return;
    }
    const t = setTimeout(() => setShowSpinner(true), 300);
    return () => clearTimeout(t);
  }, [syncing]);

  const snapshot = data?.snapshot ?? null;
  const weeks = snapshot?.weeks ?? [];
  const syncedAt = snapshot?.syncedAt;
  const connected = !!data?.connected;
  const error = syncError ?? snapshot?.lastError ?? null;

  const header = (
    <PageHeader
      title="Release Calendar"
      module="planning"
      action={
        data ? (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="flex items-center gap-1.5 text-xs text-muted" aria-live="polite">
              {showSpinner ? (
                <>
                  <RefreshCw aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                  Syncing…
                </>
              ) : syncedAt ? (
                `Synced ${formatSyncTime(syncedAt)}`
              ) : null}
            </span>
            {connected && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => runSync(true)}
                  disabled={syncing}
                  className="hidden sm:inline-flex"
                >
                  <RefreshCw className={showSpinner ? "animate-spin" : ""} />
                  {showSpinner ? "Syncing…" : "Sync now"}
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => runSync(true)}
                  disabled={syncing}
                  aria-label="Sync now"
                  className="sm:hidden"
                >
                  <RefreshCw className={showSpinner ? "animate-spin" : ""} />
                </Button>
              </>
            )}
            <a
              href={RELEASE_CALENDAR_SHEET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonClasses({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}
            >
              <ExternalLink />
              Open sheet
            </a>
            {data.sharePath && (
              <span className="hidden sm:inline-flex">
                <CopyShareLinkButton path={data.sharePath} />
              </span>
            )}
            <MoreActions sharePath={data.sharePath} />
          </div>
        ) : undefined
      }
    />
  );

  if (loadError && !data) {
    return (
      <div>
        {header}
        <ErrorBanner message={loadError} />
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        {header}
        <CalendarSkeleton />
      </div>
    );
  }

  const neverSynced = !syncedAt;
  // Without GOOGLE_CLIENT_ID/SECRET the auth route only returns a 503, so don't link to it.
  const connectButton = (size: "sm" | "md") =>
    data.configured ? (
      <a href={CONNECT_URL} className={buttonClasses({ size })}>
        {size === "sm" ? "Connect" : "Connect Google Sheets"}
      </a>
    ) : (
      <p className="max-w-sm text-xs text-muted">
        Google Sheets isn&apos;t set up on this server. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET,
        then reload.
      </p>
    );

  return (
    <div>
      {header}

      {oauthError && <ErrorBanner message={oauthError} />}

      {!connected && !neverSynced && (
        <Alert tone="caution" className="mb-4" action={connectButton("sm")}>
          Google Sheets disconnected. Showing data synced {formatSyncTime(syncedAt!)}.
        </Alert>
      )}

      {connected && error && !syncing && (
        <Alert
          tone="danger"
          role="alert"
          className="mb-4"
          action={
            <Button variant="secondary" size="sm" onClick={() => runSync(true)}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {weeks.length > 0 ? (
        <ReleaseCalendar weeks={weeks} footer={<ParseWarnings warnings={snapshot?.warnings ?? []} />} />
      ) : neverSynced ? (
        connected && syncing ? (
          <CalendarSkeleton />
        ) : (
          <Card>
            <EmptyState
              icon={Sheet}
              title="Connect Google Sheets"
              description={`Release Calendar reads the "Calendar" tab of Cryptogram 6 WP. View access only.`}
              action={connectButton("md")}
            />
          </Card>
        )
      ) : (
        <Card>
          <EmptyState
            icon={Sheet}
            title="No weeks found in the Calendar tab"
            action={
              <a
                href={RELEASE_CALENDAR_SHEET_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses({ variant: "secondary", size: "sm" })}
              >
                <ExternalLink />
                Open sheet
              </a>
            }
          />
        </Card>
      )}
    </div>
  );
}

export default function ReleaseCalendarPage() {
  return (
    <Suspense fallback={<CalendarSkeleton />}>
      <ReleaseCalendarContent />
    </Suspense>
  );
}
