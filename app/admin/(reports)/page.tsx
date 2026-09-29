import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DeleteReportButton, ReportDeletion } from "@/components/admin/ReportDelete";
import { ReportFilters, type Filters } from "@/components/admin/ReportFilters";
import { btnSecondary, ReportStatusBadge } from "@/components/ui/ui";
import type { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  addDaysISO,
  dateFromISO,
  DEPARTMENT_LABELS,
  DEPARTMENTS,
  departmentLabel,
  formatDate,
  formatDateTime,
  formatHours,
  isoFromDate,
  isValidISODate,
  todayISO,
  weekRange,
  type DepartmentValue,
} from "@/lib/utils";

export const metadata: Metadata = { title: "Daily Reports · Admin" };

const PAGE_SIZE = 20;
const PERIODS = ["all", "today", "this-week", "last-week", "date", "range"] as const;

function readFilters(sp: Record<string, string | string[] | undefined>): Filters & { page: number } {
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const date = (k: string) => (isValidISODate(get(k)) ? get(k) : "");
  const period = PERIODS.find((p) => p === get("period")) ?? "all";
  const dept = DEPARTMENTS.find((d) => d === get("dept")) ?? "";
  const status = get("status") === "SUBMITTED" || get("status") === "DRAFT" ? get("status") : "";
  return {
    q: get("q").slice(0, 100),
    dept,
    status,
    period,
    date: date("date"),
    from: date("from"),
    to: date("to"),
    page: Math.min(Math.max(1, Math.floor(Number(get("page"))) || 1), 100_000),
  };
}

function dateRange(f: Filters, today: string): { from?: string; to?: string } | null {
  switch (f.period) {
    case "today":
      return { from: today, to: today };
    case "this-week":
      return weekRange(today);
    case "last-week":
      return weekRange(addDaysISO(today, -7));
    case "date":
      return f.date ? { from: f.date, to: f.date } : null;
    case "range":
      return f.from || f.to ? { from: f.from || undefined, to: f.to || undefined } : null;
    default:
      return null;
  }
}

export default async function ReportsPage({ searchParams }: PageProps<"/admin">) {
  await requireAdmin();
  const filters = readFilters(await searchParams);
  const today = todayISO();
  const range = dateRange(filters, today);

  // Search matches employee name, email, or department name.
  const q = filters.q;
  const deptMatches = q
    ? DEPARTMENTS.filter((d) => DEPARTMENT_LABELS[d].toLowerCase().includes(q.toLowerCase()))
    : [];
  const userWhere: Prisma.UserWhereInput[] = [];
  if (filters.dept) userWhere.push({ department: filters.dept as DepartmentValue });
  if (q) {
    userWhere.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        ...(deptMatches.length ? [{ department: { in: deptMatches } }] : []),
      ],
    });
  }
  const where: Prisma.DailyReportWhereInput = {
    ...(filters.status ? { status: filters.status as "DRAFT" | "SUBMITTED" } : {}),
    ...(range
      ? {
          reportDate: {
            ...(range.from ? { gte: dateFromISO(range.from) } : {}),
            ...(range.to ? { lte: dateFromISO(range.to) } : {}),
          },
        }
      : {}),
    ...(userWhere.length ? { user: { AND: userWhere } } : {}),
  };

  const [total, reports] = await Promise.all([
    prisma.dailyReport.count({ where }),
    prisma.dailyReport.findMany({
      where,
      orderBy: [{ reportDate: "desc" }, { user: { name: "asc" } }],
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        reportDate: true,
        status: true,
        totalPlannedHours: true,
        totalWorkedHours: true,
        performanceIndex: true,
        updatedAt: true,
        user: { select: { name: true, email: true, department: true } },
      },
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(q || filters.dept || filters.status || range);
  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v && k !== "page") params.set(k, String(v));
    params.set("page", String(page));
    return `/admin?${params}`;
  };
  // A stale link past the last page: go to the last page instead of showing a contradictory empty table.
  if (total > 0 && filters.page > pages) redirect(pageHref(pages));
  const rangeText = !range
    ? "All dates"
    : range.from && range.from === range.to
      ? formatDate(range.from)
      : `${range.from ? formatDate(range.from) : "…"} – ${range.to ? formatDate(range.to) : "…"}`;
  const tz = process.env.APP_TIMEZONE || "Asia/Kolkata";

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Daily Reports</h1>
        <p className="text-sm text-neutral-500">Search, filter and review employee daily planners.</p>
      </div>

      {/* Keyed so "Clear filters" / back navigation resets the form state. */}
      <ReportFilters key={JSON.stringify(filters)} initial={filters} />

      {/*
        Keyed without the page so a success notice clears on a new search/filter but survives the page change below.
        On a page showing a single row, a delete empties it: go back a page instead of refreshing into the
        past-the-last-page redirect, which would remount the list and drop the notice.
      */}
      <ReportDeletion
        key={JSON.stringify({ ...filters, page: undefined })}
        previousPageHref={reports.length === 1 && filters.page > 1 ? pageHref(filters.page - 1) : undefined}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-neutral-600">
          <p>
            {total === 0
              ? "No reports"
              : `Showing ${(filters.page - 1) * PAGE_SIZE + 1}–${Math.min(filters.page * PAGE_SIZE, total)} of ${total} report${total === 1 ? "" : "s"}`}
            <span className="text-neutral-400"> · {rangeText}</span>
          </p>
        </div>

        {reports.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-300 bg-white px-6 py-14 text-center">
            <p className="font-medium text-neutral-800">
              {hasFilters ? "No reports match your filters." : "No reports have been saved yet."}
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              {hasFilters ? "Try a different search, department or date range." : "Reports appear here as soon as staff start their planners."}
            </p>
            {hasFilters && (
              <Link href="/admin" className={`${btnSecondary} mt-4`}>
                Clear filters
              </Link>
            )}
          </div>
        ) : (
          <div className="relative overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-medium uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-3 py-2.5">Employee</th>
                  <th className="px-3 py-2.5">Department</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Planned Hours</th>
                  <th className="px-3 py-2.5 text-right">Worked Hours</th>
                  <th className="px-3 py-2.5 text-center">Performance</th>
                  <th className="px-3 py-2.5">Updated</th>
                  <th className="px-3 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {reports.map((r) => (
                  <tr key={r.id} className="hover:bg-neutral-50">
                    <td className="px-3 py-3">
                      <p className="font-medium text-neutral-900">{r.user.name}</p>
                      <p className="text-xs text-neutral-500">{r.user.email}</p>
                    </td>
                    <td className="px-3 py-3 text-neutral-700">{departmentLabel(r.user.department)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-neutral-700">{formatDate(isoFromDate(r.reportDate))}</td>
                    <td className="px-3 py-3">
                      <ReportStatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatHours(r.totalPlannedHours.toNumber())}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatHours(r.totalWorkedHours.toNumber())}</td>
                    <td className="px-3 py-3 text-center tabular-nums">
                      {r.performanceIndex ? `${r.performanceIndex}/5` : <span className="text-neutral-400">—</span>}
                    </td>
                    {/* Date and time on two lines (like Employee) so View + Delete fit without scrolling. */}
                    <td className="whitespace-pre px-3 py-3 text-xs text-neutral-500">
                      {formatDateTime(r.updatedAt, tz).replace(", ", "\n")}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-2">
                        <Link href={`/admin/reports/${r.id}`} className={`${btnSecondary} px-3 py-1.5 text-xs`}>
                          View
                        </Link>
                        <DeleteReportButton
                          id={r.id}
                          employee={r.user.name}
                          email={r.user.email}
                          date={formatDate(isoFromDate(r.reportDate))}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
            <span className="text-neutral-500">
              Page {filters.page} of {pages}
            </span>
            <div className="flex gap-2">
              {filters.page > 1 ? (
                <Link href={pageHref(filters.page - 1)} className={btnSecondary}>
                  Previous
                </Link>
              ) : (
                <span className={`${btnSecondary} pointer-events-none opacity-40`}>Previous</span>
              )}
              {filters.page < pages ? (
                <Link href={pageHref(filters.page + 1)} className={btnSecondary}>
                  Next
                </Link>
              ) : (
                <span className={`${btnSecondary} pointer-events-none opacity-40`}>Next</span>
              )}
            </div>
          </nav>
        )}
      </ReportDeletion>
    </div>
  );
}
