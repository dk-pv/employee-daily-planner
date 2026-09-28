import type { ReactNode } from "react";

const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium transition-colors " +
  "disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900";
export const btnPrimary = `${btn} bg-neutral-900 text-white hover:bg-neutral-700`;
export const btnSecondary = `${btn} border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50`;
/** Destructive actions: subtle in lists, solid only on the final confirm button. */
export const btnDangerSubtle = `${btn} border border-red-200 bg-white text-red-700 hover:border-red-300 hover:bg-red-50`;
export const btnDanger = `${btn} bg-red-700 text-white hover:bg-red-800`;

export const fieldInput =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 " +
  "focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 disabled:bg-neutral-100 disabled:text-neutral-500";
export const fieldLabel = "mb-1 block text-xs font-medium text-neutral-700";

const alertTones = {
  error: "border-red-200 bg-red-50 text-red-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  info: "border-neutral-200 bg-white text-neutral-700",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
};

export function Alert({ tone = "info", children }: { tone?: keyof typeof alertTones; children: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-md border px-3.5 py-2.5 text-sm ${alertTones[tone]}`}>
      {children}
    </div>
  );
}

const badgeTones = {
  neutral: "bg-neutral-100 text-neutral-700 ring-neutral-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  dark: "bg-neutral-900 text-white ring-neutral-900",
};

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeTones[tone]}`}>
      {children}
    </span>
  );
}

export function ReportStatusBadge({ status }: { status: "DRAFT" | "SUBMITTED" | null }) {
  if (status === "SUBMITTED") return <Badge tone="green">Submitted</Badge>;
  if (status === "DRAFT") return <Badge tone="amber">Draft</Badge>;
  return <Badge>Not started</Badge>;
}
