export default function Loading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" aria-live="polite">
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-600 shadow-sm">
        Loading gym records…
      </div>
    </div>
  );
}
