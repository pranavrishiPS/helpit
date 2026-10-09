import { cn } from "@/lib/cn";

/** Helpit "full stop" mark: lowercase h + signal-orange square. Glyph uses currentColor. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={cn("shrink-0", className)}>
      <path
        d="M28 12V88M28 56C28 42 37 34 49 34C61 34 70 42 70 56V88"
        stroke="currentColor"
        strokeWidth="14"
        fill="none"
      />
      <rect x="80" y="74" width="14" height="14" className="fill-signal" />
    </svg>
  );
}

/** "helpit." wordmark — the full stop is a signal-orange square. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("inline-flex items-baseline font-display font-bold tracking-[-0.035em]", className)}>
      helpit
      <span aria-hidden="true" className="ml-[0.06em] inline-block h-[0.17em] w-[0.17em] bg-signal" />
    </span>
  );
}
