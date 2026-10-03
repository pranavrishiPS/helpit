import {
  CalendarRange,
  ClipboardCheck,
  Layers,
  LayoutDashboard,
  Link2,
  ListTodo,
  Mail,
  MessageSquare,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ModuleId } from "./types";

export type { ModuleId };

/** Sidebar / page icon per module (shared by AppShell, PageHeader, Modal). */
export const MODULE_ICONS: Record<ModuleId, LucideIcon> = {
  home: LayoutDashboard,
  tasks: ListTodo,
  scrum: ClipboardCheck,
  slack: MessageSquare,
  mail: Mail,
  planning: CalendarRange,
  features: Layers,
  resources: Link2,
  outings: Users,
  settings: Settings,
};

/**
 * Per-module hue classes. Written out in full so Tailwind can detect them.
 * `solid` = filled chip (white icon), `soft` = tinted chip, `text` = icon color on soft.
 */
export const MODULE_STYLES: Record<ModuleId, { solid: string; soft: string; text: string }> = {
  home: { solid: "bg-brand-gradient", soft: "bg-accent-soft", text: "text-accent" },
  tasks: { solid: "bg-mod-tasks", soft: "bg-mod-tasks/12", text: "text-mod-tasks" },
  scrum: { solid: "bg-mod-scrum", soft: "bg-mod-scrum/12", text: "text-mod-scrum" },
  slack: { solid: "bg-mod-slack", soft: "bg-mod-slack/12", text: "text-mod-slack" },
  mail: { solid: "bg-mod-mail", soft: "bg-mod-mail/12", text: "text-mod-mail" },
  planning: { solid: "bg-mod-planning", soft: "bg-mod-planning/12", text: "text-mod-planning" },
  features: { solid: "bg-mod-features", soft: "bg-mod-features/12", text: "text-mod-features" },
  resources: { solid: "bg-mod-resources", soft: "bg-mod-resources/12", text: "text-mod-resources" },
  outings: { solid: "bg-mod-outings", soft: "bg-mod-outings/12", text: "text-mod-outings" },
  settings: { solid: "bg-mod-settings", soft: "bg-mod-settings/12", text: "text-mod-settings" },
};
