import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ShareReleaseCalendar } from "@/components/release-calendar/ShareReleaseCalendar";
import { isValidReleaseCalendarShareToken } from "@/lib/release-calendar-share";
import { readReleaseCalendarSnapshot } from "@/lib/release-calendar-store";

// Public read-only view (docs/specs/release-calendar-sheet.md §9, §15.6). Reads only the snapshot
// file: never the main store, never tokens or account details.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Cryptogram Release Calendar" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ShareReleaseCalendarPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!(await isValidReleaseCalendarShareToken(token))) notFound();

  const snapshot = await readReleaseCalendarSnapshot();

  return (
    <ShareReleaseCalendar
      token={token}
      initialTodayKey={format(new Date(), "yyyy-MM-dd")}
      initial={{
        weeks: snapshot?.weeks ?? [],
        syncedAt: snapshot?.syncedAt,
        refreshFailed: !!snapshot?.lastError,
      }}
    />
  );
}
