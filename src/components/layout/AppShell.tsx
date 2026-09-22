"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListTodo,
  ClipboardCheck,
  MessageSquare,
  Mail,
  CalendarRange,
  Layers,
  Link2,
  Users,
  Settings,
  Sparkles,
  Menu,
  X,
} from "lucide-react";
import { NAV_ITEMS } from "@/lib/navigation";
import { cn } from "@/lib/cn";
import { ChatPanel } from "./ChatPanel";
import { SlackSyncPoller } from "./SlackSyncPoller";
import { SlackRateLimitToast } from "./SlackRateLimitToast";
import { TaskReminderProvider } from "./TaskReminderProvider";

const ICONS = {
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
} as const;

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {NAV_ITEMS.map((item) => {
        const Icon = ICONS[item.id];
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.id}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
              active
                ? "bg-white/10 text-white"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [chatOpen, setChatOpen] = useState(false);
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

  const currentPage = NAV_ITEMS.find((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
  );

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      <SlackSyncPoller />
      <SlackRateLimitToast />
      <TaskReminderProvider />

      <aside className="hidden w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white">Helpit</h1>
              <p className="text-xs text-slate-400">Command center</p>
            </div>
          </div>
        </div>
        <SidebarNav />
        <div className="border-t border-white/10 px-4 py-4">
          <p className="text-xs text-slate-500">PlaySimple Games</p>
          <p className="text-xs text-slate-400">v0.1 — building daily</p>
        </div>
      </aside>

      {navOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-sidebar text-sidebar-foreground shadow-xl lg:hidden">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h1 className="text-sm font-semibold text-white">Helpit</h1>
                  <p className="text-xs text-slate-400">Command center</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNavOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarNav onNavigate={() => setNavOpen(false)} />
            <div className="border-t border-white/10 px-4 py-4">
              <p className="text-xs text-slate-500">PlaySimple Games</p>
            </div>
          </aside>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            className="rounded-lg p-2 text-muted hover:bg-slate-100 hover:text-foreground"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-brand">
              {currentPage?.label ?? "Helpit"}
            </p>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pb-24 sm:p-6 sm:pb-24">
            {children}
          </main>

          <div className="pointer-events-none fixed bottom-4 left-4 right-4 z-20 flex flex-col items-stretch gap-3 sm:left-auto sm:right-6 sm:bottom-6 sm:items-end sm:w-auto">
            {chatOpen && (
              <div className="pointer-events-auto w-full sm:w-auto">
                <ChatPanel onClose={() => setChatOpen(false)} />
              </div>
            )}
            {!chatOpen && (
              <button
                onClick={() => setChatOpen(true)}
                aria-label="Open assistant"
                className={cn(
                  "pointer-events-auto ml-auto flex cursor-pointer items-center gap-2 rounded-full px-4 py-3 text-sm font-medium transition-all",
                  "shadow-[0_12px_40px_-8px_rgba(15,23,42,0.22),0_8px_16px_-6px_rgba(15,23,42,0.12)]",
                  "bg-accent text-white hover:bg-accent-hover"
                )}
              >
                <Sparkles className="h-4 w-4" />
                <span className="hidden sm:inline">Assistant</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
