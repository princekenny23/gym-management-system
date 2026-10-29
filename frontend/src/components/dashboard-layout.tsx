"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell, type NavKey } from "@/components/app-shell";
import { GymDataProvider, useGymData } from "@/components/gym-data-provider";
import { LoginView } from "@/components/login-view";

const routeTitles: Record<string, NavKey> = {
  "/": "Dashboard",
  "/members": "Members",
  "/payments": "Payments",
  "/attendance": "Attendance",
  "/reports": "Reports",
  "/staff": "Staff & Users",
  "/settings": "Settings",
};

export function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <GymDataProvider>
      <AuthenticatedDashboard>{children}</AuthenticatedDashboard>
    </GymDataProvider>
  );
}

function AuthenticatedDashboard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, authReady } = useGymData();
  const activeNav = routeTitles[pathname] ?? "Dashboard";
  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role === "member" && pathname !== "/portal") {
      router.replace("/portal");
    } else if (currentUser.role !== "member" && (pathname === "/portal" || pathname === "/login")) {
      router.replace("/");
    }
  }, [currentUser, pathname, router]);

  if (!authReady) return null;
  if (!currentUser) return <LoginView />;
  if (pathname === "/login" || (currentUser.role === "member" && pathname !== "/portal") || (currentUser.role !== "member" && pathname === "/portal")) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-sm text-slate-600">Opening your dashboard…</main>;
  }
  if (currentUser.role === "member") {
    return <>{children}</>;
  }
  if (
    currentUser.role !== "administrator" &&
    (pathname === "/staff" || pathname === "/settings")
  ) {
    return (
      <AppShell title={activeNav} activeNav={activeNav}>
        <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          This page is restricted to administrators. Your account is signed in as a receptionist.
        </div>
      </AppShell>
    );
  }
  return <AppShell title={activeNav} activeNav={activeNav}>{children}</AppShell>;
}
