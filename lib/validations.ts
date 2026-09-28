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
const text = z.string().trim().max(500, "Text is too long (500 characters max).");
const hours = z
  .number("Hours must be a number.")
  .min(0, "Hours cannot be negative.")
  .max(24, "Hours cannot exceed 24.")
  .nullable();
const rating = z.number().int().min(1, "Ratings are 1–5.").max(5, "Ratings are 1–5.").nullable();
const list = <T extends z.ZodType>(item: T) => z.array(item).max(50, "A list can have at most 50 rows.");

const checkItem = z.object({ text, done: z.boolean() });
const scheduleItem = z.object({ time: time.or(z.literal("")), text });
const taskItem = z.object({ text, done: z.boolean(), planned: hours, worked: hours });

export type CheckItem = z.infer<typeof checkItem>;
export type ScheduleItem = z.infer<typeof scheduleItem>;
export type TaskItem = z.infer<typeof taskItem>;

export const reportContentSchema = z
  .object({
    topPriorities: list(checkItem),
    callsEmails: list(checkItem),
    personalTodo: list(checkItem),
    dailySchedules: list(scheduleItem),
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
    tasks: list(taskItem),
    appointments: list(checkItem),
  })
  .superRefine((v, ctx) => {
    const { error } = calcNetOfficeHours(v.officeIn, v.officeOut, v.breakMinutes);
    if (error) ctx.addIssue({ code: "custom", path: ["officeOut"], message: error });
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
    .max(2000, "Manager note is too long (2000 characters max).")
    .transform((v) => v || null)
    .nullable(),
  performanceIndex: rating,
});

/** First human-readable message from a Zod error. */
export function firstError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Invalid input.";
}
