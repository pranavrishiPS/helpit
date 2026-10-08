"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DARK_MEDIA_QUERY,
  THEME_STORAGE_KEY,
  parseThemePreference,
  readStoredPreference,
  resolveTheme,
  writeStoredPreference,
  type ResolvedTheme,
  type ThemePreference,
} from "./theme";

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Switch data-theme instantly: suppress CSS transitions (e.g. Card bg/border) for one frame. */
function applyTheme(theme: ResolvedTheme) {
  const root = document.documentElement;
  if (root.dataset.theme === theme) return;
  root.classList.add("theme-switching");
  root.dataset.theme = theme;
  // Force a style flush so the new colors are computed while transitions are off
  void window.getComputedStyle(root).backgroundColor;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => root.classList.remove("theme-switching"));
  });
}

/**
 * Theme preference state. `preference` is null until mounted (pre-hydration: nothing
 * selected). Follows the OS live on System and syncs other tabs via the storage event.
 */
export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference | null>(null);
  const [systemDark, setSystemDark] = useState(false);
  const preferenceRef = useRef<ThemePreference>("system");

  useEffect(() => {
    const media = typeof window.matchMedia === "function" ? window.matchMedia(DARK_MEDIA_QUERY) : null;
    const initial = readStoredPreference(safeLocalStorage());
    preferenceRef.current = initial;
    setPreferenceState(initial);
    setSystemDark(media?.matches ?? false);
    applyTheme(resolveTheme(initial, media?.matches ?? false));

    function onMediaChange(event: MediaQueryListEvent) {
      setSystemDark(event.matches);
      if (preferenceRef.current === "system") applyTheme(event.matches ? "dark" : "light");
    }

    function onStorage(event: StorageEvent) {
      // key === null means storage was cleared
      if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
      const next = parseThemePreference(event.key === null ? null : event.newValue);
      preferenceRef.current = next;
      setPreferenceState(next);
      applyTheme(resolveTheme(next, media?.matches ?? false));
    }

    media?.addEventListener("change", onMediaChange);
    window.addEventListener("storage", onStorage);
    return () => {
      media?.removeEventListener("change", onMediaChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    if (next === preferenceRef.current) return;
    preferenceRef.current = next;
    setPreferenceState(next);
    writeStoredPreference(safeLocalStorage(), next);
    const dark = typeof window.matchMedia === "function" && window.matchMedia(DARK_MEDIA_QUERY).matches;
    applyTheme(resolveTheme(next, dark));
  }, []);

  return {
    preference,
    resolved: resolveTheme(preference ?? "system", systemDark),
    setPreference,
  };
}
