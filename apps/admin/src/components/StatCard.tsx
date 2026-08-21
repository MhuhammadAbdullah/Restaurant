import type React from "react";

export function StatCard({
  icon: Icon,
  color,
  label,
  value,
  sub,
  warn,
}: {
  icon: (p: { size?: number; className?: string }) => React.ReactElement;
  color: string;
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${warn ? "border-red-200 bg-red-50" : "border-neutral-200 bg-white"}`}>
      <span className={`flex h-9 w-9 items-center justify-center rounded-full ${warn ? "bg-red-100 text-red-600" : color}`}>
        <Icon size={18} />
      </span>
      <p className="mt-2 text-xs text-neutral-500">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold ${warn ? "text-red-600" : "text-neutral-900"}`}>{value}</p>
      {sub && <p className="text-xs text-neutral-400">{sub}</p>}
    </div>
  );
}
