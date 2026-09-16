import { describe, expect, it } from "vitest";
import {
  buildReleaseId,
  normalizeLegacyReleaseId,
  normalizeLegacyReleasePhase,
  normalizeRelease,
} from "@/lib/release-utils";
describe("buildReleaseId", () => {
  it("normalizes build numbers into consistent ids", () => {
    expect(buildReleaseId("android", "1.180")).toBe("rel-android-1180");
    expect(buildReleaseId("ios", "1.76")).toBe("rel-ios-176");
  });
});

describe("normalizeLegacyReleaseId", () => {
  it("migrates bare rel-1180 to platform-prefixed id", () => {
    const migrated = normalizeLegacyReleaseId({
      id: "rel-1180",
      name: "Android 1.180",
      status: "in_dev",
      blockers: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(migrated.id).toBe("rel-android-1180");
    expect(migrated.platform).toBe("android");
  });

  it("leaves modern ids unchanged", () => {
    const release = {
      id: "rel-ios-176",
      name: "iOS 1.76",
      platform: "ios" as const,
      status: "in_dev" as const,
      blockers: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(normalizeLegacyReleaseId(release).id).toBe("rel-ios-176");
  });
});

describe("normalizeLegacyReleasePhase", () => {
  const base = {
    id: "rel-android-1180",
    name: "Android 1.180",
    status: "in_dev" as const,
    blockers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it("maps development to dev", () => {
    const migrated = normalizeLegacyReleasePhase({
      ...base,
      phase: "development" as never,
    });
    expect(migrated.phase).toBe("dev");
  });

  it("strips unknown legacy phases", () => {
    const migrated = normalizeLegacyReleasePhase({
      ...base,
      phase: "spec" as never,
    });
    expect(migrated.phase).toBeUndefined();
  });
});

describe("normalizeRelease", () => {
  it("returns the same object reference when nothing changes", () => {
    const release = {
      id: "rel-android-1180",
      name: "Android 1.180",
      platform: "android" as const,
      phase: "dev" as const,
      status: "in_dev" as const,
      blockers: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(normalizeRelease(release)).toBe(release);
  });
});
