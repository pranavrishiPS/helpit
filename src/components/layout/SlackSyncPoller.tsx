"use client";

import { useEffect, useRef } from "react";
import { notifyStoreUpdated } from "@/lib/store-events";
import {
  handleSlackSyncResponse,
  isWithinSlackSyncHours,
  SLACK_SYNC_INTERVAL_MS,
} from "@/lib/slack-events";
import { fetchSlackStatus, syncSlack } from "@/lib/api-client";

export function SlackSyncPoller() {
  const syncing = useRef(false);

  useEffect(() => {
    async function sync() {
      if (!isWithinSlackSyncHours()) return;
      if (syncing.current) return;

      try {
        const status = await fetchSlackStatus();
        if (!status.connected || status.autoSyncAvailable === false) return;

        syncing.current = true;
        const res = await syncSlack();
        const result = await handleSlackSyncResponse(res);
        if (result.ok) {
          notifyStoreUpdated();
        }
      } catch {
        // quiet background sync
      } finally {
        syncing.current = false;
      }
    }

    sync();
    const interval = setInterval(sync, SLACK_SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return null;
}
