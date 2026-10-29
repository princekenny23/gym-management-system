"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, CreditCard, House, QrCode, RefreshCw, UserRound } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { apiFetch, responseError } from "@/lib/api-client";
import { useGymData } from "@/components/gym-data-provider";
import type { AttendanceRecord, Member, Membership, Payment } from "@/types/gym";

interface PortalData {
  member: Member;
  memberships: Membership[];
  payments: Payment[];
  attendance: AttendanceRecord[];
}

interface MemberQr {
  token: string;
  expiresAt: string;
}

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "MWK", maximumFractionDigits: 0 });
const portalModules = [
  { id: "overview", label: "Overview", icon: House },
  { id: "memberships", label: "Memberships", icon: BadgeCheck },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "attendance", label: "Attendance", icon: QrCode },
  { id: "profile", label: "My profile", icon: UserRound },
] as const;
type PortalModule = (typeof portalModules)[number]["id"];

export function MemberPortalView() {
  const { currentUser, signOut } = useGymData();
  const [activeModule, setActiveModule] = useState<PortalModule>("overview");
  const [data, setData] = useState<PortalData | null>(null);
  const [qr, setQr] = useState<MemberQr | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrLoading, setQrLoading] = useState(false);
  const [error, setError] = useState("");
  const [qrError, setQrError] = useState("");

  useEffect(() => {
    let active = true;
    apiFetch("/member-portal/me/")
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response));
        return (await response.json()) as PortalData;
      })
      .then((portal) => {
        if (active) {
          setData(portal);
          setError("");
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Member portal details could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!data) return;
    let active = true;
    const refreshQr = async () => {
      setQrLoading(true);
      try {
        const response = await apiFetch("/member-portal/qr/");
        if (!response.ok) throw new Error(await responseError(response));
        const freshQr = (await response.json()) as MemberQr;
        if (active) {
          setQr(freshQr);
          setQrError("");
        }
      } catch (reason) {
        if (active) {
          setQr(null);
          setQrError(reason instanceof Error ? reason.message : "A check-in QR code could not be generated.");
        }
      } finally {
        if (active) setQrLoading(false);
      }
    };
    void refreshQr();
    const timer = window.setInterval(() => void refreshQr(), 120_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [data]);

  const outstandingBalance = data?.memberships
    .filter((membership) => !membership.isArchived && membership.amountDue > 0)
    .reduce((total, membership) => total + membership.amountDue, 0) ?? 0;
  const latestMembership = data?.memberships.find((membership) => !membership.isArchived);

  const refreshQr = () => {
    setQrError("");
    setQrLoading(true);
    void apiFetch("/member-portal/qr/")
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response));
        setQr((await response.json()) as MemberQr);
      })
      .catch((reason: unknown) => {
        setQr(null);
        setQrError(reason instanceof Error ? reason.message : "A check-in QR code could not be generated.");
      })
      .finally(() => setQrLoading(false));
  };
  const selectedModule = portalModules.find((module) => module.id === activeModule);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[90rem] flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-sm font-semibold text-white">{currentUser?.logoText || "GYM"}</div>
            <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">{currentUser?.gymName || "Member portal"}</p><p className="text-lg font-semibold">{data?.member.name || currentUser?.username || "Member"}</p></div>
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <span className="text-sm text-slate-500">Member account</span>
            <button type="button" onClick={() => void signOut().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Sign-out failed."))} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Sign out</button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[90rem] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-6 lg:px-8 lg:py-8">
        <aside className="hidden lg:block">
          <nav aria-label="Member portal" className="sticky top-6 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">My account</p>
            <div className="space-y-1">
              {portalModules.map(({ id, label, icon: Icon }) => (
                <button key={id} type="button" aria-current={activeModule === id ? "page" : undefined} onClick={() => setActiveModule(id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${activeModule === id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}>
                  <Icon className="h-4 w-4" />{label}
                </button>
              ))}
            </div>
          </nav>
        </aside>

        <main className="min-w-0 space-y-5">
          <nav aria-label="Member portal modules" className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm lg:hidden">
            {portalModules.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" aria-current={activeModule === id ? "page" : undefined} onClick={() => setActiveModule(id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ${activeModule === id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                <Icon className="h-4 w-4" />{label}
              </button>
            ))}
          </nav>

          <section aria-labelledby="portal-module-title" className="space-y-5">
            <div>
              <p className="text-sm text-slate-500">{currentUser?.gymName || "Member portal"}</p>
              <h1 id="portal-module-title" className="mt-1 text-2xl font-semibold text-slate-950">{selectedModule?.label}</h1>
              <p className="mt-1 text-sm text-slate-500">
                {activeModule === "overview" ? "A quick summary of your gym account." :
                  activeModule === "memberships" ? "Review your current and previous membership plans." :
                    activeModule === "payments" ? "Review payments recorded on your account." :
                      activeModule === "attendance" ? "Show your secure QR code to staff when you arrive." :
                        "Your contact information and member details."}
              </p>
            </div>

            {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p> : null}
            {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading your member portal…</p> : null}

            {data && activeModule === "overview" ? <>
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Member ID</p><p className="mt-2 text-xl font-semibold">{data.member.id}</p><p className="mt-1 text-sm text-slate-500">Member since {data.member.joinedAt}</p></article>
                <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Latest membership</p><p className="mt-2 text-xl font-semibold">{latestMembership?.planName ?? "No membership yet"}</p><p className="mt-1 text-sm capitalize text-slate-500">{latestMembership ? `${latestMembership.status.replace("-", " ")} · ends ${latestMembership.endDate}` : "Contact the gym to choose a plan."}</p></article>
                <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Outstanding balance</p><p className="mt-2 text-xl font-semibold">{money.format(outstandingBalance)}</p><p className="mt-1 text-sm text-slate-500">Payments are recorded by gym staff.</p></article>
              </section>
              <section className="grid gap-4 md:grid-cols-2">
                <button type="button" onClick={() => setActiveModule("attendance")} className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-slate-400"><span className="inline-flex rounded-xl bg-slate-100 p-2"><QrCode className="h-5 w-5" /></span><h2 className="mt-3 font-semibold">Check in at the gym</h2><p className="mt-1 text-sm text-slate-500">Open your attendance QR code to show the front-desk team.</p></button>
                <button type="button" onClick={() => setActiveModule("memberships")} className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-slate-400"><span className="inline-flex rounded-xl bg-slate-100 p-2"><BadgeCheck className="h-5 w-5" /></span><h2 className="mt-3 font-semibold">View membership history</h2><p className="mt-1 text-sm text-slate-500">{data.memberships.length} membership record{data.memberships.length === 1 ? "" : "s"} on your account.</p></button>
                <button type="button" onClick={() => setActiveModule("payments")} className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-slate-400"><span className="inline-flex rounded-xl bg-slate-100 p-2"><CreditCard className="h-5 w-5" /></span><h2 className="mt-3 font-semibold">View payment history</h2><p className="mt-1 text-sm text-slate-500">{data.payments.length} payment record{data.payments.length === 1 ? "" : "s"} on your account.</p></button>
                <button type="button" onClick={() => setActiveModule("profile")} className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-slate-400"><span className="inline-flex rounded-xl bg-slate-100 p-2"><UserRound className="h-5 w-5" /></span><h2 className="mt-3 font-semibold">Review your profile</h2><p className="mt-1 text-sm text-slate-500">Check the contact details the gym has on file for you.</p></button>
              </section>
            </> : null}

            {data && activeModule === "memberships" ? <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold">Membership history</h2></div>
              {data.memberships.length ? <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-left">
                <thead className="bg-slate-50"><tr>{["Plan", "Period", "Status", "Payment", "Paid", "Balance"].map((item) => <th key={item} className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{item}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">{data.memberships.map((membership) => <tr key={membership.id}>
                  <td className="px-5 py-3 text-sm font-medium">{membership.planName}</td><td className="px-5 py-3 text-sm text-slate-600">{membership.startDate} – {membership.endDate}</td><td className="px-5 py-3 text-sm capitalize">{membership.status.replace("-", " ")}</td><td className="px-5 py-3 text-sm capitalize">{membership.paymentStatus}</td><td className="px-5 py-3 text-sm">{money.format(membership.amountPaid)}</td><td className="px-5 py-3 text-sm">{money.format(membership.amountDue)}</td>
                </tr>)}</tbody>
              </table></div> : <p className="p-5 text-sm text-slate-500">No membership records yet.</p>}
            </section> : null}

            {data && activeModule === "payments" ? <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold">Payment history</h2><p className="mt-1 text-sm text-slate-500">Payments recorded by the gym.</p></div>
              {data.payments.length ? <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-left">
                <thead className="bg-slate-50"><tr>{["Receipt", "Date", "Plan", "Method", "Amount", "Status"].map((item) => <th key={item} className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{item}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">{data.payments.map((payment) => <tr key={payment.id}>
                  <td className="px-5 py-3 text-sm font-medium">{payment.id}</td><td className="px-5 py-3 text-sm text-slate-600">{payment.date}</td><td className="px-5 py-3 text-sm">{payment.planName}</td><td className="px-5 py-3 text-sm">{payment.method}</td><td className="px-5 py-3 text-sm font-semibold">{money.format(payment.amount)}</td><td className="px-5 py-3 text-sm capitalize">{payment.status}</td>
                </tr>)}</tbody>
              </table></div> : <p className="p-5 text-sm text-slate-500">No payment records yet.</p>}
            </section> : null}

            {data && activeModule === "attendance" ? <>
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3"><span className="rounded-xl bg-slate-100 p-2 text-slate-700"><QrCode className="h-5 w-5" /></span><div><h2 className="text-lg font-semibold">Your check-in QR code</h2><p className="mt-1 text-sm text-slate-500">Show this secure, time-limited code to gym staff. They scan it at the front desk to record your attendance.</p></div></div>
                <div className="mt-5 flex min-h-64 flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-5">
                  {qr ? <><div className="rounded-xl bg-white p-4 shadow-sm"><QRCodeSVG value={qr.token} size={208} level="M" includeMargin /></div><p className="mt-3 text-xs text-slate-500">Refreshes automatically · expires {new Date(qr.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p></> : qrLoading ? <p role="status" className="text-sm text-slate-500">Preparing your check-in code…</p> : <p className="max-w-sm text-center text-sm text-slate-600">{qrError || "A check-in code is unavailable."}</p>}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Your QR code is valid briefly and only works for your account.</p><button type="button" onClick={refreshQr} disabled={qrLoading} aria-label="Refresh attendance QR code" className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" />Refresh code</button></div>
              </article>
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold">Attendance history</h2></div>
                {data.attendance.length ? <div className="divide-y divide-slate-100">{data.attendance.map((visit) => <div key={visit.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm"><span>{new Date(visit.checkedInAt).toLocaleDateString()}</span><span className="text-slate-500">{new Date(visit.checkedInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>)}</div> : <p className="p-5 text-sm text-slate-500">No attendance records yet.</p>}
              </section>
            </> : null}

            {data && activeModule === "profile" ? <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-4 border-b border-slate-100 pb-5"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-950 text-lg font-semibold text-white">{data.member.initials}</span><div><h2 className="text-lg font-semibold">{data.member.name}</h2><p className="text-sm text-slate-500">Member ID: {data.member.id}</p></div></div>
              <dl className="mt-5 grid gap-5 text-sm sm:grid-cols-2">
                <div><dt className="text-slate-500">Phone</dt><dd className="mt-1 font-medium">{data.member.phone}</dd></div>
                <div><dt className="text-slate-500">Email</dt><dd className="mt-1 font-medium">{data.member.email || "Not provided"}</dd></div>
                <div><dt className="text-slate-500">Address</dt><dd className="mt-1 font-medium">{data.member.address || "Not provided"}</dd></div>
                <div><dt className="text-slate-500">Emergency contact</dt><dd className="mt-1 font-medium">{data.member.emergencyContact}</dd></div>
                <div><dt className="text-slate-500">Joined</dt><dd className="mt-1 font-medium">{data.member.joinedAt}</dd></div>
              </dl>
              <p className="mt-5 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">To update your details or make a payment, please speak with gym staff.</p>
            </section> : null}
          </section>
        </main>
      </div>
    </div>
  );
}
