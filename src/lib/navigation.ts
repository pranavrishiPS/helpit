import type { NavItem } from "./types";

export const NAV_ITEMS: NavItem[] = [
  {
    id: "home",
    label: "Home",
    href: "/",
    description: "Today's overview and quick actions",
  },
  {
    id: "tasks",
    label: "Tasks",
    href: "/tasks",
    description: "Todos, deadlines, and follow-ups",
  },
  {
    id: "slack",
    label: "Slack",
    href: "/slack",
    description: "Open threads, reminders, and actions",
  },
  {
    id: "mail",
    label: "Mail",
    href: "/mail",
    description: "Gmail inbox, sprint approvals, and reminders",
  },
  {
    id: "planning",
    label: "Planning",
    href: "/planning",
    description: "Releases, deadlines, and sprint scope",
  },
  {
    id: "features",
    label: "Feature tracker",
    href: "/features",
    description: "In-progress features, effort costing, and milestones",
  },
  {
    id: "resources",
    label: "Resources",
    href: "/resources",
    description: "Docs, Figma, Sheets, Slides, and links",
  },
  {
    id: "outings",
    label: "Outings",
    href: "/outings",
    description: "Budget, attendance, and spends",
  },
  {
    id: "settings",
    label: "Settings",
    href: "/settings",
    description: "Profile and integrations",
  },
];
