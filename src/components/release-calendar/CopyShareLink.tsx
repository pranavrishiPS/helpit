"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { Popover } from "@/components/ui/Popover";

/** Full share URL for a share path, using the origin the owner is browsing on. */
export function shareUrlFor(path: string): string {
  return typeof window === "undefined" ? path : `${window.location.origin}${path}`;
}

/** Clipboard copy with a 2s "Copied" state. Resolves false when the clipboard is blocked. */
export function useCopyText() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return false;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
    return true;
  }, []);

  return { copied, copy };
}

/** Read-only URL field shown when the clipboard is blocked; text pre-selected for manual copy. */
export function ShareUrlPopover({
  anchor,
  url,
  onClose,
}: {
  anchor: HTMLElement | null;
  url: string;
  onClose: () => void;
}) {
  return (
    <Popover anchor={anchor} onClose={onClose} labelledBy="share-url-label" className="w-80 max-w-[calc(100vw-1rem)] p-3">
      <p id="share-url-label" className="mb-2 text-xs text-muted">
        Copy this link:
      </p>
      <Input
        size="sm"
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="font-mono text-xs"
        aria-labelledby="share-url-label"
      />
    </Popover>
  );
}

/** Header "Copy share link" button (laptop). */
export function CopyShareLinkButton({ path }: { path: string }) {
  const { copied, copy } = useCopyText();
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const url = shareUrlFor(path);

  async function handleClick() {
    if (!(await copy(shareUrlFor(path)))) setFallbackOpen(true);
  }

  return (
    <>
      <Button ref={ref} variant="ghost" size="sm" onClick={handleClick}>
        {copied ? <Check /> : <Link2 />}
        {copied ? "Copied" : "Copy share link"}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? "Share link copied" : ""}
      </span>
      {fallbackOpen && (
        <ShareUrlPopover
          anchor={ref.current}
          url={url}
          onClose={() => {
            setFallbackOpen(false);
            ref.current?.focus();
          }}
        />
      )}
    </>
  );
}
