import type { Metadata } from "next";
import { PrintNow } from "@/components/admin/ReportPrint";
import { PlannerForm } from "@/components/planner/PlannerForm";
import { Alert } from "@/components/ui/ui";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { printSelection, serializeReport } from "@/lib/reports";
import { isoFromDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Print Reports · Admin" };

/** Print-only view: the selected reports as A4 planners, one page each, sorted by employee name. */
export default async function PrintReportsPage({ searchParams }: PageProps<"/admin/print">) {
  await requireAdmin();
  const sp = await searchParams;
  const selection = printSelection((key) => (typeof sp[key] === "string" ? sp[key] : undefined));
  const reports =
    "error" in selection
      ? []
      : await prisma.dailyReport.findMany({
          where: selection.where,
          include: { user: { select: { name: true, department: true } } },
        });
  reports.sort((a, b) => a.user.name.localeCompare(b.user.name, undefined, { sensitivity: "base" }));
  const message = "error" in selection ? selection.error : reports.length === 0 ? selection.empty : null;
  const timeZone = process.env.APP_TIMEZONE || "Asia/Kolkata";

  return (
    <div className="print-batch">
      <div className="mx-auto flex max-w-[948px] flex-wrap items-center justify-between gap-2 px-4 pt-5 sm:px-6 print:hidden">
        {message ? (
          <div className="w-full">
            <Alert tone="warning">{message}</Alert>
          </div>
        ) : (
          <>
            <p className="text-sm text-neutral-600">
              {reports.length} report{reports.length === 1 ? "" : "s"} · one A4 page each
            </p>
            <PrintNow />
          </>
        )}
      </div>
      <div>
        {reports.map((r) => (
          <div key={r.id} className="print-page">
            <PlannerForm
              mode="print"
              employee={r.user}
              date={isoFromDate(r.reportDate)}
              report={serializeReport(r)}
              lockReason={null}
              timeZone={timeZone}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
