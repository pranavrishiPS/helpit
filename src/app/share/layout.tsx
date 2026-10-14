import type { Metadata } from "next";

// Public share pages: outside the app shell (AppShell skips /share/*), never indexed, and no
// Helpit branding (neutral title; no app manifest, app title or app icons).
export const metadata: Metadata = {
  title: { absolute: "Release Calendar" },
  description: null,
  applicationName: null,
  appleWebApp: null,
  manifest: null,
  icons: null,
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
    </div>
  );
}
