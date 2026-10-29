"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Pencil, Search, Plus, X, Archive, RotateCcw } from "lucide-react";
import { useGymData } from "@/components/gym-data-provider";
import type { MembershipPlan } from "@/types/gym";
import { ActionMenu } from "@/components/action-menu";

const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "MWK", maximumFractionDigits: 0 });
type PlanFields = Pick<MembershipPlan, "name" | "description" | "durationDays" | "price" | "cadence">;
const blankPlan: PlanFields = { name: "", description: "", durationDays: 30, price: 0, cadence: "Custom" };

export function MembershipPlansView() {
  const { plans, setPlans, currentUser } = useGymData();
  const canManagePlans = currentUser?.role === "administrator";
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MembershipPlan | null>(null);
  const [fields, setFields] = useState<PlanFields>(blankPlan);
  const [error, setError] = useState("");
  const filteredPlans = useMemo(() => plans.filter((plan) => `${plan.name} ${plan.description}`.toLowerCase().includes(search.toLowerCase())), [plans, search]);

  const openForm = (plan?: MembershipPlan) => {
    setEditing(plan ?? null);
    setFields(plan ? { name: plan.name, description: plan.description, durationDays: plan.durationDays, price: plan.price, cadence: plan.cadence } : blankPlan);
    setError("");
    setFormOpen(true);
  };
  const savePlan = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = fields.name.trim();
    if (!name || !fields.description.trim() || !Number.isFinite(fields.price) || fields.price <= 0 || !Number.isInteger(fields.durationDays) || fields.durationDays <= 0) {
      setError("Enter a plan name, description, positive price, and duration in whole days.");
      return;
    }
    if (plans.some((plan) => plan.name.toLowerCase() === name.toLowerCase() && plan.id !== editing?.id)) {
      setError("A plan with this name already exists.");
      return;
    }
    if (editing) {
      setPlans((all) => all.map((plan) => plan.id === editing.id ? { ...plan, ...fields, name } : plan));
    } else {
      setPlans((all) => [...all, { ...fields, name, id: `plan-${crypto.randomUUID()}`, status: "active" }]);
    }
    setFormOpen(false);
  };
  const togglePlan = (plan: MembershipPlan) => {
    if (plan.status === "active" && !window.confirm(`Archive ${plan.name}? Existing memberships will remain unchanged.`)) return;
    setPlans((all) => all.map((item) => item.id === plan.id ? { ...item, status: item.status === "active" ? "inactive" : "active" } : item));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 md:w-72" placeholder="Search plans" aria-label="Search plans" /></div>
        {canManagePlans ? <button type="button" onClick={() => openForm()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white"><Plus className="h-4 w-4" />Add membership plan</button> : null}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-left">
          <thead className="bg-slate-50"><tr>{["Plan", "Duration", "Price", "Cadence", "Status", ...(canManagePlans ? ["Actions"] : [])].map((heading) => <th key={heading} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{heading}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {filteredPlans.map((plan) => <tr key={plan.id} className="hover:bg-slate-50">
              <td className="px-4 py-3"><p className="font-medium text-slate-900">{plan.name}</p><p className="max-w-md text-xs text-slate-500">{plan.description}</p></td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{plan.durationDays} days</td>
              <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-900">{currencyFormatter.format(plan.price)}</td>
              <td className="px-4 py-3 text-sm text-slate-700">{plan.cadence}</td>
              <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${plan.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{plan.status === "active" ? "Active" : "Archived"}</span></td>
              {canManagePlans ? <td className="px-4 py-3"><ActionMenu label={plan.name} items={[
                { label: "Edit plan", icon: <Pencil className="h-4 w-4" />, onSelect: () => openForm(plan) },
                { label: plan.status === "active" ? "Archive plan" : "Restore plan", icon: plan.status === "active" ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />, onSelect: () => togglePlan(plan), destructive: plan.status === "active" },
              ]} /></td> : null}
            </tr>)}
            {filteredPlans.length === 0 ? <tr><td colSpan={canManagePlans ? 6 : 5} className="px-4 py-10 text-center text-sm text-slate-500">No membership plans found.</td></tr> : null}
          </tbody>
        </table>
      </div>
      {formOpen ? <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4"><form onSubmit={savePlan} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{editing ? "Edit plan" : "Create plan"}</h2><button type="button" onClick={() => setFormOpen(false)} aria-label="Close plan form"><X className="h-5 w-5" /></button></div>
        <label className="block text-sm font-medium">Plan name<input required value={fields.name} onChange={(event) => setFields((current) => ({ ...current, name: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border px-3" /></label>
        <label className="block text-sm font-medium">Description<textarea required value={fields.description} onChange={(event) => setFields((current) => ({ ...current, description: event.target.value }))} className="mt-1 w-full rounded-xl border p-3" rows={3} /></label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-medium">Duration (days)<input required type="number" min={1} step={1} value={fields.durationDays} onChange={(event) => setFields((current) => ({ ...current, durationDays: Number(event.target.value) }))} className="mt-1 h-10 w-full rounded-xl border px-3" /></label>
          <label className="text-sm font-medium">Price (MWK)<input required type="number" min={1} step={1} value={fields.price || ""} onChange={(event) => setFields((current) => ({ ...current, price: Number(event.target.value) }))} className="mt-1 h-10 w-full rounded-xl border px-3" /></label>
          <label className="text-sm font-medium">Cadence<select value={fields.cadence} onChange={(event) => setFields((current) => ({ ...current, cadence: event.target.value as MembershipPlan["cadence"] }))} className="mt-1 h-10 w-full rounded-xl border px-2">{["Daily", "Weekly", "Monthly", "Quarterly", "Annual", "Custom"].map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setFormOpen(false)} className="rounded-xl border px-4 py-2 text-sm">Cancel</button><button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Save plan</button></div>
      </form></div> : null}
    </div>
  );
}
