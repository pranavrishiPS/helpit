import { pwaIcon } from "@/lib/pwa-icon";

// Next hashes this file into the apple-touch-icon URL; edit it (e.g. this line) when the artwork changes. v2: full-stop mark.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return pwaIcon(180, true);
}
