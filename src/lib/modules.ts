import {
  CalendarRange,
  ClipboardCheck,
  Layers,
  LayoutDashboard,
  Link2,
  ListTodo,
  MessageSquare,
  Settings,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";
import { GmailIcon } from "@/components/ui/GmailIcon";
import type { ModuleId } from "./types";

export type { ModuleId };

/** Sidebar / page icon per module (shared by AppShell, PageHeader, Modal). */
/** Any icon component that takes a className (Lucide icons and brand marks like Gmail). */
export type ModuleIcon = ComponentType<{ className?: string }>;

export const MODULE_ICONS: Record<ModuleId, ModuleIcon> = {
  home: LayoutDashboard,
  tasks: ListTodo,
  scrum: ClipboardCheck,
  slack: MessageSquare,
  mail: GmailIcon,
  planning: CalendarRange,
  features: Layers,
  resources: Link2,
  outings: Users,
  settings: Settings,
};

/**
 * Module icon-chip classes. Deliberately the same neutral ink/paper treatment for
 * every module (no per-module hues) — the icon shape identifies the module.
 * `solid` = outlined paper chip with ink icon, `soft` = well fill, `text` = icon color on soft.
 */
const NEUTRAL_MODULE_STYLE = {
  solid: "bg-surface-2 text-foreground ring-1 ring-inset ring-border",
  soft: "bg-surface-2",
  text: "text-muted",
} as const;

export const MODULE_STYLES: Record<ModuleId, { solid: string; soft: string; text: string }> = {
  home: NEUTRAL_MODULE_STYLE,
  tasks: NEUTRAL_MODULE_STYLE,
  scrum: NEUTRAL_MODULE_STYLE,
  slack: NEUTRAL_MODULE_STYLE,
  mail: NEUTRAL_MODULE_STYLE,
  planning: NEUTRAL_MODULE_STYLE,
  features: NEUTRAL_MODULE_STYLE,
  resources: NEUTRAL_MODULE_STYLE,
  outings: NEUTRAL_MODULE_STYLE,
  settings: NEUTRAL_MODULE_STYLE,
};
