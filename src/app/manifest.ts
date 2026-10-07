import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
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
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
