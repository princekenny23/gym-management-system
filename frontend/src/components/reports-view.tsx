"use client";

import { useMemo, useState } from "react";
import { Download, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ExcelJS from "exceljs";
import { useGymData } from "@/components/gym-data-provider";
import { downloadCsv } from "@/lib/csv";
import { localDateString, useCurrentDate } from "@/lib/use-current-date";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "MWK", maximumFractionDigits: 0 });

export function ReportsView() {
  const { members, memberships, payments, attendance } = useGymData();
  const today = useCurrentDate();
  const [selectedStartDate, setSelectedStartDate] = useState("");
  const [selectedEndDate, setSelectedEndDate] = useState("");
  const [exportError, setExportError] = useState("");
  const startDate = selectedStartDate || (today ? `${today.slice(0, 7)}-01` : "");
  const endDate = selectedEndDate || today;
  const rangeValid = startDate <= endDate;
  const rangePayments = useMemo(() => rangeValid ? payments.filter((payment) => payment.date >= startDate && payment.date <= endDate) : [], [endDate, payments, rangeValid, startDate]);
  const clearedPayments = useMemo(() => rangePayments.filter((payment) => payment.status === "cleared"), [rangePayments]);
  const rangeAttendance = useMemo(() => rangeValid ? attendance.filter((record) => record.checkedInAt.slice(0, 10) >= startDate && record.checkedInAt.slice(0, 10) <= endDate) : [], [attendance, endDate, rangeValid, startDate]);
  const collected = clearedPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const byMethod = ["Cash", "Bank transfer", "Mobile money"].map((method) => ({
    method,
    amount: clearedPayments.filter((payment) => payment.method === method).reduce((sum, payment) => sum + payment.amount, 0),
  }));
  const activeMemberships = today ? memberships.filter((item) => item.startDate <= today && item.endDate >= today && item.paymentStatus !== "unpaid").length : 0;
  const expiredMemberships = today ? memberships.filter((item) => item.endDate < today).length : 0;
  const renewalCount = memberships.filter((item, index, list) => list.some((other, otherIndex) => other.memberId === item.memberId && otherIndex !== index && other.startDate > item.startDate)).length;
  const registrations = members.filter((member) => member.joinedAt >= startDate && member.joinedAt <= endDate).length;
  const revenueTrend = useMemo(() => {
    if (!today) return [];
    const months = Array.from({ length: 6 }, (_, index) => {
      const month = new Date(`${today.slice(0, 7)}-01T12:00:00`);
      month.setDate(1);
      month.setMonth(month.getMonth() - (5 - index));
      const key = localDateString(month).slice(0, 7);
      return {
        label: month.toLocaleDateString("en", { month: "short", year: "2-digit" }),
        revenue: payments.filter((payment) => payment.status === "cleared" && payment.date.startsWith(key)).reduce((sum, payment) => sum + payment.amount, 0),
      };
    });
    return months;
  }, [payments, today]);

  const exportPayments = async () => {
    setExportError("");
    try {
      const workbook = new ExcelJS.Workbook();
      const paymentSheet = workbook.addWorksheet("Payments");
      paymentSheet.columns = [
        { header: "Receipt", key: "receipt", width: 26 },
        { header: "Date", key: "date", width: 14 },
        { header: "Member", key: "member", width: 24 },
        { header: "Member ID", key: "memberId", width: 16 },
        { header: "Plan", key: "plan", width: 22 },
        { header: "Method", key: "method", width: 20 },
        { header: "Amount (MWK)", key: "amount", width: 17 },
        { header: "Transaction status", key: "transactionStatus", width: 22 },
        { header: "Membership payment status", key: "membershipStatus", width: 26 },
        { header: "Total paid (MWK)", key: "paid", width: 18 },
        { header: "Remaining balance (MWK)", key: "balance", width: 25 },
        { header: "Type", key: "type", width: 16 },
        { header: "Reference", key: "reference", width: 22 },
        { header: "Note", key: "note", width: 32 },
      ];
      for (const payment of rangePayments) {
        const membership = payment.membershipId
          ? memberships.find((item) => item.id === payment.membershipId)
          : memberships.find((item) => item.memberId === payment.memberId && item.planName === payment.planName);
        paymentSheet.addRow({
          receipt: payment.id,
          date: payment.date,
          member: payment.memberName,
          memberId: payment.memberId,
          plan: payment.planName,
          method: payment.method,
          amount: payment.amount,
          transactionStatus: payment.status,
          membershipStatus: membership?.paymentStatus ?? "unknown",
          paid: membership?.amountPaid ?? 0,
          balance: membership?.amountDue ?? 0,
          type: payment.type,
          reference: payment.reference ?? "",
          note: payment.note ?? "",
        });
      }
      const membershipSheet = workbook.addWorksheet("Membership balances");
      membershipSheet.columns = [
        { header: "Member", key: "member", width: 24 },
        { header: "Member ID", key: "memberId", width: 16 },
        { header: "Plan", key: "plan", width: 22 },
        { header: "Start date", key: "startDate", width: 14 },
        { header: "End date", key: "endDate", width: 14 },
        { header: "Membership status", key: "status", width: 20 },
        { header: "Payment status", key: "paymentStatus", width: 18 },
        { header: "Total paid (MWK)", key: "paid", width: 18 },
        { header: "Remaining balance (MWK)", key: "balance", width: 25 },
        { header: "Access approved", key: "accessApproved", width: 18 },
      ];
      memberships
        .filter((item) => item.startDate <= endDate && item.endDate >= startDate)
        .forEach((item) => membershipSheet.addRow({
          member: item.memberName,
          memberId: item.memberId,
          plan: item.planName,
          startDate: item.startDate,
          endDate: item.endDate,
          status: item.status,
          paymentStatus: item.paymentStatus,
          paid: item.amountPaid,
          balance: item.amountDue,
          accessApproved: item.accessApproved ? "Yes" : "No",
        }));
      for (const sheet of [paymentSheet, membershipSheet]) {
        sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
        sheet.views = [{ state: "frozen", ySplit: 1 }];
      }
      paymentSheet.getColumn("amount").numFmt = '"MWK" #,##0;[Red]-"MWK" #,##0';
      paymentSheet.getColumn("paid").numFmt = '"MWK" #,##0;[Red]-"MWK" #,##0';
      paymentSheet.getColumn("balance").numFmt = '"MWK" #,##0;[Red]-"MWK" #,##0';
      membershipSheet.getColumn("paid").numFmt = '"MWK" #,##0;[Red]-"MWK" #,##0';
      membershipSheet.getColumn("balance").numFmt = '"MWK" #,##0;[Red]-"MWK" #,##0';
      const output = await workbook.xlsx.writeBuffer();
      const blob = new Blob([new Uint8Array(output)], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `primex-payments-${startDate}-to-${endDate}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      console.error("Could not export the payment report workbook.", reason);
      setExportError(reason instanceof Error ? reason.message : "The Excel report could not be created.");
    }
  };
  const exportAttendance = () => downloadCsv("primex-attendance.csv", [
    ["Member", "Member ID", "Date and time", "Status"],
    ...rangeAttendance.map((item) => [item.memberName, item.memberId, item.checkedInAt, item.status]),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-end md:justify-between">
        <div><p className="text-sm text-slate-500">Operational reports</p><h2 className="text-xl font-semibold text-slate-900">Recorded activity summary</h2><p className="mt-1 text-xs text-slate-500">Collected revenue includes cleared payments recorded in the selected period.</p></div>
        <div className="flex flex-wrap items-end gap-3"><label className="text-sm text-slate-600">From<input type="date" value={startDate} onChange={(event) => setSelectedStartDate(event.target.value)} className="mt-1 block h-10 rounded-xl border px-3" /></label><label className="text-sm text-slate-600">To<input type="date" value={endDate} onChange={(event) => setSelectedEndDate(event.target.value)} className="mt-1 block h-10 rounded-xl border px-3" /></label></div>
      </div>
      {!rangeValid ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">Start date must be on or before end date.</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Collected revenue", money.format(collected)],
          ["Recorded attendance", String(rangeAttendance.length)],
          ["New registrations", String(registrations)],
          ["Membership renewals (all-time)", String(renewalCount)],
          ["Current active memberships", String(activeMemberships)],
          ["Expired memberships", String(expiredMemberships)],
        ].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-3 text-2xl font-semibold text-slate-900">{value}</p></div>)}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-slate-700" /><h3 className="text-lg font-semibold">Collected revenue trend</h3></div><p className="text-xs text-slate-500">Last 6 months</p></div>
          <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={revenueTrend}><CartesianGrid stroke="#e2e8f0" vertical={false} /><XAxis dataKey="label" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} /><Tooltip formatter={(value) => money.format(Number(value ?? 0))} /><Bar dataKey="revenue" fill="#0f172a" radius={[10, 10, 0, 0]} /></BarChart></ResponsiveContainer></div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold">Collected by payment method</h3><p className="text-sm text-slate-500">{startDate} through {endDate}</p>
          <div className="mt-4 divide-y">{byMethod.map((item) => <div key={item.method} className="flex justify-between py-3 text-sm"><span>{item.method}</span><strong>{money.format(item.amount)}</strong></div>)}</div>
          <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => void exportPayments()} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><Download className="h-4 w-4" />Export payment report Excel</button><button type="button" onClick={exportAttendance} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><Download className="h-4 w-4" />Export attendance CSV</button></div>
          {exportError ? <p role="alert" className="mt-3 text-sm text-rose-700">Excel export failed: {exportError}</p> : null}
        </section>
      </div>
    </div>
  );
}
