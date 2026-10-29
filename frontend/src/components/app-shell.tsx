"use client";

import {
  LayoutDashboard,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Settings,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useGymData } from "@/components/gym-data-provider";
import { useState } from "react";

export type NavKey =
  | "Dashboard"
  | "Members"
  | "Payments"
  | "Attendance"
  | "Reports"
  | "Staff & Users"
  | "Settings";

const navItems: Array<{ key: NavKey; icon: typeof LayoutDashboard }> = [
  { key: "Dashboard", icon: LayoutDashboard },
  { key: "Members", icon: Users },
  { key: "Payments", icon: Wallet },
  { key: "Attendance", icon: MessageSquareText },
  { key: "Reports", icon: ReceiptText },
  { key: "Staff & Users", icon: Users },
  { key: "Settings", icon: Settings },
];

const navPaths: Record<NavKey, string> = {
  Dashboard: "/",
  Members: "/members",
  Payments: "/payments",
  Attendance: "/attendance",
  Reports: "/reports",
  "Staff & Users": "/staff",
  Settings: "/settings",
};

interface AppShellProps {
  title: string;
  activeNav: NavKey;
  children: ReactNode;
}

export function AppShell({ title, activeNav, children }: AppShellProps) {
  const { settings, currentUser, signOut } = useGymData();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const visibleNavItems = navItems.filter(({ key }) =>
    currentUser?.role === "administrator" || !["Staff & Users", "Settings"].includes(key),
  );
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <aside className={`sticky top-0 hidden h-screen shrink-0 self-start flex-col overflow-y-auto bg-slate-950 text-slate-100 transition-[width] duration-200 lg:flex ${sidebarCollapsed ? "w-20" : "w-72"}`}>
          <div className={`flex items-center justify-between border-b border-slate-800 py-5 ${sidebarCollapsed ? "px-4" : "px-6"}`}>
            <div className="flex items-center gap-3">
              <div title={settings.gymName || "Gym"} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 font-semibold text-white">{settings.logoText || "GYM"}</div>
              {!sidebarCollapsed ? <div>
                <p className="text-sm font-medium text-slate-300">Gym management</p>
                <p className="text-lg font-semibold">{settings.gymName || "Gym not configured"}</p>
              </div> : null}
            </div>
            <button type="button" onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!sidebarCollapsed} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white">
              {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>

          <nav aria-label="Main navigation" className={`mt-6 flex-1 space-y-1 ${sidebarCollapsed ? "px-2" : "px-3"}`}>
            {visibleNavItems.map(({ key, icon: Icon }) => {
              const selected = activeNav === key;
              return (
                <Link
                  key={key}
                  href={navPaths[key]}
                  title={sidebarCollapsed ? key : undefined}
                  aria-current={selected ? "page" : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                    selected
                      ? "bg-slate-800 text-white shadow-sm"
                      : "text-slate-300 hover:bg-slate-900 hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {!sidebarCollapsed ? key : null}
                </Link>
              );
            })}
          </nav>

        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-slate-200 bg-white/80 px-4 py-4 backdrop-blur sm:px-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setMobileNavOpen((open) => !open)} className="rounded-lg border border-slate-200 p-2 lg:hidden" aria-label={mobileNavOpen ? "Close menu" : "Open menu"} aria-expanded={mobileNavOpen}>
                  {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Gym management</p>
                  <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
                </div>
              </div>
              {currentUser ? (
                <div className="flex items-center gap-3">
                  <div className="hidden text-right sm:block">
                    <p className="text-sm font-medium text-slate-800">{currentUser.username}</p>
                    <p className="text-xs capitalize text-slate-500">{currentUser.role}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void signOut().catch((error: unknown) => setSignOutError(error instanceof Error ? error.message : "Sign-out failed."))}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700"
                  >
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </header>

          {signOutError ? <p role="alert" className="bg-rose-50 px-4 py-2 text-sm text-rose-700">{signOutError}</p> : null}
          {mobileNavOpen ? (
            <nav aria-label="Mobile navigation" className="grid grid-cols-2 gap-2 border-b border-slate-200 bg-white p-3 lg:hidden">
              {visibleNavItems.map(({ key, icon: Icon }) => (
                <Link
                  key={key}
                  href={navPaths[key]}
                  onClick={() => setMobileNavOpen(false)}
                  aria-current={activeNav === key ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ${
                    activeNav === key ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-700"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {key}
                </Link>
              ))}
            </nav>
          ) : null}

          <main className="flex-1 bg-slate-100 p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
