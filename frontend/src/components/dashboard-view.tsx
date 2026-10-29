"use client";

import { ArrowUpRight, CalendarClock, CreditCard, Dumbbell, UsersRound } from "lucide-react";
import { BarChart, Bar, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MetricsCard } from "@/components/metrics-card";
import { useGymData } from "@/components/gym-data-provider";
import Link from "next/link";
import { localDateString, useCurrentDate } from "@/lib/use-current-date";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "MWK",
  maximumFractionDigits: 0,
});

const addDays = (date: string, days: number) => {
  const result = new Date(`${date}T12:00:00`);
  result.setDate(result.getDate() + days);
  return result.toISOString().slice(0, 10);
};
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function DashboardView() {
  const { members, memberships, payments, attendance, settings, currentUser } = useGymData();
  const todayDate = useCurrentDate();
  if (!todayDate) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading dashboard…</div>;
  }
  const currentMonth = todayDate.slice(0, 7);
  const eligibleMemberships = memberships.filter((item) => item.startDate <= todayDate && item.endDate >= todayDate);
  const totalMembers = members.length;
  const activeMemberIds = new Set(members.filter((member) => member.status === "active").map((member) => member.id));
  const activeMembers = new Set(eligibleMemberships.filter((item) => item.paymentStatus !== "unpaid" && activeMemberIds.has(item.memberId)).map((item) => item.memberId)).size;
  const expiredMemberships = memberships.filter((item) => item.endDate < todayDate).length;
  const membershipExpiringSoon = memberships.filter((item) => item.endDate >= todayDate && item.endDate <= addDays(todayDate, settings.expiryWarningDays)).length;
  const todaysAttendance = attendance.filter((record) => localDateString(new Date(record.checkedInAt)) === todayDate).length;
  const clearedPayments = payments.filter((payment) => payment.status === "cleared");
  const revenueToday = clearedPayments.filter((payment) => payment.date === todayDate).reduce((sum, payment) => sum + payment.amount, 0);
  const monthlyRevenue = clearedPayments.filter((payment) => payment.date.startsWith(currentMonth)).reduce((sum, payment) => sum + payment.amount, 0);
  const outstandingBalance = memberships.reduce((sum, item) => sum + item.amountDue, 0);
  const revenueByMonth = Array.from({ length: 6 }, (_, index) => {
    const month = new Date(`${todayDate.slice(0, 7)}-01T12:00:00`);
    month.setDate(1);
    month.setMonth(month.getMonth() - (5 - index));
    const key = dateKey(month).slice(0, 7);
    return {
      label: month.toLocaleDateString("en", { month: "short" }),
      revenue: clearedPayments.filter((payment) => payment.date.startsWith(key)).reduce((sum, payment) => sum + payment.amount, 0),
    };
  });
  const membershipTrend = revenueByMonth.map((point, index) => {
    const month = new Date(`${todayDate.slice(0, 7)}-01T12:00:00`);
    month.setMonth(month.getMonth() - (5 - index));
    const key = dateKey(month).slice(0, 7);
    return {
      label: point.label,
      count: memberships.filter((item) => item.startDate.startsWith(key)).length,
    };
  });
  const methodTotals = ["Cash", "Bank transfer", "Mobile money"].map((name) => ({
    name,
    amount: clearedPayments.filter((payment) => payment.method === name).reduce((sum, payment) => sum + payment.amount, 0),
  }));
  const methodTotal = methodTotals.reduce((sum, item) => sum + item.amount, 0);
  const paymentMethodsData = methodTotals.map((item) => ({ name: item.name, value: methodTotal ? Math.round((item.amount / methodTotal) * 100) : 0 }));
  const recentPayments = [...payments].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  const recentAttendance = [...attendance].sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt)).slice(0, 4);
  const upcomingExpiries = memberships.filter((item) => item.endDate >= todayDate && item.endDate <= addDays(todayDate, 30)).slice(0, 4);

  if (currentUser?.role === "receptionist") {
    const activeMemberships = memberships.filter((item) =>
      item.startDate <= todayDate &&
      item.endDate >= todayDate &&
      item.paymentStatus !== "unpaid" &&
      members.some((member) => member.id === item.memberId && member.status === "active" && !member.isArchived),
    ).length;
    const todayPayments = clearedPayments
      .filter((payment) => payment.date === todayDate)
      .reduce((sum, payment) => sum + payment.amount, 0);

    return (
      <div className="space-y-6">
        <section className="rounded-2xl bg-slate-950 p-6 text-white shadow-sm">
          <p className="text-sm font-medium text-slate-300">Reception overview</p>
          <h2 className="mt-1 text-2xl font-semibold">Welcome, {currentUser.firstName || currentUser.username}</h2>
          <p className="mt-2 text-sm text-slate-300">Quick access to today&apos;s member services and front-desk activity.</p>
        </section>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricsCard title="Members" value={String(members.filter((member) => !member.isArchived).length)} change="Registered member records" icon={<UsersRound className="h-5 w-5" />} tone="blue" />
          <MetricsCard title="Eligible memberships" value={String(activeMemberships)} change="Active and cleared for access" icon={<Dumbbell className="h-5 w-5" />} tone="emerald" />
          <MetricsCard title="Today's check-ins" value={String(todaysAttendance)} change="Visits recorded today" icon={<CalendarClock className="h-5 w-5" />} tone="default" />
          <MetricsCard title="Today's payments" value={currencyFormatter.format(todayPayments)} change="Cleared payments recorded today" icon={<CreditCard className="h-5 w-5" />} tone="amber" />
        </div>
        <section className="grid gap-4 sm:grid-cols-3">
          {[
            { href: "/attendance", title: "Record attendance", description: "Scan a member QR code or find a member to check in." },
            { href: "/members", title: "Manage members", description: "Find a member, review their records, or assign a membership." },
            { href: "/payments", title: "Record payment", description: "Enter a payment and provide the member with a receipt." },
          ].map((item) => (
            <Link key={item.href} href={item.href} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-400 hover:shadow">
              <h3 className="font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p>
              <span className="mt-4 inline-block text-sm font-medium text-slate-800">Open →</span>
            </Link>
          ))}
        </section>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Recent check-ins</h2>
            <p className="mt-1 text-sm text-slate-500">Latest attendance activity across the gym.</p>
          </div>
          {recentAttendance.length ? <div className="divide-y divide-slate-100">
            {recentAttendance.map((record) => <div key={record.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
              <div><p className="font-medium text-slate-900">{record.memberName}</p><p className="text-xs text-slate-500">{record.memberId}</p></div>
              <time className="shrink-0 text-slate-500">{new Date(record.checkedInAt).toLocaleString()}</time>
            </div>)}
          </div> : <p className="px-5 py-8 text-center text-sm text-slate-500">No recent check-ins.</p>}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricsCard title="Total registered members" value={String(totalMembers)} change="Across all active and inactive records" icon={<UsersRound className="h-5 w-5" />} tone="blue" />
        <MetricsCard title="Active members" value={String(activeMembers)} change="Currently eligible for access" icon={<Dumbbell className="h-5 w-5" />} tone="emerald" />
        <MetricsCard title="Expired memberships" value={String(expiredMemberships)} change="Requires renewal follow-up" icon={<CalendarClock className="h-5 w-5" />} tone="rose" />
        <MetricsCard title="Members expiring soon" value={String(membershipExpiringSoon)} change={`Within ${settings.expiryWarningDays} days`} icon={<ArrowUpRight className="h-5 w-5" />} tone="amber" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricsCard title="Today's attendance" value={String(todaysAttendance)} change="Check-ins recorded today" icon={<UsersRound className="h-5 w-5" />} tone="default" />
        <MetricsCard title="Revenue collected today" value={currencyFormatter.format(revenueToday)} change="Cleared billing only" icon={<CreditCard className="h-5 w-5" />} tone="emerald" />
        <MetricsCard title="Revenue collected this month" value={currencyFormatter.format(monthlyRevenue)} change="Across all monthly totals" icon={<CreditCard className="h-5 w-5" />} tone="blue" />
        <MetricsCard title="Open balance" value={currencyFormatter.format(outstandingBalance)} change="Outstanding and partial payments" icon={<CalendarClock className="h-5 w-5" />} tone="amber" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Monthly revenue</p>
              <h3 className="text-lg font-semibold text-slate-900">Membership revenue</h3>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueByMonth}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip formatter={(value) => currencyFormatter.format(Number(value ?? 0))} />
                <Bar dataKey="revenue" radius={[10, 10, 0, 0]} fill="#111827" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Payment mix</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">Revenue channels</h3>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={paymentMethodsData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={82} paddingAngle={2}>
                  {paymentMethodsData.map((entry, index) => (
                    <Cell key={entry.name} fill={index === 0 ? "#111827" : index === 1 ? "#64748b" : "#0f172a"} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${Number(value ?? 0)}%`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Recent payments</h3>
            <button type="button" className="text-sm font-medium text-slate-600">View all</button>
          </div>
          <div className="space-y-3">
            {recentPayments.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5">
                <div>
                  <p className="font-medium text-slate-800">{payment.memberName}</p>
                  <p className="text-xs text-slate-500">{payment.method} • {payment.type}</p>
                </div>
                <div className="text-right">
                  <p className={`font-semibold ${payment.amount < 0 ? "text-rose-700" : "text-slate-900"}`}>{currencyFormatter.format(payment.amount)}</p>
                  <p className="text-xs text-slate-500">{payment.date}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Recent check-ins</h3>
            <button type="button" className="text-sm font-medium text-slate-600">View today</button>
          </div>
          <div className="space-y-3">
            {recentAttendance.map((record) => (
              <div key={record.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5">
                <div>
                  <p className="font-medium text-slate-800">{record.memberName}</p>
                  <p className="text-xs text-slate-500">{new Date(record.checkedInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                  Checked in
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Upcoming membership expiries</h3>
          <div className="mt-4 space-y-3">
            {upcomingExpiries.map((membership) => (
              <div key={membership.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5">
                <div>
                  <p className="font-medium text-slate-800">{membership.memberName}</p>
                  <p className="text-xs text-slate-500">{membership.planName}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-900">{membership.endDate}</p>
                  <p className="text-xs text-amber-600">Expires soon</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Memberships started</h3>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={membershipTrend}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip formatter={(value) => Number(value ?? 0)} />
                <Bar dataKey="count" fill="#1f2937" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
