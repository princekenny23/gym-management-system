"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Plus, Search, X, Printer } from "lucide-react";
import { useGymData } from "@/components/gym-data-provider";
import type { Payment, PaymentMethod } from "@/types/gym";
import { localDateString } from "@/lib/use-current-date";
import { ActionMenu } from "@/components/action-menu";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "MWK", maximumFractionDigits: 0 });

export function PaymentsView() {
  const { memberships, payments, settings, setMemberships, setPayments } = useGymData();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [receipt, setReceipt] = useState<Payment | null>(null);
  const [membershipId, setMembershipId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");

  const filtered = useMemo(() => payments.filter((payment) => `${payment.memberName} ${payment.memberId} ${payment.reference ?? ""} ${payment.id}`.toLowerCase().includes(search.toLowerCase())), [payments, search]);
  const eligibleMemberships = memberships.filter((item) => item.amountDue > 0);

  const openPaymentForm = () => {
    setMembershipId(eligibleMemberships[0]?.id ?? "");
    setAmount("");
    setMethod("Cash");
    setReference("");
    setError("");
    setFormOpen(true);
  };
  const savePayment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const membership = eligibleMemberships.find((item) => item.id === membershipId);
    const paidAmount = Number(amount);
    if (!membership || !Number.isFinite(paidAmount) || paidAmount <= 0 || paidAmount > membership.amountDue) {
      setError("Select an unpaid or partially paid membership and enter an amount up to the outstanding balance.");
      return;
    }
    if (method !== "Cash" && !reference.trim()) {
      setError("A transaction reference is required for bank transfer and mobile money.");
      return;
    }
    const payment: Payment = {
      id: `RCT-${localDateString(new Date()).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      membershipId: membership.id,
      memberId: membership.memberId,
      memberName: membership.memberName,
      planName: membership.planName,
      date: localDateString(new Date()),
      amount: paidAmount,
      method,
      reference: reference.trim() || undefined,
      status: "cleared",
      type: "membership",
    };
    const paid = membership.amountPaid + paidAmount;
    const due = membership.amountDue - paidAmount;
    setMemberships((all) => all.map((item) => item.id === membership.id ? { ...item, amountPaid: paid, amountDue: due, paymentStatus: due === 0 ? "paid" : "partial" } : item));
    setPayments((all) => [payment, ...all]);
    setFormOpen(false);
    setReceipt(payment);
  };
  const printReceipt = () => window.print();

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 md:w-80" placeholder="Search transactions, members or references" aria-label="Search payments" /></div>
        <button type="button" onClick={openPaymentForm} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white"><Plus className="h-4 w-4" />Record payment</button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-left">
          <thead className="bg-slate-50"><tr>{["Receipt", "Member", "Plan", "Date", "Method", "Amount", "Type", "Actions"].map((item) => <th key={item} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{item}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-200">
            {filtered.map((payment) => <tr key={payment.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-sm font-medium text-slate-800">{payment.id}</td>
              <td className="px-4 py-3"><p className="font-medium text-slate-900">{payment.memberName}</p><p className="text-xs text-slate-500">{payment.memberId}{payment.reference ? ` · ${payment.reference}` : ""}</p></td>
              <td className="px-4 py-3 text-sm">{payment.planName}</td>
              <td className="px-4 py-3 text-sm">{payment.date}</td>
              <td className="px-4 py-3 text-sm">{payment.method}</td>
              <td className="px-4 py-3 text-sm font-semibold text-slate-900">{money.format(payment.amount)}</td>
              <td className="px-4 py-3 text-sm capitalize">{payment.type}{payment.note ? <span className="block text-xs text-slate-500">{payment.note}</span> : null}</td>
              <td className="px-4 py-3"><ActionMenu label={payment.id} items={[
                { label: "View receipt", onSelect: () => setReceipt(payment) },
              ]} /></td>
            </tr>)}
            {filtered.length === 0 ? <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">No payments match your search.</td></tr> : null}
          </tbody>
        </table>
      </div>

      {formOpen ? <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4"><form onSubmit={savePayment} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Record payment</h2><button type="button" onClick={() => setFormOpen(false)} aria-label="Close payment form"><X className="h-5 w-5" /></button></div>
        <label className="block text-sm font-medium">Membership<select required value={membershipId} onChange={(event) => setMembershipId(event.target.value)} className="mt-1 h-10 w-full rounded-xl border px-3"><option value="">Select membership</option>{eligibleMemberships.map((item) => <option key={item.id} value={item.id}>{item.memberName} · {item.planName} · due {money.format(item.amountDue)}</option>)}</select></label>
        <label className="block text-sm font-medium">Amount (MWK)<input required type="number" min="1" step="1" max={eligibleMemberships.find((item) => item.id === membershipId)?.amountDue} value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 h-10 w-full rounded-xl border px-3" /></label>
        <label className="block text-sm font-medium">Payment method<select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)} className="mt-1 h-10 w-full rounded-xl border px-3">{["Cash", "Bank transfer", "Mobile money"].map((item) => <option key={item}>{item}</option>)}</select></label>
        {method !== "Cash" ? <label className="block text-sm font-medium">Transaction reference<input required value={reference} onChange={(event) => setReference(event.target.value)} className="mt-1 h-10 w-full rounded-xl border px-3" /></label> : null}
        {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
        <p className="text-xs text-slate-500">Manual recording only; this does not initiate or verify any bank or mobile-money transfer.</p>
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setFormOpen(false)} className="rounded-xl border px-4 py-2 text-sm">Cancel</button><button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Save payment</button></div>
      </form></div> : null}

      {receipt ? <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4">
        <section className="receipt-print w-full max-w-lg space-y-5 rounded-2xl bg-white p-8 shadow-xl" aria-label="Payment receipt">
          <div className="flex items-start justify-between"><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 font-semibold text-white">{settings.logoText}</div><div><h2 className="font-semibold">{settings.gymName}</h2><p className="text-sm text-slate-500">{settings.address}</p><p className="text-sm text-slate-500">{settings.phone}</p></div></div><button type="button" className="no-print" onClick={() => setReceipt(null)} aria-label="Close receipt"><X className="h-5 w-5" /></button></div>
          <div className="border-y border-dashed py-4"><h3 className="text-center text-lg font-semibold">PAYMENT RECEIPT</h3><div className="mt-3 flex justify-between text-sm"><span>Receipt number</span><strong>{receipt.id}</strong></div><div className="mt-2 flex justify-between text-sm"><span>Payment date</span><strong>{receipt.date}</strong></div></div>
          <div className="space-y-2 text-sm"><div className="flex justify-between"><span>Member</span><strong>{receipt.memberName}</strong></div><div className="flex justify-between"><span>Member ID</span><strong>{receipt.memberId}</strong></div><div className="flex justify-between"><span>Membership plan</span><strong>{receipt.planName}</strong></div><div className="flex justify-between"><span>Payment method</span><strong>{receipt.method}</strong></div>{receipt.reference ? <div className="flex justify-between"><span>Transaction reference</span><strong>{receipt.reference}</strong></div> : null}<div className="flex justify-between border-t pt-3 text-base"><span>Amount paid</span><strong>{money.format(receipt.amount)}</strong></div>{receipt.membershipId ? <div className="flex justify-between"><span>Outstanding balance</span><strong>{money.format(memberships.find((item) => item.id === receipt.membershipId)?.amountDue ?? 0)}</strong></div> : null}</div>
          <p className="border-t pt-4 text-center text-sm text-slate-500">{settings.receiptFooter}</p>
          <button type="button" onClick={printReceipt} className="no-print flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white"><Printer className="h-4 w-4" />Print receipt</button>
        </section>
      </div> : null}
    </div>
  );
}
