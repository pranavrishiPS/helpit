import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge the custom theme scales from globals.css so e.g.
// `rounded-control` vs `rounded-full` or `shadow-card` vs `shadow-raised` dedupe.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["chip", "control", "card", "modal"],
      shadow: ["card", "raised", "overlay", "glow", "chip"],
      animate: ["fade-in", "scale-in", "sheet-up", "drawer-in", "pop"],
      ease: ["soft"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
