import type { MetadataRoute } from "next";
import { ICON_VERSION } from "@/lib/pwa-icon";

// Served as a route (not the file-based app/manifest.ts) so the root layout links it via
// metadata.manifest and /share pages can drop the link (manifest: null) to stay unbranded.
export const dynamic = "force-static";

export function GET() {
  const manifest: MetadataRoute.Manifest = {
    name: "Helpit — Your command center",
    short_name: "Helpit",
    description: "Daily office dashboard for game producers",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // Literal values mirror --background / --signal (manifests can't read CSS vars).
    background_color: "#F6F4EF",
    theme_color: "#E8590C",
    icons: [
      { src: `/icon-192?v=${ICON_VERSION}`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `/icon-512?v=${ICON_VERSION}`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `/icon-maskable?v=${ICON_VERSION}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return Response.json(manifest, { headers: { "Content-Type": "application/manifest+json" } });
}
