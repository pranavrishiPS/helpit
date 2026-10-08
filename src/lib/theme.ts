// Theme preference (System / Light / Dark) — docs/specs/dark-mode.md §4-§5.
// Pure helpers + the no-flash inline script that runs in <head> before first paint.

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "helpit-theme";
export const THEME_PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];
export const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

/** Missing or invalid stored values fall back to "system" (never rewritten). */
export function parseThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference === "system") return systemDark ? "dark" : "light";
  return preference;
}

/** localStorage read that never throws (private mode, blocked storage). */
export function readStoredPreference(storage: Pick<Storage, "getItem"> | null | undefined): ThemePreference {
  try {
    return parseThemePreference(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

/** localStorage write that never throws. Returns whether it persisted. */
export function writeStoredPreference(
  storage: Pick<Storage, "setItem"> | null | undefined,
  preference: ThemePreference
): boolean {
  try {
    if (!storage) return false;
    storage.setItem(THEME_STORAGE_KEY, preference);
    return true;
  } catch {
    return false;
  }
}

/**
 * Inline <head> script: read the stored preference, resolve it with matchMedia and
 * set <html data-theme> synchronously. Anything throwing falls back to light.
 * Kept self-contained (no imports at runtime) — it is serialized into the HTML.
 */
export const THEME_INIT_SCRIPT = `(function(){var d=document.documentElement;try{var p=null;try{p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)})}catch(e){}if(p!=="light"&&p!=="dark")p="system";var t=p==="system"?(window.matchMedia&&window.matchMedia(${JSON.stringify(
  DARK_MEDIA_QUERY
)}).matches?"dark":"light"):p;d.dataset.theme=t}catch(e){d.dataset.theme="light"}})();`;
