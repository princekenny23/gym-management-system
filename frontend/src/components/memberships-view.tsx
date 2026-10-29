"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Eye, Pencil, Plus, RotateCcw, Search, X } from "lucide-react";
import { ActionMenu } from "@/components/action-menu";
import { useGymData } from "@/components/gym-data-provider";
import type { Member, Membership, MembershipStatus } from "@/types/gym";
import { useCurrentDate } from "@/lib/use-current-date";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "MWK", maximumFractionDigits: 0 });
const addDays = (date: string, days: number) => {
  const result = new Date(`${date}T12:00:00`);
  result.setDate(result.getDate() + days);
  return result.toISOString().slice(0, 10);
};
const formatPeriod = (startDate: string, endDate: string) => {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const weeks = Math.floor(days / 7);
  const remainingDays = days % 7;
  const duration = weeks
    ? `${weeks} week${weeks === 1 ? "" : "s"}${remainingDays ? ` ${remainingDays} day${remainingDays === 1 ? "" : "s"}` : ""} (${days} days)`
    : `${days} day${days === 1 ? "" : "s"}`;
  return {
    dates: `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`,
    duration,
  };
};
const getStatus = (endDate: string, startDate: string, warningDays: number, now: string): MembershipStatus => {
  if (endDate < now) return "expired";
  if (startDate > now) return "pending";
  if (addDays(now, warningDays) >= endDate) return "expiring-soon";
  return "active";
};

export function MembershipsView() {
  const { members, plans, memberships, setMembers, setMemberships, settings } = useGymData();
  const currentDate = useCurrentDate();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [planId, setPlanId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [formError, setFormError] = useState("");
  const [selectedMembership, setSelectedMembership] = useState<Membership | null>(null);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [memberFormError, setMemberFormError] = useState("");
  const activePlans = plans.filter((plan) => plan.status === "active");

  const filtered = useMemo(() => memberships.filter((membership) => {
    const text = `${membership.memberName} ${membership.memberId} ${membership.planName}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (filter === "all" || (currentDate && getStatus(membership.endDate, membership.startDate, settings.expiryWarningDays, currentDate) === filter));
  }), [currentDate, filter, memberships, query, settings.expiryWarningDays]);

  const openAssign = (member?: { id: string }) => {
    setMemberId(member?.id ?? members.find((item) => item.status === "active")?.id ?? "");
    setPlanId(activePlans[0]?.id ?? "");
    setStartDate(currentDate);
    setFormError("");
    setFormOpen(true);
  };
  const saveMembership = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const member = members.find((item) => item.id === memberId && item.status === "active");
    const plan = activePlans.find((item) => item.id === planId);
    if (!member || !plan || !startDate) {
      setFormError("Select an active member, an active plan, and a start date.");
      return;
    }
    const endDate = addDays(startDate, plan.durationDays - 1);
    const overlap = memberships.some((item) => item.memberId === member.id && item.startDate <= endDate && item.endDate >= startDate);
    if (overlap && !window.confirm("This membership overlaps with an existing membership. Assign anyway?")) return;
    const membership: Membership = {
      id: `membership-${crypto.randomUUID()}`,
      memberId: member.id,
      memberName: member.name,
      planId: plan.id,
      planName: plan.name,
      startDate,
      endDate,
      status: getStatus(endDate, startDate, settings.expiryWarningDays, currentDate),
      paymentStatus: "unpaid",
      amountPaid: 0,
      amountDue: plan.price,
    };
    setMemberships((all) => [membership, ...all]);
    setFormOpen(false);
  };
  const renew = (previous: Membership) => {
    const plan = plans.find((item) => item.id === previous.planId);
    if (!plan || plan.status !== "active") {
      window.alert("The previous plan is inactive. Activate it or assign another active plan.");
      return;
    }
    const start = previous.endDate >= currentDate ? addDays(previous.endDate, 1) : currentDate;
    const end = addDays(start, plan.durationDays - 1);
    const overlaps = memberships.some((item) => item.memberId === previous.memberId && item.startDate <= end && item.endDate >= start);
    if (overlaps && !window.confirm("This renewal overlaps another membership for this member. Continue and keep both history records?")) return;
    setMemberships((all) => [{
      id: `membership-${crypto.randomUUID()}`,
      memberId: previous.memberId,
      memberName: previous.memberName,
      planId: plan.id,
      planName: plan.name,
      startDate: start,
      endDate: end,
      status: getStatus(end, start, settings.expiryWarningDays, currentDate),
      paymentStatus: "unpaid",
      amountPaid: 0,
      amountDue: plan.price,
    }, ...all]);
  };
  const saveEditedMember = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingMember?.name.trim() || !editingMember.phone.trim() || !editingMember.emergencyContact.trim()) {
      setMemberFormError("Full name, phone number, and emergency contact are required.");
      return;
    }
    if (members.some((item) => item.phone.trim() === editingMember.phone.trim() && item.id !== editingMember.id)) {
      setMemberFormError("A member with this phone number already exists.");
      return;
    }
    const updated = {
      ...editingMember,
      name: editingMember.name.trim(),
      phone: editingMember.phone.trim(),
      emergencyContact: editingMember.emergencyContact.trim(),
      initials: editingMember.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join(""),
    };
    setMembers((all) => all.map((item) => item.id === updated.id ? updated : item));
    setMemberships((all) => all.map((item) => item.memberId === updated.id ? { ...item, memberName: updated.name } : item));
    setEditingMember(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm sm:w-72" placeholder="Search member, ID or plan" aria-label="Search memberships" /></div>
          <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter by membership status" className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"><option value="all">All statuses</option>{["active", "expiring-soon", "expired", "pending"].map((item) => <option key={item} value={item}>{item.replace("-", " ")}</option>)}</select>
        </div>
        <button type="button" onClick={() => openAssign()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white"><Plus className="h-4 w-4" />Assign membership</button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-left">
          <thead className="bg-slate-50"><tr>{["Member", "Plan", "Period", "Membership", "Payment", "Paid", "Balance", "Actions"].map((heading) => <th key={heading} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{heading}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-200">
            {filtered.map((item) => {
              const status = currentDate ? getStatus(item.endDate, item.startDate, settings.expiryWarningDays, currentDate) : item.status;
              const period = formatPeriod(item.startDate, item.endDate);
              return <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-4 py-3"><p className="font-medium text-slate-900">{item.memberName}</p><p className="text-xs text-slate-500">{item.memberId}</p></td>
                <td className="px-4 py-3 text-sm">{item.planName}</td>
                <td className="px-4 py-3 text-sm text-slate-600"><p>{period.dates}</p><p className="mt-1 text-xs text-slate-500">{period.duration}</p></td>
                <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs capitalize">{status.replace("-", " ")}</span>{item.accessApproved ? <span className="ml-1 rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-800">Access approved</span> : null}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs capitalize ${item.paymentStatus === "paid" ? "bg-emerald-100 text-emerald-700" : item.paymentStatus === "partial" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>{item.paymentStatus}</span></td>
                <td className="px-4 py-3 text-sm">{money.format(item.amountPaid)}</td>
                <td className="px-4 py-3 text-sm font-medium">{money.format(item.amountDue)}</td>
                <td className="px-4 py-3"><ActionMenu label={`${item.memberName} membership`} items={[
                  { label: "View membership details", icon: <Eye className="h-4 w-4" />, onSelect: () => setSelectedMembership(item) },
                  { label: "Edit member", icon: <Pencil className="h-4 w-4" />, onSelect: () => {
                    const member = members.find((entry) => entry.id === item.memberId);
                    if (member) {
                      setMemberFormError("");
                      setEditingMember({ ...member });
                    }
                  }, disabled: !members.some((entry) => entry.id === item.memberId) },
                  { label: "Renew membership", icon: <RotateCcw className="h-4 w-4" />, onSelect: () => renew(item) },
                ]} /></td>
              </tr>;
            })}
            {filtered.length === 0 ? <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">No memberships match your filters.</td></tr> : null}
          </tbody>
        </table>
      </div>

      {formOpen ? <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4"><form onSubmit={saveMembership} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Assign membership</h2><button type="button" onClick={() => setFormOpen(false)} aria-label="Close membership form"><X className="h-5 w-5" /></button></div>
        <label className="block text-sm font-medium">Member<select required value={memberId} onChange={(event) => setMemberId(event.target.value)} className="mt-1 h-10 w-full rounded-xl border px-3"><option value="">Select a member</option>{members.filter((item) => item.status === "active").map((item) => <option key={item.id} value={item.id}>{item.name} ({item.id})</option>)}</select></label>
        <label className="block text-sm font-medium">Plan<select required value={planId} onChange={(event) => setPlanId(event.target.value)} className="mt-1 h-10 w-full rounded-xl border px-3"><option value="">Select an active plan</option>{activePlans.map((item) => <option key={item.id} value={item.id}>{item.name} · {money.format(item.price)} · {item.durationDays} days</option>)}</select></label>
        <label className="block text-sm font-medium">Start date<input required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 h-10 w-full rounded-xl border px-3" /></label>
        {formError ? <p role="alert" className="text-sm text-rose-700">{formError}</p> : null}
        <p className="text-sm text-slate-500">Membership assignment does not record payment. You can record payment separately.</p>
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setFormOpen(false)} className="rounded-xl border px-4 py-2 text-sm">Cancel</button><button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Assign</button></div>
      </form></div> : null}

      {selectedMembership ? <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4">
        <section aria-label={`Membership details for ${selectedMembership.memberName}`} className="w-full max-w-lg space-y-5 rounded-2xl bg-white p-6 shadow-xl">
          <div className="flex items-start justify-between"><div><h2 className="text-xl font-semibold">Membership details</h2><p className="mt-1 text-sm text-slate-500">{selectedMembership.memberName} · {selectedMembership.memberId}</p></div><button type="button" onClick={() => setSelectedMembership(null)} aria-label="Close membership details"><X className="h-5 w-5" /></button></div>
          <dl className="grid gap-4 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Plan</dt><dd className="mt-1 font-medium">{selectedMembership.planName}</dd></div>
            <div><dt className="text-slate-500">Dates</dt><dd className="mt-1 font-medium">{selectedMembership.startDate} – {selectedMembership.endDate}</dd></div>
            <div><dt className="text-slate-500">Membership status</dt><dd className="mt-1 font-medium capitalize">{selectedMembership.status.replace("-", " ")}</dd></div>
            <div><dt className="text-slate-500">Payment status</dt><dd className="mt-1 font-medium capitalize">{selectedMembership.paymentStatus}</dd></div>
            <div><dt className="text-slate-500">Paid</dt><dd className="mt-1 font-medium">{money.format(selectedMembership.amountPaid)}</dd></div>
            <div><dt className="text-slate-500">Balance</dt><dd className="mt-1 font-medium">{money.format(selectedMembership.amountDue)}</dd></div>
          </dl>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => {
            const member = members.find((entry) => entry.id === selectedMembership.memberId);
            if (member) {
              setMemberFormError("");
              setEditingMember({ ...member });
              setSelectedMembership(null);
            }
          }} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm"><Pencil className="h-4 w-4" />Edit member</button><button type="button" onClick={() => setSelectedMembership(null)} className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white">Close</button></div>
        </section>
      </div> : null}

      {editingMember ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
        <form onSubmit={saveEditedMember} className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
          <div className="flex items-start justify-between"><div><h2 className="text-xl font-semibold">Edit member</h2><p className="mt-1 text-sm text-slate-500">{editingMember.id}</p></div><button type="button" onClick={() => setEditingMember(null)} aria-label="Close edit member form"><X className="h-5 w-5" /></button></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              ["name", "Full name"],
              ["phone", "Phone number"],
              ["email", "Email"],
              ["address", "Address"],
              ["emergencyContact", "Emergency contact"],
              ["notes", "Notes"],
            ] as const).map(([field, label]) => <label key={field} className="text-sm font-medium">{label}<input type={field === "email" ? "email" : "text"} value={editingMember[field] ?? ""} onChange={(event) => setEditingMember((item) => item ? { ...item, [field]: event.target.value } : item)} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3" /></label>)}
          </div>
          {memberFormError ? <p role="alert" className="text-sm text-rose-700">{memberFormError}</p> : null}
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditingMember(null)} className="rounded-xl border px-4 py-2 text-sm">Cancel</button><button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Save member</button></div>
        </form>
      </div> : null}
    </div>
  );
}
