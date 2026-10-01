// Shared helpers — safe for both server and client code.
import { Department } from "../generated/prisma/enums";

// The one department list: the Department enum in prisma/schema.prisma (generated, dependency-free).
// Dropdowns, filters and validation all use it; a value without a label below fails the type check.
export const DEPARTMENTS = Object.values(Department);
export type DepartmentValue = Department;

export const DEPARTMENT_LABELS: Record<DepartmentValue, string> = {
  SALES: "Sales",
  DEVELOPMENT: "Development",
  MARKETING: "Marketing",
  HR: "HR",
  ACCOUNTS: "Accounts",
  STUDENTS: "Students",
};

export function departmentLabel(d: string | null | undefined) {
  return d ? (DEPARTMENT_LABELS[d as DepartmentValue] ?? d) : "—";
}

// Drafts (and new reports) can be edited until this many days after the report date.
// A submitted report has its own window instead: 48 hours from submission (lib/reports.ts).
export const EDIT_WINDOW_DAYS = 7;

// ---------------------------------------------------------------------------
// Date-only strategy: report dates travel as "YYYY-MM-DD" strings everywhere.
// In the database they are Postgres DATE columns, which Prisma maps to a JS Date
// at 00:00 UTC. We only ever convert with the UTC helpers below, so no local
// timezone offset can shift a calendar day.
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidISODate(value: string) {
  // Postgres DATE has no year 0, and planner dates before 1900 are always input errors.
  if (!ISO_DATE.test(value) || value < "1900-01-01") return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

export function dateFromISO(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function isoFromDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDaysISO(value: string, days: number) {
  const d = dateFromISO(value);
  d.setUTCDate(d.getUTCDate() + days);
  return isoFromDate(d);
}

/** Today's (or `now`'s) calendar date in the business timezone (APP_TIMEZONE on the server). */
export function todayISO(now = new Date(), timeZone = process.env.APP_TIMEZONE || "Asia/Kolkata") {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}

/** Monday–Sunday week containing the given date. */
export function weekRange(value: string) {
  const day = dateFromISO(value).getUTCDay(); // 0 = Sunday
  const monday = addDaysISO(value, -((day + 6) % 7));
  return { from: monday, to: addDaysISO(monday, 6) };
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(dateFromISO(value))
    .replace("Sept", "Sep"); // some ICU versions abbreviate September to 4 letters
}

export function formatDateTime(date: Date | string, timeZone = process.env.APP_TIMEZONE || "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true, // same 12-hour style as the planner's time pickers
    timeZone,
  })
    .format(new Date(date))
    .replace("Sept", "Sep")
    .replace(/\b(am|pm)\b/, (period) => period.toUpperCase());
}

// ---------------------------------------------------------------------------
// 12-hour clock. Times are stored as 24-hour "HH:MM"; only the UI shows AM/PM.
// ---------------------------------------------------------------------------

export type Time12 = { hour: string; minute: string; period: "" | "AM" | "PM" };

/** "15:39" -> { hour: "03", minute: "39", period: "PM" }; "" -> nothing chosen. */
export function to12h(value: string | null | undefined): Time12 {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value ?? "");
  if (!m) return { hour: "", minute: "", period: "" };
  const h = Number(m[1]);
  return { hour: String(h % 12 || 12).padStart(2, "0"), minute: m[2], period: h < 12 ? "AM" : "PM" };
}

/** Complete 12-hour parts -> stored "HH:MM" (12 AM = 00, 12 PM = 12); incomplete -> "". */
export function from12h({ hour, minute, period }: Time12) {
  if (!hour || !minute || !period) return "";
  const h = (Number(hour) % 12) + (period === "PM" ? 12 : 0);
  return `${String(h).padStart(2, "0")}:${minute}`;
}

/** "15:39" -> "03:39 PM"; empty/invalid -> "". */
export function formatTime12(value: string | null | undefined) {
  const t = to12h(value);
  return t.period ? `${t.hour}:${t.minute} ${t.period}` : "";
}

// ---------------------------------------------------------------------------
// Hours
// ---------------------------------------------------------------------------

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function formatHours(n: number | null | undefined) {
  if (n == null) return "—";
  return String(round2(n));
}

function minutesOf(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Break 1 + Break 2 + Break 3, in minutes; an empty break counts as 0. */
export function totalBreakMinutes(...breaks: (number | null | undefined)[]) {
  return breaks.reduce<number>((total, b) => total + (b ?? 0), 0);
}

/**
 * Office time in whole minutes (times are 24-hour "HH:MM", so AM/PM is already resolved):
 * office = OUT − IN, net = office − total break. Nulls while IN or OUT is missing; error when impossible.
 */
export function calcOfficeTime(
  officeIn: string | null | undefined,
  officeOut: string | null | undefined,
  breakMinutes: number,
): { officeMinutes: number | null; netMinutes: number | null; error: string | null } {
  if (!officeIn || !officeOut) return { officeMinutes: null, netMinutes: null, error: null };
  const officeMinutes = minutesOf(officeOut) - minutesOf(officeIn);
  if (officeMinutes <= 0) return { officeMinutes: null, netMinutes: null, error: "OUT time must be after IN time." };
  const netMinutes = officeMinutes - breakMinutes;
  if (netMinutes < 0) return { officeMinutes, netMinutes: null, error: "Breaks cannot be longer than the time between IN and OUT." };
  return { officeMinutes, netMinutes, error: null };
}

/** Whole minutes for display: 555 -> "9 h 15 min", 480 -> "8 h 00 min", 30 -> "30 min". Never decimal hours. */
export function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} min` : `${h} h ${String(m).padStart(2, "0")} min`;
}

export function sumHours(values: (number | null | undefined)[]) {
  return round2(values.reduce<number>((total, v) => total + (v ?? 0), 0));
}
