import { describe, expect, it } from "vitest";
import {
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  parseThemePreference,
  readStoredPreference,
  resolveTheme,
  writeStoredPreference,
} from "@/lib/theme";

describe("parseThemePreference", () => {
  it("accepts the three valid values", () => {
    expect(parseThemePreference("system")).toBe("system");
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
  });

  it("falls back to system for missing or invalid values", () => {
    expect(parseThemePreference(null)).toBe("system");
    expect(parseThemePreference(undefined)).toBe("system");
    expect(parseThemePreference("Dark")).toBe("system");
    expect(parseThemePreference("")).toBe("system");
  });
});

describe("resolveTheme", () => {
  it("follows the OS only on system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("stored preference", () => {
  it("reads and writes under helpit-theme", () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
    };
    expect(readStoredPreference(storage)).toBe("system");
    expect(writeStoredPreference(storage, "dark")).toBe(true);
    expect(map.get(THEME_STORAGE_KEY)).toBe("dark");
    expect(readStoredPreference(storage)).toBe("dark");
  });

  it("never throws when storage is blocked", () => {
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(readStoredPreference(blocked)).toBe("system");
    expect(writeStoredPreference(blocked, "light")).toBe(false);
    expect(readStoredPreference(null)).toBe("system");
    expect(writeStoredPreference(null, "light")).toBe(false);
  });
});

describe("THEME_INIT_SCRIPT", () => {
  function run({
    stored,
    systemDark,
    storageThrows,
    noMatchMedia,
    matchMediaThrows,
  }: {
    stored?: string | null;
    systemDark?: boolean;
    storageThrows?: boolean;
    noMatchMedia?: boolean;
    matchMediaThrows?: boolean;
  }) {
    const documentElement = { dataset: {} as Record<string, string> };
    const localStorage = {
      getItem: (key: string) => {
        if (storageThrows) throw new Error("blocked");
        return key === THEME_STORAGE_KEY ? (stored ?? null) : null;
      },
    };
    const window = noMatchMedia
      ? {}
      : {
          matchMedia: (query: string) => {
            if (matchMediaThrows) throw new Error("boom");
            return { matches: query === "(prefers-color-scheme: dark)" && !!systemDark };
          },
        };
    new Function("document", "window", "localStorage", THEME_INIT_SCRIPT)(
      { documentElement },
      window,
      localStorage
    );
    return documentElement.dataset.theme;
  }

  it("defaults to system and resolves from the OS", () => {
    expect(run({ systemDark: true })).toBe("dark");
    expect(run({ systemDark: false })).toBe("light");
  });

  it("applies explicit light/dark over the OS", () => {
    expect(run({ stored: "light", systemDark: true })).toBe("light");
    expect(run({ stored: "dark", systemDark: false })).toBe("dark");
  });

  it("treats invalid values as system", () => {
    expect(run({ stored: "purple", systemDark: true })).toBe("dark");
  });

  it("still resolves when localStorage throws", () => {
    expect(run({ storageThrows: true, systemDark: true })).toBe("dark");
  });

  it("falls back to light when matchMedia is missing or throws", () => {
    expect(run({ noMatchMedia: true })).toBe("light");
    expect(run({ matchMediaThrows: true, stored: "system" })).toBe("light");
  });
});
