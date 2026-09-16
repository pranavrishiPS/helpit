import type { Release, ReleaseStatus } from "./types";

export function applyReleasePatch(
  releases: Release[],
  id: string,
  updates: Partial<Pick<Release, "status" | "phase" | "targetDate" | "actualDate" | "notes" | "sprintNote" | "blockers" | "functionCosts">>,
  now: string
): Release[] {
  const current = releases.find((r) => r.id === id);
  if (!current) return releases;

  if (current.status === "live" && updates.status && updates.status !== "live") {
    throw new Error("RELEASE_COMPLETED");
  }

  return releases.map((release) => {
    if (release.id !== id) return release;
    return {
      ...release,
      ...updates,
      updatedAt: now,
    };
  });
}

export function isShippedStatus(status: ReleaseStatus): boolean {
  return status === "live";
}
