"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Eye, Shield, UserPlus, X } from "lucide-react";
import { ActionMenu } from "@/components/action-menu";
import { useGymData } from "@/components/gym-data-provider";
import { apiFetch, responseError } from "@/lib/api-client";
import type { AuthUser, UserRole } from "@/types/gym";

const emptyFields = {
  username: "",
  email: "",
  firstName: "",
  lastName: "",
  password: "",
  role: "receptionist" as UserRole,
};

export function StaffView() {
  const { currentUser } = useGymData();
  const [accounts, setAccounts] = useState<AuthUser[]>([]);
  const [fields, setFields] = useState(emptyFields);
  const [createOpen, setCreateOpen] = useState(false);
  const [details, setDetails] = useState<AuthUser | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch("/staff/")
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response));
        return (await response.json()) as AuthUser[];
      })
      .then((items) => {
        if (!active) return;
        setAccounts(items);
        setError("");
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Staff accounts could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const createAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch("/staff/", {
        method: "POST",
        body: JSON.stringify(fields),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const account = (await response.json()) as AuthUser;
      setAccounts((items) => [...items, account].sort((a, b) => a.username.localeCompare(b.username)));
      setFields(emptyFields);
      setCreateOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Staff account could not be created.");
    } finally {
      setSaving(false);
    }
  };

  const updateAccount = async (account: AuthUser, updates: Partial<Pick<AuthUser, "role" | "isActive">>) => {
    setError("");
    try {
      const response = await apiFetch("/staff/", {
        method: "PUT",
        body: JSON.stringify({ id: account.id, ...updates }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const updated = (await response.json()) as AuthUser;
      setAccounts((items) => items.map((item) => item.id === updated.id ? updated : item));
      setDetails((item) => item?.id === updated.id ? updated : item);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Staff account could not be updated.");
    }
  };
  const closeCreateAccount = () => {
    setCreateOpen(false);
    setFields(emptyFields);
    setError("");
  };

  if (currentUser?.role !== "administrator") {
    return <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Only administrators can manage staff accounts.</p>;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Staff and user accounts</h2>
            <p className="mt-1 text-sm text-slate-600">Manage staff access and account status.</p>
          </div>
          <button type="button" onClick={() => { setError(""); setCreateOpen(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white">
            <UserPlus className="h-4 w-4" />Create staff account
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="font-semibold text-slate-950">Existing accounts</h3>
          <p className="mt-1 text-sm text-slate-500">Review profile details, roles, and account access.</p>
        </div>
        {loading ? <p className="p-5 text-sm text-slate-500">Loading accounts…</p> : accounts.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left">
              <thead className="bg-slate-50"><tr>{["Account", "Role", "Status", "Actions"].map((heading) => <th key={heading} className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{heading}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map((account) => <tr key={account.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <p className="font-medium text-slate-900">{account.firstName || account.lastName ? `${account.firstName} ${account.lastName}`.trim() : account.username}</p>
                    <p className="text-sm text-slate-500">{account.username}{account.email ? ` · ${account.email}` : ""}</p>
                  </td>
                  <td className="px-5 py-4"><span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-700"><Shield className="h-3.5 w-3.5" />{account.role}</span></td>
                  <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${account.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>{account.isActive ? "Active" : "Inactive"}</span></td>
                  <td className="px-5 py-4 text-right">
                    <ActionMenu label={account.username} items={[
                      { label: "View account details", icon: <Eye className="h-4 w-4" />, onSelect: () => setDetails(account) },
                      {
                        label: `Change role to ${account.role === "administrator" ? "receptionist" : "administrator"}`,
                        icon: <Shield className="h-4 w-4" />,
                        onSelect: () => void updateAccount(account, { role: account.role === "administrator" ? "receptionist" : "administrator" }),
                        disabled: account.id === currentUser.id,
                      },
                      {
                        label: account.isActive ? "Deactivate account" : "Activate account",
                        onSelect: () => void updateAccount(account, { isActive: !account.isActive }),
                        destructive: account.isActive,
                        disabled: account.id === currentUser.id,
                      },
                    ]} />
                  </td>
                </tr>)}
              </tbody>
            </table>
          </div>
        ) : <p className="p-5 text-sm text-slate-500">No staff accounts were found.</p>}
      </section>

      {createOpen ? <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4">
        <form onSubmit={createAccount} className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
          <div className="flex items-start justify-between">
            <div><h2 className="text-xl font-semibold text-slate-950">Create staff account</h2><p className="mt-1 text-sm text-slate-500">Set the account details and password for this staff member.</p></div>
            <button type="button" onClick={closeCreateAccount} aria-label="Close create staff form"><X className="h-5 w-5" /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">Username<input required autoComplete="off" value={fields.username} onChange={(event) => setFields((value) => ({ ...value, username: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3" /></label>
            <label className="text-sm font-medium">Email<input type="email" value={fields.email} onChange={(event) => setFields((value) => ({ ...value, email: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3" /></label>
            <label className="text-sm font-medium">First name<input value={fields.firstName} onChange={(event) => setFields((value) => ({ ...value, firstName: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3" /></label>
            <label className="text-sm font-medium">Last name<input value={fields.lastName} onChange={(event) => setFields((value) => ({ ...value, lastName: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3" /></label>
            <label className="text-sm font-medium">Password<input required minLength={8} type="password" autoComplete="new-password" value={fields.password} onChange={(event) => setFields((value) => ({ ...value, password: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3" /><span className="mt-1 block text-xs font-normal text-slate-500">This is the account password the staff member will use to sign in.</span></label>
            <label className="text-sm font-medium">Role<select value={fields.role} onChange={(event) => setFields((value) => ({ ...value, role: event.target.value as UserRole }))} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3"><option value="receptionist">Receptionist</option><option value="administrator">Administrator</option></select></label>
          </div>
          {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
          <div className="flex justify-end gap-2"><button type="button" onClick={closeCreateAccount} className="rounded-xl border px-4 py-2 text-sm">Cancel</button><button type="submit" disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? "Creating account…" : "Create account"}</button></div>
        </form>
      </div> : null}

      {details ? <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4">
        <section aria-label={`Account details for ${details.username}`} className="w-full max-w-lg space-y-5 rounded-2xl bg-white p-6 shadow-xl">
          <div className="flex items-start justify-between"><div><h2 className="text-xl font-semibold text-slate-950">Account details</h2><p className="mt-1 text-sm text-slate-500">Staff profile and access settings</p></div><button type="button" onClick={() => setDetails(null)} aria-label="Close account details"><X className="h-5 w-5" /></button></div>
          <dl className="grid gap-4 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Name</dt><dd className="mt-1 font-medium text-slate-900">{`${details.firstName} ${details.lastName}`.trim() || "Not provided"}</dd></div>
            <div><dt className="text-slate-500">Username</dt><dd className="mt-1 font-medium text-slate-900">{details.username}</dd></div>
            <div><dt className="text-slate-500">Email</dt><dd className="mt-1 font-medium text-slate-900">{details.email || "Not provided"}</dd></div>
            <div><dt className="text-slate-500">Role</dt><dd className="mt-1 font-medium capitalize text-slate-900">{details.role}</dd></div>
            <div><dt className="text-slate-500">Account status</dt><dd className="mt-1 font-medium text-slate-900">{details.isActive ? "Active" : "Inactive"}</dd></div>
          </dl>
          <div className="flex justify-end"><button type="button" onClick={() => setDetails(null)} className="rounded-xl border px-4 py-2 text-sm">Close</button></div>
        </section>
      </div> : null}

      {error && !createOpen ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
    </div>
  );
}
