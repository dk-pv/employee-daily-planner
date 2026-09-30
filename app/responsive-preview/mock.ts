// TEMPORARY: mock data for the responsive-verification preview routes. Delete this folder before committing.
import type { PlannerReport } from "@/lib/reports";

const tasks: [string, boolean, number | null, number | null][] = [
  ["Build the responsive planner layout for phones and tablets", true, 3, 3.5],
  ["Code review: authentication pull request from the backend team", true, 1, 1.25],
  ["Fix the print layout bug reported by HR (manager note overflowing onto a second page)", false, 1.5, 2],
  ["Write unit tests for the office-hours calculator", false, 1, 0.5],
  ["Sprint planning", true, 1, 1],
  ["Update the README deployment section", false, 0.5, null],
  ["Investigate slow admin reports query", false, 2, 1],
  ["Pair with the intern on React Hook Form field arrays", true, 1, 1.5],
  ["Reply to design feedback", false, 0.25, 0.25],
  ["Prepare demo for Friday", false, 1, null],
  ["", false, null, null],
  ["", false, null, null],
  ["", false, null, null],
  ["", false, null, null],
  ["", false, null, null],
  ["", false, null, null],
  ["", false, null, null],
  ["", false, null, null],
];

export const filledReport: PlannerReport = {
  id: "preview-report",
  reportDate: "2026-09-30",
  status: "DRAFT",
  submittedAt: null,
  updatedAt: "2026-09-30T11:34:00.000Z",
  editableUntil: "2026-10-07",
  content: {
    jobRole: "Senior Frontend Developer",
    topPriorities: [
      { text: "Ship the responsive planner for tablets and phones", done: true },
      { text: "Review the Q4 sprint backlog with the product team", done: false },
      { text: "Fix the print layout bug reported by HR", done: false },
    ],
    callsEmails: [
      { type: "CALL", text: "Client call with Acme about the invoice", done: true },
      { type: "EMAIL", text: "Send weekly status report to the manager", done: false },
      { type: "DIRECT_MEETING", text: "Design review with the UX team at 3 PM", done: false },
      { type: "CALL", text: "Follow up with vendor on the new laptops", done: false },
    ],
    personalTodo: [
      { text: "Pay electricity bill", done: true },
      { text: "Book dentist appointment for Saturday morning", done: false },
      { text: "Pick up groceries on the way home", done: false },
      { text: "Call mom", done: true },
      { text: "Renew gym membership", done: false },
      { text: "Read two chapters of the design systems book", done: false },
    ],
    dailySchedules: [
      { time: "09:30", text: "Daily stand-up with the development team" },
      { time: "11:00", text: "Sprint planning" },
      { time: "13:30", text: "Lunch with the new joiners" },
      { time: "15:00", text: "Design review meeting" },
      { time: "17:45", text: "Code review and production deploy" },
    ],
    tasks: tasks.map(([text, done, planned, worked]) => ({ text, done, planned, worked })),
    officeIn: "09:15",
    officeOut: "18:40",
    breakMinutes: 30,
    break2Minutes: 15,
    break3Minutes: 10,
    break1Reason: "Lunch",
    break2Reason: "Tea break",
    break3Reason: "Walk",
    productivity: 4,
    mood: 5,
    health: 3,
  },
  netOfficeHours: 8.58,
  totalPlannedHours: 12.25,
  totalWorkedHours: 11,
  review: {
    managerNote:
      "Great progress on the responsive layout — the phone view is much easier to use. Please prioritise the print bug tomorrow, " +
      "HR needs it before the monthly audit. Keep the task list realistic: 12 planned hours in a 9-hour day is too many. " +
      "Good job pairing with the intern.",
    performanceIndex: 4,
    reviewedAt: "2026-09-30T13:05:00.000Z",
  },
};

export const employee = { name: "Priya Raghavendran", department: "DEVELOPMENT" };

export const users = [
  ["u-admin", "Administrator", "admin@company.local", "ADMIN", null, true],
  ["u-1", "Priya Raghavendran", "priya.raghavendran@company.local", "STAFF", "DEVELOPMENT", true],
  ["u-2", "Mohammed Abdul Rahman Kunjumuhammed", "mohammed.abdulrahman.kunjumuhammed@company.local", "STAFF", "SALES", false],
  ["u-3", "Anjali Menon", "anjali@company.local", "STAFF", "MARKETING", true],
  ["u-4", "Rahul Nair", "rahul.nair@company.local", "STAFF", "HR", true],
  ["u-5", "Sneha Thomas", "sneha.thomas@company.local", "STAFF", "ACCOUNTS", true],
  ["u-6", "Arjun Das", "arjun.das@company.local", "STAFF", "STUDENTS", false],
  ["u-7", "Second Admin", "ops-admin@company.local", "ADMIN", null, true],
].map(([id, name, email, role, department, isActive]) => ({
  id: id as string,
  name: name as string,
  email: email as string,
  role: role as "STAFF" | "ADMIN",
  department: department as "DEVELOPMENT" | null,
  isActive: isActive as boolean,
  createdAt: "2026-09-28T09:12:00.000Z",
}));
