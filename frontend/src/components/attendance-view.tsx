"use client";

import { useCallback, useMemo, useState } from "react";
import { Search, UserCheck } from "lucide-react";
import { useGymData } from "@/components/gym-data-provider";
import type { AttendanceRecord, Member } from "@/types/gym";
import { localDateString, useCurrentDate } from "@/lib/use-current-date";
import { QrCameraScanner } from "@/components/qr-camera-scanner";
import { apiFetch, responseError } from "@/lib/api-client";

export function AttendanceView() {
  const { members, memberships, attendance, settings, setAttendance } = useGymData();
  const currentDate = useCurrentDate();
  const [query, setQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const date = selectedDate || currentDate;
  const [message, setMessage] = useState("");
  const [qrBusy, setQrBusy] = useState(false);
  const matches = useMemo(() => query.trim()
    ? members.filter((member) => `${member.name} ${member.id} ${member.phone}`.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : [], [members, query]);
  const filteredAttendance = useMemo(() => attendance
    .filter((record) => localDateString(new Date(record.checkedInAt)) === date && `${record.memberName} ${record.memberId}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt)), [attendance, date, query]);

  const currentMembership = (member: Member) => memberships.find((membership) =>
    membership.memberId === member.id &&
    membership.startDate <= currentDate &&
    membership.endDate >= currentDate &&
    membership.paymentStatus !== "unpaid",
  );
  const checkIn = (member: Member) => {
    setMessage("");
    if (member.status !== "active") {
      setMessage(`${member.name} is inactive. Reactivate the member before check-in.`);
      return;
    }
    const membership = currentMembership(member);
    if (!membership) {
      setMessage(`${member.name} has no currently valid, paid or partially paid membership. Check in was not recorded.`);
      return;
    }
    const lastCheckIn = attendance
      .filter((item) => item.memberId === member.id)
      .sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt))[0];
    if (lastCheckIn) {
      // This comparison runs only after a staff member explicitly requests check-in.
      // eslint-disable-next-line react-hooks/purity
      const minutesSince = (Date.now() - new Date(lastCheckIn.checkedInAt).getTime()) / 60_000;
      if (minutesSince >= 0 && minutesSince < settings.duplicateCheckInMinutes) {
        setMessage(`${member.name} already checked in ${Math.floor(minutesSince)} minute(s) ago. Duplicate check-in was prevented.`);
        return;
      }
    }
    const record = {
      id: `attendance-${crypto.randomUUID()}`,
      memberId: member.id,
      memberName: member.name,
      checkedInAt: new Date().toISOString(),
      status: "checked-in" as const,
    };
    setAttendance((all) => [record, ...all]);
    setSelectedDate(localDateString(new Date()));
    setQuery("");
    setMessage(`${member.name} checked in successfully.`);
  };
  const scanMember = useCallback(async (token: string) => {
    setQrBusy(true);
    setMessage("");
    try {
      const response = await apiFetch("/attendance/qr-check-in/", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const record = (await response.json()) as AttendanceRecord;
      setAttendance((all) => [record, ...all.filter((item) => item.id !== record.id)]);
      setSelectedDate(localDateString(new Date()));
      setMessage(`${record.memberName} checked in successfully.`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "The QR check-in could not be completed.");
    } finally {
      setQrBusy(false);
    }
  }, [setAttendance]);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">QR member check-in</h2>
        <p className="mt-1 text-sm text-slate-500">Scan the member&apos;s signed QR code. The backend verifies membership eligibility and prevents duplicate check-ins.</p>
        <div className="mt-4"><QrCameraScanner onScan={scanMember} /></div>
        {qrBusy ? <p role="status" className="mt-3 text-sm text-slate-500">Verifying QR and recording attendance…</p> : null}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Manual member check-in</h2>
        <p className="mt-1 text-sm text-slate-500">Search by name, phone, or member ID. Check-in is recorded only for active members with a valid paid/partially-paid membership.</p>
        <div className="relative mt-4 max-w-xl"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm" placeholder="Search member name, phone, or ID" aria-label="Search a member to check in" /></div>
        {message ? <p role="status" className={`mt-3 rounded-xl p-3 text-sm ${message.includes("successfully") ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{message}</p> : null}
        {matches.length ? <div className="mt-3 divide-y rounded-xl border border-slate-200">
          {matches.map((member) => {
            const membership = currentMembership(member);
            const eligible = member.status === "active" && Boolean(membership);
            return <div key={member.id} className="flex flex-col justify-between gap-3 p-3 sm:flex-row sm:items-center">
              <div><p className="font-medium">{member.name} <span className="text-xs text-slate-500">{member.id}</span></p><p className={`text-xs ${eligible ? "text-emerald-700" : "text-rose-700"}`}>{member.status !== "active" ? "Inactive member" : membership ? `Valid through ${membership.endDate} · ${membership.paymentStatus}` : "No valid paid membership"}</p></div>
              <button type="button" disabled={!eligible} onClick={() => checkIn(member)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"><UserCheck className="h-4 w-4" />Check in</button>
            </div>;
          })}
        </div> : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-semibold">Attendance history</h2><p className="text-sm text-slate-500">Repeated visits appear as separate dated check-ins.</p></div><label className="text-sm text-slate-600">Date<input type="date" value={date} onChange={(event) => setSelectedDate(event.target.value)} className="ml-2 h-10 rounded-xl border border-slate-200 px-3" /></label></div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left">
            <thead className="bg-slate-50"><tr>{["Member", "Member ID", "Date", "Time", "Status"].map((item) => <th key={item} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{item}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-200">
              {filteredAttendance.map((record) => <tr key={record.id}><td className="px-4 py-3 font-medium">{record.memberName}</td><td className="px-4 py-3 text-sm text-slate-600">{record.memberId}</td><td className="px-4 py-3 text-sm text-slate-600">{new Date(record.checkedInAt).toLocaleDateString()}</td><td className="px-4 py-3 text-sm text-slate-600">{new Date(record.checkedInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td><td className="px-4 py-3"><span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">Checked in</span></td></tr>)}
              {filteredAttendance.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">No check-ins recorded for this date.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
