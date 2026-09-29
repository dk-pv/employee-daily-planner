import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { authorizeApi, jsonError, readJson } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { editLockReason, serializeReport, withoutBlankRows } from "@/lib/reports";
import {
  addDaysISO,
  calcOfficeTime,
  dateFromISO,
  EDIT_WINDOW_DAYS,
  isoFromDate,
  round2,
  sumHours,
  totalBreakMinutes,
} from "@/lib/utils";
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

  const breaks = totalBreakMinutes(content.breakMinutes, content.break2Minutes, content.break3Minutes);
  const { netMinutes } = calcOfficeTime(content.officeIn, content.officeOut, breaks);
  const data = {
    ...content,
    // Worked out in minutes; the netOfficeHours column keeps its hours format (the planner displays h + min).
    netOfficeHours: netMinutes == null ? null : round2(netMinutes / 60),
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
    report = await upsert().catch((e) => {
      // Two saves raced to create the same row: the loser retries and becomes an update.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return upsert();
      throw e;
    });
    if (submitting && !report.submittedAt) {
      // First submission of an existing draft. The conditional update keeps the earliest time if submits race.
      await prisma.dailyReport.updateMany({ where: { id: report.id, submittedAt: null }, data: { submittedAt: now } });
      report = await prisma.dailyReport.findUniqueOrThrow({ where: { id: report.id } });
    }
  } catch (e) {
    return saveFailed(e);
  }

  const message = !submitting
    ? "Draft saved."
    : existing?.status === "SUBMITTED"
      ? "Report updated successfully."
      : "Report submitted successfully.";
  // The review (manager note / performance index) comes back read-only; this route never writes it.
  return NextResponse.json({ report: serializeReport(report), message });
}

/** The database refused the save: details go to the server log, the planner gets a message someone can act on. */
function saveFailed(e: unknown) {
  console.error("Report save failed", e);
  // P2021 / P2022: a table or column this version needs is missing — the latest migrations are not applied.
  if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2021" || e.code === "P2022")) {
    return jsonError(
      "Your report could not be saved because the database is not up to date. Please ask an administrator to apply the latest database updates.",
      500,
    );
  }
  return jsonError("Your report could not be saved. Please try again.", 500);
}
