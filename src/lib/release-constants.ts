import type { ReleaseFunctionRole } from "./types";

export const RELEASE_FUNCTION_LABELS: Record<ReleaseFunctionRole, string> = {
  product: "Product",
  ux: "UX",
  designer: "Game Designer",
  art: "Art",
  tech_art: "Tech Art",
  devs: "Devs",
  qa: "QA",
};

export const RELEASE_FUNCTION_SHORT_LABELS: Record<ReleaseFunctionRole, string> = {
  product: "Product",
  ux: "UX",
  designer: "GD",
  art: "Art",
  tech_art: "Tech Art",
  devs: "Devs",
  qa: "QA",
};

export const RELEASE_FUNCTION_ORDER: ReleaseFunctionRole[] = [
  "product",
  "ux",
  "designer",
  "art",
  "tech_art",
  "devs",
  "qa",
];
