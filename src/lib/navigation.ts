import type { NavChildItem, NavItem } from "./types";

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
    id: "scrum",
    label: "Scrum attendance",
    href: "/scrum",
    description: "Daily standup attendance and individual insights",
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
    // Not "/planning-2027": a prefix match would also light up Planning.
    id: "lrp2027",
    label: "2027 Planning",
    href: "/lrp-2027",
    description: "Capacity plan and swag costing for 2027",
    children: [
      { id: "capacity", label: "Capacity Plan", href: "/lrp-2027/capacity" },
      { id: "swag-costing", label: "Swag Costing", href: "/lrp-2027/swag-costing" },
    ],
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

/** True when `pathname` is `href` or nested under it (segment-aware, so "/planning" never matches "/planning-x"). */
export function isPathUnder(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Nav item (and child, for groups) that owns the current route. */
export function findActiveNav(
  pathname: string,
  items: NavItem[] = NAV_ITEMS
): { item: NavItem; child?: NavChildItem } | undefined {
  for (const item of items) {
    if (item.children) {
      const child = item.children.find((c) => isPathUnder(pathname, c.href));
      if (child) return { item, child };
      if (isPathUnder(pathname, item.href)) return { item };
    } else if (isPathUnder(pathname, item.href)) {
      return { item };
    }
  }
  return undefined;
}
