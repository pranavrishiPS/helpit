import { brandTile } from "@/lib/pwa-icon";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return brandTile(32, { scale: 0.76, radius: 7 });
}
