"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { btnPrimary, btnSecondary, fieldInput, fieldLabel } from "@/components/ui/ui";
import { DEPARTMENT_LABELS, DEPARTMENTS } from "@/lib/utils";

export type Filters = {
  q: string;
  /** A staff user's id, or "" for all staff. */
  staff: string;
  dept: string;
  status: string;
  period: "all" | "today" | "this-week" | "last-week" | "date" | "range";
  date: string;
  from: string;
  to: string;
};

const PERIOD_LABELS: Record<Filters["period"], string> = {
  all: "All dates",
  today: "Today",
  "this-week": "Current week",
  "last-week": "Previous week",
  date: "Specific date",
  range: "Date range",
};

export type StaffOption = { id: string; name: string; email: string; isActive: boolean };

/** Filters live in the URL; the server page runs the actual database query. */
export function ReportFilters({ initial, staff }: { initial: Filters; staff: StaffOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [f, setF] = useState(initial);
  const update = (patch: Partial<Filters>) => setF((prev) => ({ ...prev, ...patch }));

  function apply(e: FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (f.q.trim()) params.set("q", f.q.trim());
    if (f.staff) params.set("staff", f.staff);
    if (f.dept) params.set("dept", f.dept);
    if (f.status) params.set("status", f.status);
    if (f.period !== "all") params.set("period", f.period);
    if (f.period === "date" && f.date) params.set("date", f.date);
    if (f.period === "range") {
      if (f.from) params.set("from", f.from);
      if (f.to) params.set("to", f.to);
    }
    startTransition(() => router.push(params.size ? `/admin?${params}` : "/admin"));
  }

  function reset() {
    setF({ q: "", staff: "", dept: "", status: "", period: "all", date: "", from: "", to: "" });
    startTransition(() => router.push("/admin"));
  }

  return (
    <form onSubmit={apply} className="rounded-lg border border-neutral-200 bg-white p-4" role="search">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(2,minmax(0,1.5fr))_repeat(3,minmax(0,1fr))]">
        {/* Full row on two-column screens, so the other four filters form a 2×2 grid below it. */}
        <div className="sm:col-span-2 lg:col-span-1">
          <label htmlFor="f-q" className={fieldLabel}>
            Search
          </label>
          <input
            id="f-q"
            type="search"
            value={f.q}
            onChange={(e) => update({ q: e.target.value })}
            placeholder="Name, email or department"
            maxLength={100}
            className={fieldInput}
          />
        </div>
        <div>
          <label htmlFor="f-staff" className={fieldLabel}>
            Staff
          </label>
          <select id="f-staff" value={f.staff} onChange={(e) => update({ staff: e.target.value })} className={fieldInput}>
            <option value="">All staff</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {`${s.name} · ${s.email}${s.isActive ? "" : " (inactive)"}`}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-dept" className={fieldLabel}>
            Department
          </label>
          <select id="f-dept" value={f.dept} onChange={(e) => update({ dept: e.target.value })} className={fieldInput}>
            <option value="">All departments</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {DEPARTMENT_LABELS[d]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-status" className={fieldLabel}>
            Status
          </label>
          <select id="f-status" value={f.status} onChange={(e) => update({ status: e.target.value })} className={fieldInput}>
            <option value="">All statuses</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="DRAFT">Draft</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-period" className={fieldLabel}>
            Date / week
          </label>
          <select
            id="f-period"
            value={f.period}
            onChange={(e) => update({ period: e.target.value as Filters["period"] })}
            className={fieldInput}
          >
            {Object.entries(PERIOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          {f.period === "date" && (
            <div>
              <label htmlFor="f-date" className={fieldLabel}>
                Date
              </label>
              <input id="f-date" type="date" value={f.date} onChange={(e) => update({ date: e.target.value })} className={fieldInput} />
            </div>
          )}
          {f.period === "range" && (
            <>
              <div>
                <label htmlFor="f-from" className={fieldLabel}>
                  From
                </label>
                <input id="f-from" type="date" value={f.from} max={f.to || undefined} onChange={(e) => update({ from: e.target.value })} className={fieldInput} />
              </div>
              <div>
                <label htmlFor="f-to" className={fieldLabel}>
                  To
                </label>
                <input id="f-to" type="date" value={f.to} min={f.from || undefined} onChange={(e) => update({ to: e.target.value })} className={fieldInput} />
              </div>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={reset} className={btnSecondary} disabled={pending}>
            Reset
          </button>
          <button type="submit" className={btnPrimary} disabled={pending}>
            {pending ? "Filtering…" : "Apply filters"}
          </button>
        </div>
      </div>
    </form>
  );
}
