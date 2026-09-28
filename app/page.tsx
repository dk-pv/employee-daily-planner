import { LogoutButton } from "@/components/auth/LogoutButton";
import { PlannerForm } from "@/components/planner/PlannerForm";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { editLockReason, serializeReport } from "@/lib/reports";
import { dateFromISO, departmentLabel, isoFromDate, isValidISODate, todayISO } from "@/lib/utils";

export default async function PlannerPage({ searchParams }: PageProps<"/">) {
  const user = await requireStaff();
  const { date: requested } = await searchParams;
  const today = todayISO();
  const date = typeof requested === "string" && isValidISODate(requested) ? requested : today;

  // The report is looked up by the session user + date — never by an id from the browser.
  const report = await prisma.dailyReport.findUnique({
    where: { userId_reportDate: { userId: user.id, reportDate: dateFromISO(date) } },
  });
  const lockReason = editLockReason(date, report ? isoFromDate(report.editableUntil) : null, today);

  return (
    <>
      <header className="border-b border-neutral-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-[948px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <p className="text-sm font-bold tracking-[0.12em] text-neutral-900">DAILY PLANNER</p>
          <div className="flex min-w-0 items-center gap-3">
            <p className="min-w-0 truncate text-right text-xs text-neutral-600">
              <span className="font-medium text-neutral-900">{user.name}</span>
              <span className="hidden sm:inline"> · {departmentLabel(user.department)}</span>
            </p>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="flex-1">
        <PlannerForm
          key={date}
          mode="staff"
          employee={{ name: user.name, department: user.department }}
          date={date}
          report={report ? serializeReport(report, { withReview: false }) : null}
          lockReason={lockReason}
          timeZone={process.env.APP_TIMEZONE || "Asia/Kolkata"}
        />
      </main>
    </>
  );
}
