"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, Monitor, Moon, Sun, X } from "lucide-react";
import { NAV_ITEMS } from "@/lib/navigation";
import { MODULE_ICONS } from "@/lib/modules";
import { cn } from "@/lib/cn";
import { Button, ModuleChip, SegmentedControl, type SegmentedItem } from "@/components/ui";
import type { ThemePreference } from "@/lib/theme";
import { useTheme } from "@/lib/use-theme";
import { SlackSyncPoller } from "./SlackSyncPoller";
import { SlackRateLimitToast } from "./SlackRateLimitToast";
import { TaskReminderProvider } from "./TaskReminderProvider";

function BrandBlock() {
  return (
    <div className="flex items-center gap-3">
      <div
        aria-hidden="true"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-signal font-display text-lg font-bold leading-none text-on-signal"
      >
        H
      </div>
      <div className="min-w-0">
        <p className="font-display text-lg font-bold leading-6 text-white">Helpit</p>
        <p className="text-[11px] text-sidebar-muted">Command center</p>
      </div>
    </div>
  );
}

function SidebarNav({ onNavigate, large }: { onNavigate?: () => void; large?: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
      {NAV_ITEMS.map((item) => {
        const Icon = MODULE_ICONS[item.id];
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.id}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-control px-2 text-sm font-medium transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal",
              large ? "h-11" : "h-10",
              active
                ? "bg-white/[0.07] text-white"
                : "text-sidebar-foreground/85 hover:bg-white/[0.05] hover:text-white"
            )}
          >
            {active && (
              <span
                aria-hidden="true"
                className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-signal"
              />
            )}
            <span
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors duration-150",
                active ? "text-signal" : "text-sidebar-muted group-hover:text-white"
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function ThemeToggle() {
  const { preference, resolved, setPreference } = useTheme();
  const items: SegmentedItem<ThemePreference>[] = [
    { id: "system", label: preference === "system" ? `System (${resolved})` : "System", icon: Monitor },
    { id: "light", label: "Light", icon: Sun },
    { id: "dark", label: "Dark", icon: Moon },
  ];

  return (
    <SegmentedControl
      aria-label="Theme"
      tone="sidebar"
      size="sm"
      iconOnly
      value={preference}
      onChange={setPreference}
      items={items}
    />
  );
}

function SidebarFooter({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="mx-3 border-t border-white/5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
      <p className="px-2 text-[11px] text-sidebar-muted">PlaySimple Games · v0.1</p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onSignOut}
          className="flex h-8 items-center gap-2 rounded-lg px-2 text-xs text-sidebar-foreground transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          <LogOut aria-hidden="true" className="h-3.5 w-3.5" />
          Sign out
        </button>
        <ThemeToggle />
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = navOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [navOpen]);

  if (pathname === "/login") {
    return <>{children}</>;
  }

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const currentPage = NAV_ITEMS.find((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
  );

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      <SlackSyncPoller />
      <SlackRateLimitToast />
      <TaskReminderProvider />

      <aside className="hidden w-64 bg-sidebar shrink-0 flex-col border-r border-white/5 text-sidebar-foreground lg:flex">
        <div className="px-5 pb-5 pt-6">
          <BrandBlock />
        </div>
        <SidebarNav />
        <SidebarFooter onSignOut={handleSignOut} />
      </aside>

      {navOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 animate-fade-in bg-overlay backdrop-blur-[2px] lg:hidden"
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          />
          <aside className="fixed bg-sidebar inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] animate-drawer-in flex-col text-sidebar-foreground shadow-overlay lg:hidden">
            <div className="flex items-center justify-between px-5 pb-5 pt-6">
              <BrandBlock />
              <button
                type="button"
                onClick={() => setNavOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-control text-sidebar-muted transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarNav large onNavigate={() => setNavOpen(false)} />
            <SidebarFooter onSignOut={handleSignOut} />
          </aside>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card/85 px-3 backdrop-blur-md lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setNavOpen(true)}
            className="h-9 w-9 [&_svg]:h-5 [&_svg]:w-5"
            aria-label="Open menu"
          >
            <Menu />
          </Button>
          <ModuleChip module={currentPage?.id ?? "home"} size="sm" />
          <p className="min-w-0 truncate font-display text-[15px] font-semibold text-foreground">
            {currentPage?.label ?? "Helpit"}
          </p>
        </header>

        <div className="relative flex min-h-0 flex-1">
          <main className="min-w-0 bg-background flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 lg:px-8 lg:py-7">
            <div className="mx-auto w-full max-w-[1440px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
