import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlannerForm } from "@/components/planner/PlannerForm";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializeReport } from "@/lib/reports";
import { formatDate, isoFromDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Review Report · Admin" };

export default async function ReportReviewPage({ params }: PageProps<"/admin/reports/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const report = await prisma.dailyReport.findUnique({
    where: { id },
    include: { user: { select: { name: true, department: true } } },
  });
  if (!report) notFound();

  return (
    <>
      <div className="mx-auto flex max-w-[948px] flex-wrap items-center justify-between gap-2 px-4 pt-5 sm:px-6 print:hidden">
        <Link href="/admin" className="text-sm font-medium text-neutral-600 hover:text-neutral-900">
          ← Back to reports
        </Link>
        <p className="text-sm text-neutral-500">
          {report.user.name} · {formatDate(isoFromDate(report.reportDate))}
        </p>
      </div>
      <PlannerForm
        mode="admin"
        employee={report.user}
        date={isoFromDate(report.reportDate)}
        report={serializeReport(report, { withReview: true })}
        lockReason={null}
        timeZone={process.env.APP_TIMEZONE || "Asia/Kolkata"}
      />
    </>
  );
}
