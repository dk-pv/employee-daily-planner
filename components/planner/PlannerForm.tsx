"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { Alert, btnPrimary, btnSecondary, ReportStatusBadge } from "@/components/ui/ui";
import type { PlannerReport } from "@/lib/reports";
import { departmentLabel, formatDate, formatDateTime, isValidISODate } from "@/lib/utils";
import { reportContentSchema, type ReportContent } from "@/lib/validations";
import { CheckList, OfficeHours, ScheduleList, Scale, Section, TaskTable, type FormValues } from "./parts";

// Blank rows shown on a fresh sheet, like the printed planner. Users add more as needed.
const MIN_ROWS = { topPriorities: 4, callsEmails: 4, personalTodo: 4, appointments: 3, dailySchedules: 6, tasks: 6 };

function pad<T>(rows: T[], min: number, blank: () => T) {
  return [...rows, ...Array.from({ length: Math.max(0, min - rows.length) }, blank)];
}

function toFormValues(c: ReportContent | null): FormValues {
  const check = () => ({ text: "", done: false });
  return {
    topPriorities: pad(c?.topPriorities ?? [], MIN_ROWS.topPriorities, check),
    callsEmails: pad(c?.callsEmails ?? [], MIN_ROWS.callsEmails, check),
    personalTodo: pad(c?.personalTodo ?? [], MIN_ROWS.personalTodo, check),
    appointments: pad(c?.appointments ?? [], MIN_ROWS.appointments, check),
    dailySchedules: pad(c?.dailySchedules ?? [], MIN_ROWS.dailySchedules, () => ({ time: "", text: "" })),
    tasks: pad(
      (c?.tasks ?? []).map((t) => ({ ...t, planned: t.planned?.toString() ?? "", worked: t.worked?.toString() ?? "" })),
      MIN_ROWS.tasks,
      () => ({ text: "", done: false, planned: "", worked: "" }),
    ),
    officeIn: c?.officeIn ?? "",
    officeOut: c?.officeOut ?? "",
    breakMinutes: c?.breakMinutes?.toString() ?? "",
    productivity: c?.productivity ?? null,
    mood: c?.mood ?? null,
    health: c?.health ?? null,
  };
}

const num = (s: string) => (s.trim() === "" ? null : Number(s));

function toContent(v: FormValues): ReportContent {
  return {
    ...v,
    tasks: v.tasks.map((t) => ({ text: t.text, done: t.done, planned: num(t.planned), worked: num(t.worked) })),
    officeIn: v.officeIn || null,
    officeOut: v.officeOut || null,
    breakMinutes: num(v.breakMinutes),
  };
}

const SECTION_NAMES: Record<string, string> = {
  topPriorities: "Top Priorities",
  callsEmails: "Calls / Emails",
  personalTodo: "Personal To Do List",
  appointments: "Appointments",
  dailySchedules: "Daily Schedules",
  tasks: "To Do List",
  officeIn: "Office Hours",
  officeOut: "Office Hours",
  breakMinutes: "Office Hours",
  productivity: "Productivity",
  mood: "Mood",
  health: "Health",
};

function describeIssue(error: z.ZodError) {
  const issue = error.issues[0];
  const [key, row] = issue.path;
  const where = SECTION_NAMES[String(key)];
  const rowText = typeof row === "number" ? `, row ${row + 1}` : "";
  return where ? `${where}${rowText}: ${issue.message}` : issue.message;
}

type Notice = { tone: "success" | "error"; text: string } | null;

type Props = {
  mode: "staff" | "admin";
  employee: { name: string; department: string | null };
  date: string;
  report: PlannerReport | null;
  /** Staff only: why the report cannot be edited (edit window over / too far ahead). */
  lockReason: string | null;
  timeZone: string;
};

export function PlannerForm({ mode, employee, date, report: initialReport, lockReason, timeZone }: Props) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [report, setReport] = useState(initialReport);
  const isAdmin = mode === "admin";
  const readOnly = isAdmin || lockReason !== null;
  const submitted = report?.status === "SUBMITTED";
  // Drafts autosave; a submitted report changes only when the employee clicks Update.
  const autosave = !readOnly && !submitted;

  const { control, register, getValues, subscribe } = useForm<FormValues>({
    defaultValues: toFormValues(initialReport?.content ?? null),
  });

  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [unsaved, setUnsaved] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [dateInput, setDateInput] = useState(date);

  const version = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  /** Saves are queued so they never overlap; each one sends the latest form values. */
  const save = useCallback(
    (action: "draft" | "submit", announce = action === "submit") => {
      const run = async (): Promise<boolean> => {
        const startVersion = version.current;
        const content = toContent(getValues());
        const check = reportContentSchema.safeParse(content);
        if (!check.success) {
          setSaveState("error");
          setNotice({ tone: "error", text: describeIssue(check.error) });
          return false;
        }
        setSaveState("saving");
        try {
          const res = await fetch("/api/reports", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reportDate: date, action, content }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error ?? "Save failed. Please try again.");
          setReport(body.report);
          setSaveState("saved");
          if (version.current === startVersion) setUnsaved(false);
          if (announce) setNotice({ tone: "success", text: body.message });
          else setNotice((prev) => (prev?.tone === "error" ? null : prev));
          return true;
        } catch (e) {
          setSaveState("error");
          const message =
            e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Network error — your changes are not saved yet.";
          setNotice({ tone: "error", text: message });
          return false;
        }
      };
      const result = queue.current.then(run);
      queue.current = result.catch(() => undefined);
      return result;
    },
    [date, getValues],
  );

  // Track edits; debounce an autosave for drafts.
  const markChanged = useCallback(() => {
    version.current += 1;
    setUnsaved(true);
    if (autosave) {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void save("draft"), 1500);
    }
  }, [autosave, save]);

  useEffect(() => {
    if (readOnly) return;
    const unsubscribe = subscribe({ formState: { values: true }, callback: markChanged });
    return () => {
      unsubscribe();
      clearTimeout(timer.current);
    };
  }, [subscribe, readOnly, markChanged]);

  // ---- Admin review (Manager Note + Performance Index) ----
  const [managerNote, setManagerNote] = useState(initialReport?.managerNote ?? "");
  const [performance, setPerformance] = useState<number | null>(initialReport?.performanceIndex ?? null);
  const [reviewSaving, setReviewSaving] = useState(false);
  const reviewDirty =
    isAdmin && (managerNote.trim() !== (report?.managerNote ?? "") || performance !== (report?.performanceIndex ?? null));

  async function saveReview() {
    if (!report) return;
    setReviewSaving(true);
    try {
      const res = await fetch(`/api/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managerNote, performanceIndex: performance }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not save the review.");
      setReport(body.report);
      setManagerNote(body.report.managerNote ?? "");
      setNotice({ tone: "success", text: body.message });
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof Error ? e.message : "Could not save the review." });
    } finally {
      setReviewSaving(false);
    }
  }

  // Warn before leaving with unsaved work.
  const leaveWarning = unsaved || reviewDirty;
  useEffect(() => {
    if (!leaveWarning) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [leaveWarning]);

  async function onDateChange(next: string) {
    setDateInput(next);
    // Ignore partial values while the year is still being typed.
    if (!isValidISODate(next) || next < "2000-01-01" || next === date) return;
    if (unsaved) {
      clearTimeout(timer.current);
      const saved = autosave ? await save("draft") : false;
      if (!saved && !window.confirm("Your latest changes are not saved. Switch date and discard them?")) {
        setDateInput(date);
        return;
      }
    }
    startNavigation(() => router.push(`/?date=${next}`));
  }

  async function onSubmit() {
    clearTimeout(timer.current);
    await save("submit");
  }

  const saveLabel =
    saveState === "saving"
      ? "Saving…"
      : saveState === "error"
        ? "Save failed"
        : unsaved
          ? "Unsaved changes"
          : saveState === "saved"
            ? "Saved"
            : null;

  return (
    <div className="mx-auto w-full max-w-[820px] px-4 pb-28 pt-4 sm:px-6 print:max-w-none print:p-0">
      <div className="mb-3 space-y-2 print:hidden">
        {!isAdmin && lockReason && (
          <Alert tone="warning">{report ? lockReason : `No report found for this date. ${lockReason}`}</Alert>
        )}
        {!isAdmin && !lockReason && !report && (
          <Alert>New report — nothing has been saved for {formatDate(date)} yet. Rows are optional; fill in what applies.</Alert>
        )}
      </div>

      <article
        aria-busy={navigating}
        className={`rounded-sm bg-white p-4 shadow-sm ring-1 ring-neutral-200 transition-opacity sm:p-7 print:p-0 print:shadow-none print:ring-0 ${
          navigating ? "opacity-50" : ""
        }`}
      >
        <header className="mb-4 print:mb-2">
          <h1 className="text-center text-2xl font-extrabold tracking-[0.3em] text-neutral-900 sm:text-3xl print:text-xl">
            DAILY PLANNER
          </h1>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1.3fr_1fr_1fr] print:mt-2 print:grid-cols-[1.3fr_1fr_1fr]">
            <HeaderField label="EMPLOYEE">{employee.name}</HeaderField>
            <HeaderField label="DEPARTMENT">{departmentLabel(employee.department)}</HeaderField>
            <HeaderField label="DATE">
              {isAdmin ? (
                formatDate(date)
              ) : (
                <>
                  <input
                    type="date"
                    required
                    value={dateInput}
                    onChange={(e) => void onDateChange(e.target.value)}
                    aria-label="Report date"
                    className="w-full min-w-0 bg-transparent text-sm font-medium focus:outline-none print:hidden"
                  />
                  <span className="hidden print:inline">{formatDate(date)}</span>
                </>
              )}
            </HeaderField>
          </div>
        </header>

        <div className="grid gap-3 md:grid-cols-[34%_minmax(0,1fr)] print:grid-cols-[34%_minmax(0,1fr)] print:gap-2">
          <div className="flex min-w-0 flex-col gap-3 print:gap-2">
            <Section title="TOP PRIORITIES" disabled={readOnly}>
              <CheckList
                {...{ control, register, readOnly }}
                onRowsChange={markChanged}
                name="topPriorities"
                itemLabel="Priority"
                addLabel="Add Priority"
                numbered
              />
            </Section>
            <Section title="CALLS / EMAILS" disabled={readOnly}>
              <CheckList
                {...{ control, register, readOnly }}
                onRowsChange={markChanged}
                name="callsEmails"
                itemLabel="Call / email"
                addLabel="Add Call / Email"
              />
            </Section>
            <Section title="PERSONAL TO DO LIST" disabled={readOnly}>
              <CheckList
                {...{ control, register, readOnly }}
                onRowsChange={markChanged}
                name="personalTodo"
                itemLabel="To-do"
                addLabel="Add To Do"
              />
            </Section>
            <Section title="DAILY SCHEDULES" disabled={readOnly} className="flex-1">
              <ScheduleList {...{ control, register, readOnly }} onRowsChange={markChanged} />
            </Section>
          </div>

          <div className="flex min-w-0 flex-col gap-3 print:gap-2">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] print:grid-cols-2 print:gap-2">
              <Section title="OFFICE HOURS TRACKER" disabled={readOnly}>
                <OfficeHours control={control} register={register} />
              </Section>
              <Section title="HOW WILL YOU RATE YOUR DAY?" disabled={readOnly}>
                <div className="space-y-1.5 print:space-y-1">
                  {(["productivity", "mood", "health"] as const).map((key) => (
                    <div key={key} className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold tracking-[0.1em] print:text-[8.5px]">{key.toUpperCase()}</span>
                      <Controller
                        control={control}
                        name={key}
                        render={({ field }) => <Scale label={SECTION_NAMES[key]} value={field.value} onChange={field.onChange} />}
                      />
                    </div>
                  ))}
                </div>
              </Section>
            </div>

            <Section title="TO DO LIST — TASK + PLANNED HOURS + WORKED HOURS" disabled={readOnly}>
              <TaskTable {...{ control, register, readOnly }} onRowsChange={markChanged} />
            </Section>

            <Section title="APPOINTMENTS" disabled={readOnly}>
              <CheckList
                {...{ control, register, readOnly }}
                onRowsChange={markChanged}
                name="appointments"
                itemLabel="Appointment"
                addLabel="Add Appointment"
                round
              />
            </Section>

            <Section title="MANAGER NOTE" disabled={!isAdmin}>
              {isAdmin ? (
                <>
                  <textarea
                    value={managerNote}
                    onChange={(e) => setManagerNote(e.target.value)}
                    maxLength={2000}
                    rows={4}
                    aria-label="Manager note"
                    placeholder="Add feedback for the employee…"
                    className={`${ruled} w-full resize-y border-0 px-0.5 focus:outline-none print:hidden`}
                  />
                  <p className={`${ruled} hidden whitespace-pre-wrap print:block`}>{managerNote}</p>
                </>
              ) : (
                <p className={`${ruled} min-h-24 whitespace-pre-wrap px-0.5 print:min-h-12`}>
                  {report?.managerNote || (
                    <span className="text-neutral-400 print:hidden">Your manager has not added a note yet.</span>
                  )}
                </p>
              )}
            </Section>

            <Section title="PERFORMANCE INDEX" disabled={!isAdmin}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Scale
                  label="Performance index"
                  value={isAdmin ? performance : (report?.performanceIndex ?? null)}
                  onChange={setPerformance}
                  size="lg"
                />
                <span className="text-xs text-neutral-500 print:hidden">
                  {isAdmin ? "Set by manager" : "Set by your manager after review"}
                </span>
              </div>
            </Section>
          </div>
        </div>
      </article>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-neutral-200 bg-white/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[820px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {/* Messages live in the fixed bar so they are seen wherever the user has scrolled. */}
            {notice && (
              <p
                role={notice.tone === "error" ? "alert" : "status"}
                className={`text-sm font-medium ${notice.tone === "error" ? "text-red-700" : "text-emerald-700"}`}
              >
                {notice.text}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600" aria-live="polite">
              <ReportStatusBadge status={report?.status ?? null} />
              {report && <span>Last updated: {formatDateTime(report.updatedAt, timeZone)}</span>}
              {!isAdmin && report && !lockReason && <span>Editable until {formatDate(report.editableUntil)}</span>}
              {isAdmin && report?.reviewedAt && <span>Reviewed: {formatDateTime(report.reviewedAt, timeZone)}</span>}
              {!readOnly && saveLabel && (
                <span className={saveState === "error" ? "font-medium text-red-700" : "text-neutral-500"}>{saveLabel}</span>
              )}
              {navigating && <span>Loading…</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => window.print()} className={btnSecondary}>
              Print
            </button>
            {!readOnly && !submitted && (
              <button
                type="button"
                onClick={() => void save("draft", true)}
                disabled={saveState === "saving"}
                className={btnSecondary}
              >
                Save Draft
              </button>
            )}
            {!readOnly && (
              <button type="button" onClick={() => void onSubmit()} disabled={saveState === "saving"} className={btnPrimary}>
                {submitted ? "UPDATE DAILY REPORT" : "SUBMIT DAILY REPORT"}
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={() => void saveReview()}
                disabled={!reviewDirty || reviewSaving}
                className={btnPrimary}
              >
                {reviewSaving ? "Saving…" : "Save Review"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Ruled "paper" lines behind note text.
const ruled =
  "bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_23px,#d4d4d4_23px,#d4d4d4_24px)] text-[13px] leading-6 print:text-[10.5px]";

function HeaderField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-end gap-2 border-b border-neutral-800 pb-1">
      <span className="shrink-0 text-[10px] font-bold tracking-[0.14em] text-neutral-600 print:text-[8.5px]">{label}:</span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900 print:text-[11px]">{children}</span>
    </div>
  );
}
