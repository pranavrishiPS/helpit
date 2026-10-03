import path from "path";
import type { NextConfig } from "next";

const DATA_DIR = path.join(process.cwd(), "data").replace(/\\/g, "/");
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const nextConfig: NextConfig = {
  serverExternalPackages: ["googleapis", "@slack/web-api"],
  webpack: (config, { dev }) => {
    if (dev) {
      // data/ holds the runtime JSON store and its lock dirs. Watching it makes every
      // store read/write trigger a recompile, and requests racing that recompile hit
      // half-written build manifests ("Unexpected end of JSON input" 500s).
      const dataDir = new RegExp(`^${escapeRegExp(DATA_DIR)}(?:/|$)`, "i");
      const ignored = config.watchOptions?.ignored;
      config.watchOptions = {
        ...config.watchOptions,
        ignored:
          ignored instanceof RegExp
            ? new RegExp(`(?:${ignored.source})|(?:${dataDir.source})`, "i")
            : dataDir,
      };
    }
    return config;
  },
};

export default nextConfig;
