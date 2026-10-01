import "server-only";
import type { DailyReport, Prisma } from "@/generated/prisma/client";
import {
  addDaysISO,
  dateFromISO,
  DEPARTMENTS,
  EDIT_WINDOW_DAYS,
  isoFromDate,
  isValidISODate,
  todayISO,
  type DepartmentValue,
} from "./utils";
import type { CheckItem, CommunicationItem, ReportContent, ScheduleItem, TaskItem } from "./validations";

export type PlannerReport = {
  id: string;
  reportDate: string;
  status: "DRAFT" | "SUBMITTED";
  submittedAt: string | null;
  updatedAt: string;
  /** DRAFT: last day it can be edited ("YYYY-MM-DD"). SUBMITTED: the exact moment editing ends (ISO timestamp, submittedAt + 48 h). */
  editableUntil: string;
  content: ReportContent;
  netOfficeHours: number | null;
  totalPlannedHours: number;
  totalWorkedHours: number;
  /** Manager review: staff see it read-only; only the admin review API (PATCH /api/reports/[id]) writes it. */
  review: { managerNote: string | null; performanceIndex: number | null; reviewedAt: string | null };
};

/**
 * Plain, client-safe shape (no Decimal / Date instances).
 */
export function serializeReport(r: DailyReport): PlannerReport {
  return {
    id: r.id,
    reportDate: isoFromDate(r.reportDate),
    status: r.status,
    submittedAt: r.submittedAt?.toISOString() ?? null,
    updatedAt: r.updatedAt.toISOString(),
    editableUntil:
      r.status === "SUBMITTED" && r.submittedAt
        ? submittedEditDeadline(r.submittedAt).toISOString()
        : isoFromDate(r.editableUntil),
    // JSON columns are only ever written through reportContentSchema.
    content: {
      jobRole: r.jobRole ?? "",
      topPriorities: r.topPriorities as CheckItem[],
      callsEmails: r.callsEmails as CommunicationItem[],
      personalTodo: r.personalTodo as CheckItem[],
      dailySchedules: r.dailySchedules as ScheduleItem[],
      officeIn: r.officeIn,
      officeOut: r.officeOut,
      breakMinutes: r.breakMinutes,
      break2Minutes: r.break2Minutes,
      break3Minutes: r.break3Minutes,
      break1Reason: r.break1Reason,
      break2Reason: r.break2Reason,
      break3Reason: r.break3Reason,
      productivity: r.productivity,
      mood: r.mood,
      health: r.health,
      tasks: r.tasks as TaskItem[],
    },
    netOfficeHours: r.netOfficeHours?.toNumber() ?? null,
    totalPlannedHours: r.totalPlannedHours.toNumber(),
    totalWorkedHours: r.totalWorkedHours.toNumber(),
    review: {
      managerNote: r.managerNote,
      performanceIndex: r.performanceIndex,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
    },
  };
}

export const FUTURE_LIMIT_DAYS = 7;

/** A submitted report stays editable for exactly this long after it was first submitted. */
export const SUBMITTED_EDIT_HOURS = 48;
export const EDIT_EXPIRED_MESSAGE = "Your 48-hour editing period has expired. This report is now read-only.";

/** The moment a submitted report becomes read-only: submittedAt + 48 h — never derived from the report date. */
export function submittedEditDeadline(submittedAt: Date) {
  return new Date(submittedAt.getTime() + SUBMITTED_EDIT_HOURS * 60 * 60 * 1000);
}

/**
 * Why a staff member may not create/edit the report for `reportDate`, or null if they may. The planner page and
 * POST /api/reports both call this with the server clock; admin review and delete never do.
 * - SUBMITTED: editable while now < submittedAt + 48 h. Saving never moves submittedAt, so edits never extend it.
 * - DRAFT or no report yet: until `editableUntil` (stored as reportDate + 7 days) and at most 7 days ahead.
 */
export function editLockReason(
  reportDate: string,
  report: Pick<DailyReport, "status" | "submittedAt" | "editableUntil"> | null,
  now = new Date(),
) {
  if (report?.status === "SUBMITTED") {
    // No submission time means the window cannot be known, so it stays read-only (the save route writes both together).
    return report.submittedAt && now < submittedEditDeadline(report.submittedAt) ? null : EDIT_EXPIRED_MESSAGE;
  }
  const today = todayISO(now);
  const until = report ? isoFromDate(report.editableUntil) : addDaysISO(reportDate, EDIT_WINDOW_DAYS);
  if (today > until) return "Your editing period has ended. Unsubmitted reports can only be edited for 7 days after the report date.";
  if (reportDate > addDaysISO(today, FUTURE_LIMIT_DAYS)) return "Reports can only be planned up to 7 days ahead.";
  return null;
}

/** Drop rows the employee left completely blank; blank rows are optional, not errors. */
export function withoutBlankRows(c: ReportContent): ReportContent {
  const filled = (item: CheckItem) => item.text !== "";
  return {
    ...c,
    topPriorities: c.topPriorities.filter(filled),
    callsEmails: c.callsEmails.filter((item) => item.text !== ""),
    personalTodo: c.personalTodo.filter(filled),
    dailySchedules: c.dailySchedules.filter((s) => s.time !== "" || s.text !== ""),
    tasks: c.tasks.filter((t) => t.text !== "" || t.planned != null || t.worked != null),
  };
}

/**
 * Which reports an admin print covers (/admin/print and GET /api/reports/print share this, so both
 * validate server-side): one report by id, or every report on a date, optionally narrowed to one
 * department and/or one staff member. `empty` is the message to show when nothing matches.
 */
export function printSelection(
  param: (key: string) => string | null | undefined,
): { error: string } | { where: Prisma.DailyReportWhereInput; empty: string } {
  const get = (key: string) => param(key)?.trim() ?? "";
  if (get("id")) return { where: { id: get("id") }, empty: "Report not found." };
  const date = get("date");
  if (!date) return { error: "Please select a date." };
  if (!isValidISODate(date)) return { error: "Please select a valid date." };
  const dept = get("dept");
  if (dept && !DEPARTMENTS.includes(dept as DepartmentValue)) return { error: "Invalid department." };
  const staff = get("staff");
  return {
    where: {
      reportDate: dateFromISO(date),
      ...(staff ? { userId: staff } : {}),
      ...(dept ? { user: { department: dept as DepartmentValue } } : {}),
    },
    empty: staff
      ? "No report available for this employee on this date."
      : dept
        ? "No reports available for the selected filters."
        : "No reports available for this date.",
  };
}
