import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { authorizeApi, jsonError, readJson } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { editLockReason, serializeReport, withoutBlankRows } from "@/lib/reports";
import { addDaysISO, calcNetOfficeHours, dateFromISO, EDIT_WINDOW_DAYS, isoFromDate, sumHours } from "@/lib/utils";
import { firstError, saveReportSchema } from "@/lib/validations";

/**
 * Create-or-update the signed-in staff member's report for one date.
 * The (userId, reportDate) unique constraint guarantees one record per staff/date;
 * the user always comes from the session, never from the request body.
 */
export async function POST(request: Request) {
  const auth = await authorizeApi("STAFF");
  if (auth.error) return auth.error;
  const userId = auth.user.id;

  const parsed = saveReportSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(firstError(parsed.error), 400);
  const { reportDate: date, action } = parsed.data;
  const content = withoutBlankRows(parsed.data.content);
  const reportDate = dateFromISO(date);
  const key = { userId_reportDate: { userId, reportDate } };

  const existing = await prisma.dailyReport.findUnique({
    where: key,
    select: { editableUntil: true, status: true },
  });
  const lock = editLockReason(date, existing ? isoFromDate(existing.editableUntil) : null);
  if (lock) return jsonError(lock, 403);

  const data = {
    ...content,
    netOfficeHours: calcNetOfficeHours(content.officeIn, content.officeOut, content.breakMinutes).hours,
    totalPlannedHours: sumHours(content.tasks.map((t) => t.planned)),
    totalWorkedHours: sumHours(content.tasks.map((t) => t.worked)),
  };
  const submitting = action === "submit";
  const now = new Date();

  const upsert = () =>
    prisma.dailyReport.upsert({
      where: key,
      create: {
        ...data,
        userId,
        reportDate,
        editableUntil: dateFromISO(addDaysISO(date, EDIT_WINDOW_DAYS)),
        status: submitting ? "SUBMITTED" : "DRAFT",
        submittedAt: submitting ? now : null,
      },
      // A submitted report never goes back to draft. submittedAt is never overwritten here.
      update: submitting ? { ...data, status: "SUBMITTED" } : data,
    });

  let report;
  try {
    report = await upsert();
  } catch (e) {
    // Two saves raced to create the same row: the loser retries and becomes an update.
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    report = await upsert();
  }
  if (submitting && !report.submittedAt) {
    // First submission of an existing draft. The conditional update keeps the earliest time if submits race.
    await prisma.dailyReport.updateMany({ where: { id: report.id, submittedAt: null }, data: { submittedAt: now } });
    report = await prisma.dailyReport.findUniqueOrThrow({ where: { id: report.id } });
  }

  const message = !submitting
    ? "Draft saved."
    : existing?.status === "SUBMITTED"
      ? "Report updated successfully."
      : "Report submitted successfully.";
  // Staff never receive the manager's note or performance index.
  return NextResponse.json({ report: serializeReport(report, { withReview: false }), message });
}
