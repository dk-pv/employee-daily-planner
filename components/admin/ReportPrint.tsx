"use client";

import { useEffect, useState } from "react";
import type { StaffOption } from "@/components/admin/ReportFilters";
import { btnPrimary, btnSecondary, fieldInput, fieldLabel } from "@/components/ui/ui";
import { DEPARTMENT_LABELS, DEPARTMENTS } from "@/lib/utils";

/** On the print page: opens the print dialog once the planners (and their fonts) are ready, plus a manual button. */
export function PrintNow() {
  useEffect(() => {
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) window.print();
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <button type="button" onClick={() => window.print()} className={`${btnSecondary} max-lg:min-h-10`}>
      Print
    </button>
  );
}

type Found = { query: string; count: number; message: string | null };

/**
 * Print panel on the Daily Reports page: a date, optionally narrowed to a department and/or staff member.
 * The server counts the matches first, so the print page only opens when there is something to print.
 */
export function PrintReports({
  today,
  staff,
}: {
  today: string;
  staff: (StaffOption & { department: string | null })[];
}) {
  const [date, setDate] = useState(today);
  const [dept, setDept] = useState("");
  const [staffId, setStaffId] = useState("");
  const [found, setFound] = useState<Found | null>(null);

  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (dept) params.set("dept", dept);
  if (staffId) params.set("staff", staffId);
  const query = date ? params.toString() : "";

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    fetch(`/api/reports/print?${query}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        setFound(
          res.ok
            ? { query, count: body.count, message: body.message }
            : { query, count: 0, message: body.error ?? "Could not check reports. Please try again." },
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setFound({ query, count: 0, message: "Network error — could not check reports." });
      });
    return () => controller.abort();
  }, [query]);

  const current = found?.query === query ? found : null;
  const message = !date ? "Please select a date." : current ? current.message : null;
  const canPrint = !!current && current.count > 0;
  const staffOptions = dept ? staff.filter((s) => s.department === dept) : staff;

  return (
    <section aria-labelledby="print-title" className="rounded-lg border border-neutral-200 bg-white p-4">
      <h2 id="print-title" className="text-sm font-semibold text-neutral-900">
        Print Reports
      </h2>
      <p className="text-xs text-neutral-500">One A4 page per report, sorted by employee name.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
        <div>
          <label htmlFor="p-date" className={fieldLabel}>
            Date
          </label>
          <input id="p-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={fieldInput} />
        </div>
        <div>
          <label htmlFor="p-dept" className={fieldLabel}>
            Department
          </label>
          <select
            id="p-dept"
            value={dept}
            onChange={(e) => {
              setDept(e.target.value);
              // A staff member from another department can never match: back to all staff.
              if (e.target.value && staff.find((s) => s.id === staffId)?.department !== e.target.value) setStaffId("");
            }}
            className={fieldInput}
          >
            <option value="">All departments</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {DEPARTMENT_LABELS[d]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="p-staff" className={fieldLabel}>
            Staff
          </label>
          <select id="p-staff" value={staffId} onChange={(e) => setStaffId(e.target.value)} className={fieldInput}>
            <option value="">All staff</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {`${s.name} · ${s.email}${s.isActive ? "" : " (inactive)"}`}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end sm:col-span-3 lg:col-span-1">
          {canPrint ? (
            // A real link (new tab): a direct click is never popup-blocked, and the list keeps its state.
            <a href={`/admin/print?${query}`} target="_blank" className={`${btnPrimary} w-full max-lg:min-h-10 lg:w-auto`}>
              {current.count === 1 ? "Print Report" : "Print Reports"}
            </a>
          ) : (
            <button type="button" disabled className={`${btnPrimary} w-full max-lg:min-h-10 lg:w-auto`}>
              Print Reports
            </button>
          )}
        </div>
      </div>
      <p role="status" className={`mt-2 text-sm ${canPrint ? "text-neutral-600" : "text-neutral-500"}`}>
        {message ?? (current ? `Reports found: ${current.count}` : date ? "Checking reports…" : "")}
      </p>
    </section>
  );
}
