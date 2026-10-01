// Self-check for the staff edit windows. Run: npx tsx --conditions=react-server scripts/check-edit-window.ts
import assert from "node:assert/strict";
import type { DailyReport } from "../generated/prisma/client";
import { EDIT_EXPIRED_MESSAGE, editLockReason, serializeReport, submittedEditDeadline } from "../lib/reports";
import { addDaysISO, dateFromISO } from "../lib/utils";

const H = 60 * 60 * 1000;
const at = (iso: string, plusMs = 0) => new Date(new Date(iso).getTime() + plusMs);
const submitted = (submittedAt: string | null, reportDate = "2026-09-29") => ({
  status: "SUBMITTED" as const,
  submittedAt: submittedAt ? new Date(submittedAt) : null,
  editableUntil: dateFromISO(reportDate), // the 7-day draft column must not matter once submitted
});
const draft = (reportDate: string) => ({
  status: "DRAFT" as const,
  submittedAt: null,
  editableUntil: dateFromISO(addDaysISO(reportDate, 7)),
});

// Report date 29 Sep, submitted 29 Sep 5:30 PM IST (12:00 UTC) -> editable until 1 Oct 5:30 PM IST.
const sub = "2026-09-29T12:00:00.000Z";
assert.equal(submittedEditDeadline(new Date(sub)).toISOString(), "2026-10-01T12:00:00.000Z");
const lock = (plusMs: number) => editLockReason("2026-09-29", submitted(sub), at(sub, plusMs));
assert.equal(lock(0), null, "just submitted");
assert.equal(lock(24 * H), null, "after 24 h");
assert.equal(lock(47 * H), null, "after 47 h");
assert.equal(lock(47 * H + 59 * 60 * 1000), null, "47 h 59 min");
assert.equal(lock(48 * H - 1), null, "1 ms before the deadline");
assert.equal(lock(48 * H), EDIT_EXPIRED_MESSAGE, "exactly 48 h");
assert.equal(lock(48 * H + 60 * 1000), EDIT_EXPIRED_MESSAGE, "48 h 1 min");
assert.equal(lock(30 * 24 * H), EDIT_EXPIRED_MESSAGE, "a month later");

// The window follows submittedAt, not the report date: 29 Sep report submitted 1 Oct 10:15 -> editable until 3 Oct 10:15.
const late = "2026-10-01T10:15:00.000Z";
assert.equal(editLockReason("2026-09-29", submitted(late), at("2026-10-03T10:14:59.999Z")), null);
assert.equal(editLockReason("2026-09-29", submitted(late), at("2026-10-03T10:15:00.000Z")), EDIT_EXPIRED_MESSAGE);
// Submitted on the draft window's last day, still editable the day after (the 7-day draft rule no longer applies).
assert.equal(editLockReason("2026-09-22", submitted("2026-09-29T17:00:00Z", "2026-09-22"), at("2026-09-30T17:00:00Z")), null);
// A submitted report without a submission time is never editable.
assert.equal(editLockReason("2026-09-29", submitted(null), at(sub)), EDIT_EXPIRED_MESSAGE);

// Drafts keep the existing date window (APP_TIMEZONE days): yesterday's and 7-day-old drafts are editable, 8 days is not.
const now = at("2026-09-30T06:00:00Z"); // 30 Sep 11:30 AM IST
assert.equal(editLockReason("2026-09-29", draft("2026-09-29"), now), null, "yesterday's draft");
assert.equal(editLockReason("2026-09-23", draft("2026-09-23"), now), null, "7-day-old draft");
assert.match(editLockReason("2026-09-22", draft("2026-09-22"), now) ?? "", /editing period has ended/);
// New reports: today and up to 7 days ahead.
assert.equal(editLockReason("2026-09-30", null, now), null);
assert.equal(editLockReason("2026-10-07", null, now), null);
assert.match(editLockReason("2026-10-08", null, now) ?? "", /7 days ahead/);

// What the planner receives: the exact deadline for a submitted report, the last editable day for a draft.
const decimal = (n: number) => ({ toNumber: () => n });
const row = (r: object) =>
  ({
    id: "r1",
    userId: "u1",
    reportDate: dateFromISO("2026-09-29"),
    jobRole: "Dev",
    topPriorities: [],
    callsEmails: [],
    personalTodo: [],
    dailySchedules: [],
    tasks: [],
    netOfficeHours: null,
    totalPlannedHours: decimal(0),
    totalWorkedHours: decimal(0),
    updatedAt: new Date(sub),
    reviewedAt: null,
    ...r,
  }) as unknown as DailyReport;
assert.equal(serializeReport(row(submitted(sub))).editableUntil, "2026-10-01T12:00:00.000Z");
assert.equal(serializeReport(row(draft("2026-09-29"))).editableUntil, "2026-10-06");

console.log("edit windows: all checks passed");
