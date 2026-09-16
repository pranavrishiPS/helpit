import type { Release, ReleaseFunctionRole, ReleasePhase } from "./types";

export const RELEASE_PHASE_LABELS: Record<ReleasePhase, string> = {
  ux: "UX phase",
  art: "Art phase",
  animation: "Animation phase",
  dev: "Dev phase",
  qa: "QA phase",
};

export const RELEASE_PHASE_ORDER: ReleasePhase[] = [
  "ux",
  "art",
  "animation",
  "dev",
  "qa",
];

export const RELEASE_STATUS_LABELS: Record<Release["status"], string> = {
  idea: "Idea",
  spec_draft: "Spec draft",
  spec_ready: "Spec ready",
  in_dev: "In dev",
  qa: "QA",
  ready: "Ready to ship",
  live: "Live",
};

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
