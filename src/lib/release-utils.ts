import type { Release, ReleasePhase, ReleasePlatform } from "./types";

export function buildReleaseId(platform: ReleasePlatform, buildNumber: string): string {
  const normalized = buildNumber.replace(".", "");
  return `rel-${platform}-${normalized}`;
}

export function buildReleaseName(platform: ReleasePlatform, buildNumber: string): string {
  return platform === "android" ? `Android ${buildNumber}` : `iOS ${buildNumber}`;
}

export function normalizeLegacyReleaseId(release: Release): Release {
  const bare = release.id.match(/^rel-(\d+)$/);
  if (!bare) return release;

  const digits = bare[1];
  const buildNumber = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
  const platform: ReleasePlatform =
    release.platform ??
    (release.name.toLowerCase().includes("ios") ? "ios" : "android");
  const newId = buildReleaseId(platform, buildNumber);

  if (newId === release.id) {
    return release.platform ? release : { ...release, platform };
  }

  return { ...release, id: newId, platform };
}

const LEGACY_PHASE_MAP: Record<string, ReleasePhase | undefined> = {
  development: "dev",
  dev: "dev",
  qa: "qa",
  ux: "ux",
  art: "art",
  animation: "animation",
};

export function normalizeLegacyReleasePhase(release: Release): Release {
  if (!release.phase) return release;
  const mapped = LEGACY_PHASE_MAP[release.phase];
  if (mapped === release.phase) return release;
  if (mapped) return { ...release, phase: mapped };
  const { phase, ...rest } = release;
  void phase;
  return rest;
}

export function normalizeRelease(release: Release): Release {
  return normalizeLegacyReleasePhase(normalizeLegacyReleaseId(release));
}
