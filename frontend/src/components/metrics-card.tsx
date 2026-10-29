import type { ReactNode } from "react";

interface MetricsCardProps {
  title: string;
  value: string;
  change?: string;
  icon?: ReactNode;
  tone?: "default" | "emerald" | "amber" | "rose" | "blue";
}

const toneStyles: Record<NonNullable<MetricsCardProps["tone"]>, string> = {
  default: "bg-slate-100 text-slate-700",
  emerald: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  rose: "bg-rose-100 text-rose-700",
  blue: "bg-blue-100 text-blue-700",
};

export function MetricsCard({ title, value, change, icon, tone = "default" }: MetricsCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
        </div>
        {icon ? <div className={`rounded-xl p-2 ${toneStyles[tone]}`}>{icon}</div> : null}
      </div>
      {change ? <p className="mt-3 text-xs font-medium text-slate-500">{change}</p> : null}
    </div>
  );
}
