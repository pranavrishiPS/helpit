"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FileSpreadsheet, Link2, RefreshCw } from "lucide-react";
import { Alert, Badge, Button, Card, Input, ModuleChip, buttonClasses } from "@/components/ui";
import {
  connectScrumSheet,
  disconnectScrumSheet,
  fetchScrumSheetStatus,
  syncScrumSheet,
} from "@/lib/api-client";
import { notifyStoreUpdated } from "@/lib/store-events";

interface ScrumSheetStatus {
  configured: boolean;
  connected: boolean;
  email?: string;
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  lastSyncedAt?: string;
  lastSyncError?: string;
}

function ScrumSheetSyncContent({ onSynced }: { onSynced: () => void }) {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<ScrumSheetStatus | null>(null);
  const [sheetUrl, setSheetUrl] = useState("");
  const [linking, setLinking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const res = await fetchScrumSheetStatus().catch(() => null);
    if (res) setStatus(res);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const sheetParam = searchParams.get("sheet");
    if (sheetParam === "connected") {
      setMessage("Google account connected. Now paste your sheet's URL below.");
      load();
    } else if (sheetParam === "error") {
      setMessage("Google connection failed. Check credentials and try again.");
    } else if (sheetParam === "invalid_state") {
      setMessage("OAuth expired or was invalid. Please try connecting again.");
    }
  }, [searchParams]);

  async function handleLinkSheet(e: React.FormEvent) {
    e.preventDefault();
    if (!sheetUrl.trim()) return;
    setLinking(true);
    setMessage(null);
    try {
      await connectScrumSheet(sheetUrl.trim());
      setSheetUrl("");
      await load();
      setMessage("Spreadsheet linked. Click Sync now to pull in its data.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to link spreadsheet");
    } finally {
      setLinking(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setMessage(null);
    try {
      const result = await syncScrumSheet();
      if (!result.ok) throw new Error(result.error);
      await load();
      onSynced();
      notifyStoreUpdated();
      setMessage("Synced with Google Sheet.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await disconnectScrumSheet();
      await load();
      onSynced();
      notifyStoreUpdated();
    } finally {
      setDisconnecting(false);
    }
  }

  if (!status) return null;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <ModuleChip module="scrum" icon={FileSpreadsheet} variant="soft" size="md" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-foreground">Google Sheet</span>
              <Badge
                dot
                tone={
                  !status.configured
                    ? "caution"
                    : status.connected && status.spreadsheetId
                      ? "success"
                      : status.connected
                        ? "info"
                        : "neutral"
                }
                className="max-w-full whitespace-normal"
              >
                {!status.configured
                  ? "Needs setup"
                  : status.connected && status.spreadsheetId
                    ? `Linked${status.email ? ` · ${status.email}` : ""}`
                    : status.connected
                      ? "Connected — link a sheet"
                      : "Not connected"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted">
              Sync scrum attendance with a shared spreadsheet. The sheet wins on conflicts.
            </p>
          </div>
        </div>

        {status.configured && !status.connected && (
          <a
            href="/api/scrum-attendance/sheet/auth"
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            <Link2 />
            Connect
          </a>
        )}

        {status.connected && status.spreadsheetId && (
          <div className="flex flex-col items-start gap-2 sm:items-end">
            {status.lastSyncedAt && (
              <span className="text-xs text-muted">
                Last sync {new Date(status.lastSyncedAt).toLocaleString()}
              </span>
            )}
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={handleSync} disabled={syncing}>
                <RefreshCw className={syncing ? "animate-spin" : ""} />
                Sync now
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDisconnect}
                disabled={disconnecting}
              >
                {disconnecting ? "…" : "Disconnect"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {status.connected && !status.spreadsheetId && (
        <form onSubmit={handleLinkSheet} className="mt-4 flex gap-2 border-t border-border pt-4">
          <Input
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            placeholder="Paste the Google Sheet URL"
            aria-label="Google Sheet URL"
            className="min-w-0 flex-1"
          />
          <Button type="submit" disabled={linking || !sheetUrl.trim()}>
            {linking ? "Linking…" : "Link sheet"}
          </Button>
        </form>
      )}

      {(message || status.lastSyncError) && (
        <Alert tone={message ? "info" : "danger"} role="status" className="mt-3">
          {message ?? status.lastSyncError}
        </Alert>
      )}
    </Card>
  );
}

export function ScrumSheetSync({ onSynced }: { onSynced: () => void }) {
  return (
    <Suspense fallback={null}>
      <ScrumSheetSyncContent onSynced={onSynced} />
    </Suspense>
  );
}
