import { z } from "zod";
import { DEPARTMENTS, calcNetOfficeHours, isValidISODate } from "./utils";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** Emails are stored and compared trimmed + lower-cased. */
export const emailSchema = z
  .string("Email is required.")
  .trim()
  .toLowerCase()
  .min(1, "Email is required.")
  .max(254, "Email is too long.")
  .pipe(z.email("Enter a valid email address."));

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string("Enter your password.").min(1, "Enter your password.").max(128),
  portal: z.enum(["STAFF", "ADMIN"]).default("STAFF"),
});

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const ROLES = ["STAFF", "ADMIN"] as const;

const userFields = {
  name: z.string().trim().min(1, "Name is required.").max(100),
  email: emailSchema,
  role: z.enum(ROLES, "Select a valid role."),
  // Missing, "" (the form's empty option) and null all mean "no department" -> stored as null.
  department: z
    .union([z.enum(DEPARTMENTS), z.literal("")], "Department must be Sales, Development or Marketing.")
    .nullish()
    .transform((v) => v || null),
  isActive: z.boolean(),
};

const requireStaffDepartment = (
  v: { role: (typeof ROLES)[number]; department: string | null },
  ctx: z.RefinementCtx,
) => {
  if (v.role === "STAFF" && !v.department) {
    ctx.addIssue({ code: "custom", path: ["department"], message: "Department is required for staff." });
  }
};

/** Departments belong to STAFF only: an ADMIN is always stored with department = NULL. */
const staffOnlyDepartment = <T extends { role: (typeof ROLES)[number]; department: string | null }>(v: T): T =>
  v.role === "ADMIN" ? { ...v, department: null } : v;

const password = z.string().min(8, "Password must be at least 8 characters.").max(128);

export const createUserSchema = z
  .object({ ...userFields, password })
  .superRefine(requireStaffDepartment)
  .transform(staffOnlyDepartment);

export const updateUserSchema = z
  .object({
    ...userFields,
    // Blank = keep the current password.
    password: z
      .union([z.literal(""), password])
      .optional()
      .transform((v) => v || undefined),
  })
  .superRefine(requireStaffDepartment)
  .transform(staffOnlyDepartment);

/** Hard delete must be confirmed by typing DELETE — checked on the server, not just in the dialog. */
export const deleteUserSchema = z.object({
  confirmation: z.literal("DELETE", 'Type "DELETE" to confirm.'),
});

export type CreateUserInput = z.input<typeof createUserSchema>;
export type UpdateUserInput = z.input<typeof updateUserSchema>;

// ---------------------------------------------------------------------------
// Daily report
// ---------------------------------------------------------------------------

export const isoDateSchema = z.string().refine(isValidISODate, "Invalid date.");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Invalid time.");
/**
 * The planner is one printed A4 page, so every repeatable section has a fixed number of rows
 * (measured against the rendered sheet) and each row a text limit (two printed lines in the
 * narrow column). The UI hides "+ Add" at the limit; these schemas enforce it for any client.
 */
export const ROW_LIMITS = {
  topPriorities: 3,
  callsEmails: 4,
  personalTodo: 4,
  dailySchedules: 4,
  tasks: 8,
  appointments: 4,
} as const;
export const ROW_TEXT_MAX = 100;
export const MANAGER_NOTE_MAX = 600;

export const SECTION_LABELS: Record<keyof typeof ROW_LIMITS, string> = {
  topPriorities: "Top Priorities",
  callsEmails: "Communications",
  personalTodo: "Personal To Do List",
  dailySchedules: "Daily Schedules",
  tasks: "To Do List",
  appointments: "Appointments",
};

/** Communications replace the old Calls / Emails list and reuse its JSON column (callsEmails). */
export const COMMUNICATION_TYPES = ["CALL", "EMAIL", "DIRECT_MEETING"] as const;
export type CommunicationType = (typeof COMMUNICATION_TYPES)[number];
export const COMMUNICATION_LABELS: Record<CommunicationType, string> = {
  CALL: "Call",
  EMAIL: "Email",
  DIRECT_MEETING: "Direct Meeting",
};

const text = z.string().trim().max(ROW_TEXT_MAX, `Text is too long (${ROW_TEXT_MAX} characters max).`);
const hours = z
  .number("Hours must be a number.")
  .min(0, "Hours cannot be negative.")
  .max(24, "Hours cannot exceed 24.")
  .nullable();
const rating = z.number().int().min(1, "Ratings are 1–5.").max(5, "Ratings are 1–5.").nullable();
const list = <T extends z.ZodType>(item: T, section: keyof typeof ROW_LIMITS) =>
  z.array(item).max(ROW_LIMITS[section], `${SECTION_LABELS[section]}: at most ${ROW_LIMITS[section]} rows.`);

const checkItem = z.object({ text, done: z.boolean() });
const scheduleItem = z.object({ time: time.or(z.literal("")), text });
const taskItem = z.object({ text, done: z.boolean(), planned: hours, worked: hours });
// time is optional so appointments saved before it existed stay valid.
const appointmentItem = z.object({ text, done: z.boolean(), time: time.or(z.literal("")).optional() });
// Rows saved as the old Calls / Emails list have no type (and a done flag, kept as-is).
const communicationItem = z.object({
  type: z.enum(COMMUNICATION_TYPES).or(z.literal("")).optional(),
  text,
  done: z.boolean().optional(),
});

export type CheckItem = z.infer<typeof checkItem>;
export type ScheduleItem = z.infer<typeof scheduleItem>;
export type TaskItem = z.infer<typeof taskItem>;
export type AppointmentItem = z.infer<typeof appointmentItem>;
export type CommunicationItem = z.infer<typeof communicationItem>;

export const reportContentSchema = z
  .object({
    topPriorities: list(checkItem, "topPriorities"),
    callsEmails: list(communicationItem, "callsEmails"),
    personalTodo: list(checkItem, "personalTodo"),
    dailySchedules: list(scheduleItem, "dailySchedules"),
    officeIn: time.nullable(),
    officeOut: time.nullable(),
    breakMinutes: z
      .number("Break must be a number of minutes.")
      .int("Break must be whole minutes.")
      .min(0, "Break cannot be negative.")
      .max(720, "Break cannot exceed 12 hours.")
      .nullable(),
    productivity: rating,
    mood: rating,
    health: rating,
    tasks: list(taskItem, "tasks"),
    appointments: list(appointmentItem, "appointments"),
  })
  .superRefine((v, ctx) => {
    const { error } = calcNetOfficeHours(v.officeIn, v.officeOut, v.breakMinutes);
    if (error) ctx.addIssue({ code: "custom", path: ["officeOut"], message: error });
    // A written communication must say what kind it is.
    v.callsEmails.forEach((c, i) => {
      if (c.text !== "" && !c.type) {
        ctx.addIssue({ code: "custom", path: ["callsEmails", i, "type"], message: "Choose Call, Email or Direct Meeting." });
      }
    });
  });

export type ReportContent = z.infer<typeof reportContentSchema>;

export const saveReportSchema = z.object({
  reportDate: isoDateSchema,
  action: z.enum(["draft", "submit"]),
  content: reportContentSchema,
});

export const reviewSchema = z.object({
  managerNote: z
    .string()
    .trim()
    .max(MANAGER_NOTE_MAX, `Manager note is too long (${MANAGER_NOTE_MAX} characters max).`)
    .transform((v) => v || null)
    .nullable(),
  performanceIndex: rating,
});

/** First human-readable message from a Zod error. */
export function firstError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Invalid input.";
}
