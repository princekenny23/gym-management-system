"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Archive, Eye, Pencil, Plus, Search, X } from "lucide-react";
import { useGymData } from "@/components/gym-data-provider";
import type { Member } from "@/types/gym";
import { ActionMenu } from "@/components/action-menu";
import { apiFetch, responseError } from "@/lib/api-client";

const memberStatuses = ["all", "active", "inactive", "archived"] as const;
type MemberFields = Pick<Member, "name" | "phone" | "email" | "address" | "emergencyContact" | "notes">;
const emptyFields: MemberFields = { name: "", phone: "", email: "", address: "", emergencyContact: "", notes: "" };

export function MembersView() {
  const { members, memberships, payments, attendance, setMembers, currentUser } = useGymData();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof memberStatuses)[number]>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [details, setDetails] = useState<Member | null>(null);
  const [portalMember, setPortalMember] = useState<Member | null>(null);
  const [portalUsername, setPortalUsername] = useState("");
  const [portalPassword, setPortalPassword] = useState("");
  const [portalError, setPortalError] = useState("");
  const [fields, setFields] = useState<MemberFields>(emptyFields);
  const [formError, setFormError] = useState("");

  const filteredMembers = useMemo(() => members.filter((member) => {
    const text = `${member.name} ${member.phone} ${member.id}`.toLowerCase();
    return text.includes(search.toLowerCase()) &&
      (status === "all" ? !member.isArchived : status === "archived" ? Boolean(member.isArchived) : !member.isArchived && member.status === status);
  }), [members, search, status]);

  const openForm = (member?: Member) => {
    setFormOpen(true);
    setFormError("");
    setEditing(member ?? null);
    setFields(member ? {
      name: member.name,
      phone: member.phone,
      email: member.email ?? "",
      address: member.address ?? "",
      emergencyContact: member.emergencyContact,
      notes: member.notes ?? "",
    } : emptyFields);
  };

  const saveMember = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = fields.name.trim();
    const phone = fields.phone.trim();
    if (!name || !phone || !fields.emergencyContact.trim()) {
      setFormError("Full name, phone number, and emergency contact are required.");
      return;
    }
    if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
      setFormError("Enter a valid email address.");
      return;
    }
    if (members.some((member) => member.phone.trim() === phone && member.id !== editing?.id)) {
      setFormError("A member with this phone number already exists.");
      return;
    }
    if (editing) {
      setMembers((all) => all.map((member) => member.id === editing.id
        ? { ...member, ...fields, name, phone, emergencyContact: fields.emergencyContact.trim(), initials: name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") }
        : member));
    } else {
      const lastId = members.reduce((max, member) => Math.max(max, Number(member.id.replace("PRX-", "")) || 0), 1000);
      setMembers((all) => [{
        id: `PRX-${lastId + 1}`,
        ...fields,
        name,
        phone,
        emergencyContact: fields.emergencyContact.trim(),
        status: "active",
        joinedAt: new Date().toISOString().slice(0, 10),
        initials: name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join(""),
      }, ...all]);
    }
    setEditing(null);
    setFormOpen(false);
  };

  const archive = (member: Member) => {
    if (!window.confirm(`Archive ${member.name}? Their payment and attendance history will be retained.`)) return;
    setMembers((all) => all.map((item) => item.id === member.id ? { ...item, isArchived: true } : item));
  };
  const createPortalAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!portalMember) return;
    setPortalError("");
    try {
      const response = await apiFetch("/member-portal/accounts/", {
        method: "POST",
        body: JSON.stringify({
          memberId: portalMember.id,
          username: portalUsername.trim(),
          password: portalPassword,
        }),
      });
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("Member portal accounts can only be created by an administrator. Sign in with an administrator account and try again.");
        }
        throw new Error(await responseError(response));
      }
      setPortalMember(null);
      setPortalUsername("");
      setPortalPassword("");
    } catch (reason) {
      setPortalError(reason instanceof Error ? reason.message : "The member portal account could not be created.");
    }
  };
  const closePortalAccount = () => {
    setPortalMember(null);
    setPortalUsername("");
    setPortalPassword("");
    setPortalError("");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 md:w-72" placeholder="Search by name, phone or member ID" />
          </div>
          <select aria-label="Filter members by status" value={status} onChange={(event) => setStatus(event.target.value as (typeof memberStatuses)[number])} className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
            {memberStatuses.map((option) => <option key={option} value={option}>{option === "all" ? "All statuses" : option}</option>)}
          </select>
        </div>
        <button type="button" onClick={() => openForm()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white"><Plus className="h-4 w-4" />Add member</button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-left">
          <thead className="bg-slate-50"><tr>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Member</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Status</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Phone</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Joined</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-200">
            {filteredMembers.map((member) => <tr key={member.id} className="hover:bg-slate-50">
              <td className="px-4 py-3"><button type="button" onClick={() => setDetails(member)} className="flex items-center gap-3 text-left">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">{member.initials}</span>
                <span><span className="block font-medium text-slate-900">{member.name}</span><span className="text-xs text-slate-500">{member.id}</span></span>
              </button></td>
              <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${member.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`}>{member.status}</span></td>
              <td className="px-4 py-3 text-sm text-slate-600">{member.phone}</td>
              <td className="px-4 py-3 text-sm text-slate-600">{member.joinedAt}</td>
              <td className="px-4 py-3 text-right"><ActionMenu label={member.name} items={[
                { label: "View member", icon: <Eye className="h-4 w-4" />, onSelect: () => setDetails(member) },
                { label: "Edit member", icon: <Pencil className="h-4 w-4" />, onSelect: () => openForm(member) },
                ...(currentUser?.role === "administrator" ? [{ label: "Create portal account", onSelect: () => { setPortalMember(member); setPortalUsername(""); setPortalPassword(""); setPortalError(""); } }] : []),
                ...(member.status === "active" ? [{ label: "Deactivate", onSelect: () => setMembers((all) => all.map((item) => item.id === member.id ? { ...item, status: "inactive" } : item)) }] : [{ label: "Reactivate", onSelect: () => setMembers((all) => all.map((item) => item.id === member.id ? { ...item, status: "active" } : item)) }]),
                ...(member.isArchived
                  ? [{ label: "Restore member", onSelect: () => setMembers((all) => all.map((item) => item.id === member.id ? { ...item, isArchived: false } : item)) }]
                  : [{ label: "Archive member", icon: <Archive className="h-4 w-4" />, onSelect: () => archive(member), destructive: true }]),
              ]} /></td>
            </tr>)}
            {filteredMembers.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">No members match these filters.</td></tr> : null}
          </tbody>
        </table>
      </div>

      {formOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4">
          <form onSubmit={saveMember} className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{editing ? "Edit member" : "Add member"}</h2><button type="button" onClick={() => { setEditing(null); setFields(emptyFields); setFormOpen(false); }} aria-label="Close member form"><X className="h-5 w-5" /></button></div>
            <div className="grid gap-4 sm:grid-cols-2">
              {([
                ["name", "Full name", true],
                ["phone", "Phone number", true],
                ["email", "Email", false],
                ["address", "Address", false],
                ["emergencyContact", "Emergency contact", true],
                ["notes", "Notes", false],
              ] as const).map(([field, label, required]) => <label key={field} className="text-sm font-medium text-slate-700">{label}
                <input required={required} type={field === "email" ? "email" : "text"} value={fields[field] ?? ""} onChange={(event) => setFields((current) => ({ ...current, [field]: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3" />
              </label>)}
            </div>
            {formError ? <p role="alert" className="text-sm text-rose-700">{formError}</p> : null}
            <div className="flex justify-end gap-2"><button type="button" onClick={() => { setEditing(null); setFields(emptyFields); setFormOpen(false); }} className="rounded-xl border px-4 py-2 text-sm">Cancel</button><button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Save member</button></div>
          </form>
        </div>
      ) : null}

      {details ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4">
          <section aria-label={`Member details for ${details.name}`} className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Member details</h2><button type="button" onClick={() => setDetails(null)} aria-label="Close member details"><X className="h-5 w-5" /></button></div>
            <div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white">{details.initials}</span><div><p className="font-semibold">{details.name}</p><p className="text-sm text-slate-500">{details.id} · {details.phone}</p></div></div>
            <div className="grid gap-3 sm:grid-cols-2 text-sm"><p>Email: {details.email || "—"}</p><p>Address: {details.address || "—"}</p><p>Emergency contact: {details.emergencyContact}</p><p>Notes: {details.notes || "—"}</p></div>
            <h3 className="font-semibold">Membership history</h3>{memberships.filter((item) => item.memberId === details.id).map((item) => <p key={item.id} className="rounded-lg bg-slate-50 p-3 text-sm">{item.planName} · {item.startDate} – {item.endDate} · {item.status}</p>)}{memberships.every((item) => item.memberId !== details.id) ? <p className="text-sm text-slate-500">No membership history.</p> : null}
            <h3 className="font-semibold">Payment history</h3>{payments.filter((item) => item.memberId === details.id).map((item) => <p key={item.id} className="rounded-lg bg-slate-50 p-3 text-sm">{item.date} · MWK {item.amount.toLocaleString()} · {item.method}</p>)}{payments.every((item) => item.memberId !== details.id) ? <p className="text-sm text-slate-500">No payment history.</p> : null}
            <p className="text-sm text-slate-500">Attendance records: {attendance.filter((item) => item.memberId === details.id).length}</p>
            <button type="button" onClick={() => setDetails(null)} className="rounded-xl border px-4 py-2 text-sm">Close</button>
          </section>
        </div>
      ) : null}
      {portalMember ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <form onSubmit={createPortalAccount} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="text-xl font-semibold">Create member portal account</h2><p className="mt-1 text-sm text-slate-500">{portalMember.name} · {portalMember.id}</p></div>
              <button type="button" onClick={closePortalAccount} aria-label="Close portal account form"><X className="h-5 w-5" /></button>
            </div>
            <label className="block text-sm font-medium">Username<input required value={portalUsername} onChange={(event) => setPortalUsername(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3" /></label>
            <label className="block text-sm font-medium">Password<input required minLength={8} type="password" autoComplete="new-password" value={portalPassword} onChange={(event) => setPortalPassword(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3" /><span className="mt-1 block text-xs font-normal text-slate-500">This is the password the member will use to sign in.</span></label>
            <p className="text-xs text-slate-500">Share these sign-in details securely with the member. The portal shows membership and payment history and provides a time-limited attendance QR code; payments are recorded by staff.</p>
            {portalError ? <p role="alert" className="text-sm text-rose-700">{portalError}</p> : null}
            <div className="flex justify-end gap-2"><button type="button" onClick={closePortalAccount} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">Create account</button></div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
