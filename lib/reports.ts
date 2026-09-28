import "server-only";
import type { DailyReport } from "@/generated/prisma/client";
import { addDaysISO, EDIT_WINDOW_DAYS, isoFromDate, todayISO } from "./utils";
import type { CheckItem, CommunicationItem, ReportContent, ScheduleItem, TaskItem } from "./validations";

export type PlannerReport = {
  id: string;
  reportDate: string;
  status: "DRAFT" | "SUBMITTED";
  submittedAt: string | null;
  updatedAt: string;
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
    editableUntil: isoFromDate(r.editableUntil),
    // JSON columns are only ever written through reportContentSchema.
    content: {
      topPriorities: r.topPriorities as CheckItem[],
      callsEmails: r.callsEmails as CommunicationItem[],
      personalTodo: r.personalTodo as CheckItem[],
      dailySchedules: r.dailySchedules as ScheduleItem[],
      officeIn: r.officeIn,
      officeOut: r.officeOut,
      breakMinutes: r.breakMinutes,
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

/**
 * Why a staff member may not create/edit the report for `reportDate`, or null if they may.
 * `editableUntil` is the stored value for an existing report (reportDate + 7 days on creation).
 */
export function editLockReason(reportDate: string, editableUntil: string | null, today = todayISO()) {
  const until = editableUntil ?? addDaysISO(reportDate, EDIT_WINDOW_DAYS);
  if (today > until) return "Your editing period has ended. Reports can only be edited for 7 days after the report date.";
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
