import type { Release } from "./types";

/** Sort in-flight releases by target date (undated last). */
export function sortUpcomingReleases(releases: Release[]): Release[] {
  return [...releases].sort((a, b) => {
    const aDate = a.targetDate ?? "";
    const bDate = b.targetDate ?? "";
    if (!aDate && bDate) return 1;
    if (aDate && !bDate) return -1;
    return aDate.localeCompare(bDate);
  });
}

export interface ReleasePartitions {
  active: Release | undefined;
  upcoming: Release[];
  completed: Release[];
}

export function partitionReleases(releases: Release[]): ReleasePartitions {
  const completed = releases
    .filter((r) => r.status === "live")
    .sort((a, b) =>
      (b.actualDate ?? b.updatedAt).localeCompare(a.actualDate ?? a.updatedAt)
    );

  const inFlight = releases.filter((r) => r.status !== "live");
  const sorted = sortUpcomingReleases(inFlight);
  const active = sorted[0];
  const upcoming = sorted.slice(1);

  return { active, upcoming, completed };
}
