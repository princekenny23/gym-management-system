"use client";

import { useGymData } from "@/components/gym-data-provider";

export function SettingsView() {
  const { settings, setSettings } = useGymData();

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-xl font-semibold text-slate-900">Gym details</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm text-slate-600">
            Gym name
            <input
              value={settings.gymName}
              onChange={(event) => setSettings((state) => ({ ...state, gymName: event.target.value }))}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-slate-700"
            />
          </label>
          <label className="block text-sm text-slate-600">
            Logo text
            <input
              value={settings.logoText}
              onChange={(event) => setSettings((state) => ({ ...state, logoText: event.target.value }))}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-slate-700"
            />
          </label>
          <label className="block text-sm text-slate-600 md:col-span-2">
            Address
            <input
              value={settings.address}
              onChange={(event) => setSettings((state) => ({ ...state, address: event.target.value }))}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-slate-700"
            />
          </label>
          <label className="block text-sm text-slate-600">
            Phone
            <input
              value={settings.phone}
              onChange={(event) => setSettings((state) => ({ ...state, phone: event.target.value }))}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-slate-700"
            />
          </label>
          <label className="block text-sm text-slate-600">
            Email
            <input
              value={settings.email}
              onChange={(event) => setSettings((state) => ({ ...state, email: event.target.value }))}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-slate-700"
            />
          </label>
          <label className="block text-sm text-slate-600">
            Currency
            <input
              value={settings.currency}
              onChange={(event) => setSettings((state) => ({ ...state, currency: event.target.value }))}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-slate-700"
            />
          </label>
          <label className="block text-sm text-slate-600">
            Primary colour
            <input
              type="color"
              value={settings.primaryColor}
              onChange={(event) => setSettings((state) => ({ ...state, primaryColor: event.target.value }))}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-2"
            />
          </label>
          <label className="block text-sm text-slate-600">
            Expiry warning days
            <input
              type="number"
              min={1}
              max={365}
              step={1}
              value={settings.expiryWarningDays}
              onChange={(event) => setSettings((state) => ({
                ...state,
                expiryWarningDays: Math.min(365, Math.max(1, Math.trunc(Number(event.target.value) || 1))),
              }))}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-slate-700"
            />
          </label>
          <label className="block text-sm text-slate-600">
            Duplicate check-in interval (minutes)
            <input
              type="number"
              value={settings.duplicateCheckInMinutes}
              onChange={(event) => setSettings((state) => ({ ...state, duplicateCheckInMinutes: Number(event.target.value) }))}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-slate-700"
            />
          </label>
          <label className="block text-sm text-slate-600 md:col-span-2">
            Receipt footer
            <input
              value={settings.receiptFooter}
              onChange={(event) => setSettings((state) => ({ ...state, receiptFooter: event.target.value }))}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-slate-700"
            />
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-xl font-semibold text-slate-900">Preview</h3>
        <div className="mt-4 rounded-2xl border border-slate-200 p-4" style={{ backgroundColor: `${settings.primaryColor}12` }}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: settings.primaryColor }}>
              {settings.logoText}
            </div>
            <div>
              <p className="text-sm text-slate-500">Preview</p>
              <p className="font-semibold text-slate-900">{settings.gymName}</p>
            </div>
          </div>
          <div className="mt-4 space-y-2 text-sm text-slate-700">
            <p>{settings.address}</p>
            <p>{settings.phone}</p>
            <p>{settings.email}</p>
          </div>
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
            <p className="font-medium">Receipt footer</p>
            <p className="mt-1">{settings.receiptFooter}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
