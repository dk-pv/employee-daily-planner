"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { Alert, btnPrimary, btnSecondary, ReportStatusBadge } from "@/components/ui/ui";
import type { PlannerReport } from "@/lib/reports";
import { departmentLabel, formatDate, formatDateTime, isValidISODate } from "@/lib/utils";
import {
  COMMUNICATION_TYPES,
  MANAGER_NOTE_MAX,
  reportContentSchema,
  JOB_ROLE_MAX,
  ROW_LIMITS,
  SECTION_LABELS,
  type ReportContent,
} from "@/lib/validations";
import {
  CheckList,
  CommunicationsTable,
  OfficeHours,
  ScheduleList,
  Scale,
  Section,
  TaskTable,
  type CommunicationRow,
  type FormValues,
} from "./parts";

// Every section shows all its writing lines, like the paper planner; Communications starts with
// one Call, one Email and one Direct Meeting row and can add one more.
const START_ROWS = { ...ROW_LIMITS, callsEmails: 3 };

function pad<T>(rows: T[], min: number, blank: () => T) {
  return [...rows, ...Array.from({ length: Math.max(0, min - rows.length) }, blank)];
}

/** Saved communications first, then blank rows for the types not used yet. */
function communicationRows(saved: ReportContent["callsEmails"]): CommunicationRow[] {
  // Rows saved as the old Calls / Emails list have no type: shown as "Choose type…", nothing is guessed.
  const rows: CommunicationRow[] = saved.map((c) => ({ type: c.type ?? "", text: c.text, done: c.done ?? false }));
  for (const type of COMMUNICATION_TYPES) {
    if (rows.length < START_ROWS.callsEmails && !rows.some((r) => r.type === type)) rows.push({ type, text: "", done: false });
  }
  return rows;
}

function toFormValues(c: ReportContent | null): FormValues {
  const check = () => ({ text: "", done: false });
  return {
    jobRole: c?.jobRole ?? "",
    topPriorities: pad(c?.topPriorities ?? [], START_ROWS.topPriorities, check),
    callsEmails: communicationRows(c?.callsEmails ?? []),
    personalTodo: pad(c?.personalTodo ?? [], START_ROWS.personalTodo, check),
    dailySchedules: pad(c?.dailySchedules ?? [], START_ROWS.dailySchedules, () => ({ time: "", text: "" })),
    tasks: pad(
      (c?.tasks ?? []).map((t) => ({ ...t, planned: t.planned?.toString() ?? "", worked: t.worked?.toString() ?? "" })),
      START_ROWS.tasks,
      () => ({ text: "", done: false, planned: "", worked: "" }),
    ),
    officeIn: c?.officeIn ?? "",
    officeOut: c?.officeOut ?? "",
    breakMinutes: c?.breakMinutes?.toString() ?? "",
    break2Minutes: c?.break2Minutes?.toString() ?? "",
    break3Minutes: c?.break3Minutes?.toString() ?? "",
    break1Reason: c?.break1Reason ?? "",
    break2Reason: c?.break2Reason ?? "",
    break3Reason: c?.break3Reason ?? "",
    productivity: c?.productivity ?? null,
    mood: c?.mood ?? null,
    health: c?.health ?? null,
  };
}

const num = (s: string) => (s.trim() === "" ? null : Number(s));

function toContent(v: FormValues): ReportContent {
  return {
    ...v,
    jobRole: v.jobRole.trim(),
    tasks: v.tasks.map((t) => ({ text: t.text, done: t.done, planned: num(t.planned), worked: num(t.worked) })),
    officeIn: v.officeIn || null,
    officeOut: v.officeOut || null,
    breakMinutes: num(v.breakMinutes),
    break2Minutes: num(v.break2Minutes),
    break3Minutes: num(v.break3Minutes),
    break1Reason: v.break1Reason.trim() || null,
    break2Reason: v.break2Reason.trim() || null,
    break3Reason: v.break3Reason.trim() || null,
  };
}

const SECTION_NAMES: Record<string, string> = {
  ...SECTION_LABELS,
  jobRole: "Job role",
  officeIn: "Office Hours",
  officeOut: "Office Hours",
  breakMinutes: "Office Hours",
  break2Minutes: "Office Hours",
  break3Minutes: "Office Hours",
  break1Reason: "Office Hours",
  break2Reason: "Office Hours",
  break3Reason: "Office Hours",
  productivity: "Productivity",
  mood: "Mood",
  health: "Health",
};

function describeIssue(error: z.ZodError) {
  const issue = error.issues[0];
  const [key, row] = issue.path;
  const where = SECTION_NAMES[String(key)];
  if (!where || issue.message.startsWith(where)) return issue.message;
  const rowText = typeof row === "number" ? `, row ${row + 1}` : "";
  return `${where}${rowText}: ${issue.message}`;
}

/** Sections holding more rows than the A4 sheet allows (only possible for reports saved before the limits). */
function rowsOverLimit(c: ReportContent | null) {
  if (!c) return [];
  return (Object.keys(ROW_LIMITS) as (keyof typeof ROW_LIMITS)[])
    .filter((key) => c[key].length > ROW_LIMITS[key])
    .map((key) => `${SECTION_LABELS[key]} ${c[key].length}/${ROW_LIMITS[key]}`);
}

type Notice = { tone: "success" | "error"; text: string } | null;

type Props = {
  /** "print": the admin print page — read-only, the A4 sheet only (no notices or action bar). */
  mode: "staff" | "admin" | "print";
  employee: { name: string; department: string | null };
  date: string;
  report: PlannerReport | null;
  /** Staff only: why the report cannot be edited (edit window over / too far ahead). */
  lockReason: string | null;
  /** Staff only: dates of the employee's other unsubmitted drafts that can still be edited, newest first. */
  drafts?: string[];
  timeZone: string;
};

export function PlannerForm({ mode, employee, date, report: initialReport, lockReason, drafts = [], timeZone }: Props) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [report, setReport] = useState(initialReport);
  const isAdmin = mode === "admin";
  const printOnly = mode === "print";
  const readOnly = mode !== "staff" || lockReason !== null;
  const submitted = report?.status === "SUBMITTED";
  // Drafts autosave; a submitted report changes only when the employee clicks Update.
  const autosave = !readOnly && !submitted;
  // Follows the saved report, so the warning clears once a trimmed version has been saved.
  const overLimit = rowsOverLimit(report?.content ?? null);

  const { control, register, getValues, setFocus, subscribe } = useForm<FormValues>({
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
          const jobRoleOnly = check.error.issues.every((i) => i.path[0] === "jobRole");
          // Autosave waits quietly for the required Job Role (the unsaved-changes guard still protects the work);
          // Save Draft and Submit say what is missing.
          if (!announce && jobRoleOnly) return false;
          setSaveState("error");
          setNotice({ tone: "error", text: describeIssue(check.error) });
          if (check.error.issues[0]?.path[0] === "jobRole") setFocus("jobRole");
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
    [date, getValues, setFocus],
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

  // ---- Review (Manager Note + Performance Index): the admin edits it, staff see it read-only ----
  const canReview = isAdmin && report != null;
  const [managerNote, setManagerNote] = useState(initialReport?.review?.managerNote ?? "");
  const [performance, setPerformance] = useState<number | null>(initialReport?.review?.performanceIndex ?? null);
  const [reviewSaving, setReviewSaving] = useState(false);
  const reviewDirty =
    isAdmin &&
    (managerNote.trim() !== (report?.review?.managerNote ?? "") || performance !== (report?.review?.performanceIndex ?? null));

  async function saveReview() {
    if (!report) return;
    setReviewSaving(true);
    const sent = managerNote;
    try {
      const res = await fetch(`/api/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managerNote: sent, performanceIndex: performance }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not save the review.");
      setReport(body.report);
      // Keep anything typed while the save was in flight.
      setManagerNote((current) => (current === sent ? (body.report.review?.managerNote ?? "") : current));
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

  const lists = { control, register, readOnly, onRowsChange: markChanged };

  return (
    <>
      <div className={`mx-auto w-full max-w-[948px] px-4 pt-4 sm:px-6 print:max-w-none print:p-0 ${printOnly ? "pb-4" : "pb-6"}`}>
        <div className={`mb-3 space-y-2 print:hidden ${printOnly ? "hidden" : ""}`}>
          {isAdmin && <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">Staff report · read-only</p>}
          {!isAdmin && lockReason && (
            <Alert tone="warning">{report ? lockReason : `No report found for this date. ${lockReason}`}</Alert>
          )}
          {!isAdmin && !lockReason && !report && (
            <Alert>New report — nothing has been saved for {formatDate(date)} yet. Rows are optional; fill in what applies.</Alert>
          )}
          {!isAdmin && drafts.length > 0 && (
            <Alert tone="warning">
              <p className="font-medium">Unsubmitted drafts</p>
              <ul className="mt-1 space-y-0.5">
                {drafts.map((d) => (
                  <li key={d} className="flex flex-wrap items-center gap-x-3">
                    <span>{formatDate(d)} — Draft</span>
                    {/* Same path as the date picker: unsaved work is saved (or confirmed) before switching. */}
                    <button
                      type="button"
                      onClick={() => void onDateChange(d)}
                      disabled={navigating}
                      className="font-medium underline underline-offset-2 hover:no-underline disabled:opacity-50 compact:min-h-10"
                    >
                      Open Draft
                    </button>
                  </li>
                ))}
              </ul>
            </Alert>
          )}
          {!readOnly && overLimit.length > 0 && (
            <Alert tone="warning">
              This report was started before the one-page limits and has more rows than the A4 planner allows ({overLimit.join(", ")}).
              Nothing has been removed — delete the extra rows you no longer need, then it can be saved.
            </Alert>
          )}
        </div>

        {/* The A4 sheet: a fixed page on desktop (sizes in globals.css) and exactly one printed page; below 1024px a one-column form, edge to edge on phones. */}
        <article
          aria-busy={navigating}
          className={`a4-sheet mx-auto flex flex-col bg-white px-7 pb-7 pt-6 shadow-sm ring-1 ring-neutral-300 transition-opacity print:shadow-none print:ring-0 phone:-mx-4 phone:px-3 phone:pb-4 phone:pt-5 ${
            navigating ? "opacity-50" : ""
          }`}
        >
          <header className="print:mb-0.5">
            <h1 className="text-center text-[26px] font-extrabold tracking-[0.02em] text-neutral-900 print:text-[19px] phone:text-[22px]">
              DAILY PLANNER
            </h1>
            <div className="mt-2 border-t-[1.5px] border-neutral-900 print:mt-1" />
            {/* Two rows — EMPLOYEE | JOB ROLE, then DEPARTMENT | DATE — with fixed label widths so the values line up. */}
            <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2.5 print:mt-2 print:gap-x-6 print:gap-y-1.5 compact:gap-y-3 phone:grid-cols-1">
              <HeaderField label="EMPLOYEE" labelClass={HEADER_LABEL_LEFT}>
                {employee.name}
              </HeaderField>
              <HeaderField label="JOB ROLE" labelClass={HEADER_LABEL_RIGHT} htmlFor={readOnly ? undefined : "job-role"} required={!readOnly}>
                {readOnly ? (
                  report?.content.jobRole || "—"
                ) : (
                  <input
                    id="job-role"
                    {...register("jobRole")}
                    required
                    maxLength={JOB_ROLE_MAX}
                    placeholder="Ex: Videographer, Developer ..."
                    className="w-full min-w-0 bg-transparent placeholder:font-normal placeholder:text-neutral-400 focus:outline-none print:placeholder:text-transparent"
                  />
                )}
              </HeaderField>
              <HeaderField label="DEPARTMENT" labelClass={HEADER_LABEL_LEFT}>
                {departmentLabel(employee.department)}
              </HeaderField>
              <HeaderField label="DATE" labelClass={HEADER_LABEL_RIGHT}>
                {mode !== "staff" ? (
                  formatDate(date)
                ) : (
                  <>
                    <input
                      type="date"
                      required
                      value={dateInput}
                      onChange={(e) => void onDateChange(e.target.value)}
                      aria-label="Report date"
                      className="w-full min-w-0 bg-transparent text-[13.5px] font-medium focus:outline-none print:hidden compact:text-base"
                    />
                    <span className="hidden print:inline">{formatDate(date)}</span>
                  </>
                )}
              </HeaderField>
            </div>
          </header>

          {/* Column widths and section order follow the A4 reference: left 33.6%, gap 2.5%, right the rest. Below 1024px: one column, left then right. */}
          <div className="mt-5 grid min-h-0 flex-1 grid-cols-[33.6%_minmax(0,1fr)] gap-x-[2.5%] print:mt-3 compact:grid-cols-1 compact:gap-y-4">
            <div className="flex min-w-0 flex-col gap-3 print:gap-1.5 compact:gap-4">
              <CheckList {...lists} name="topPriorities" title="TOP PRIORITIES" itemLabel="Priority" className="grow-[2]" />
              <CommunicationsTable {...lists} className="grow-[3]" />
              <CheckList {...lists} name="personalTodo" title="PERSONAL TO DO LIST" itemLabel="To-do" className="grow" />
              <ScheduleList {...lists} className="grow" />
              <Section title="HOW WILL YOU RATE YOUR DAY?" disabled={readOnly}>
                <div className="space-y-1 print:space-y-1 compact:space-y-2">
                  {(["productivity", "mood", "health"] as const).map((key) => (
                    <div key={key} className="flex items-center justify-between gap-2 compact:justify-start phone:justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-[0.04em] print:text-[8px] compact:w-32 compact:text-xs phone:w-auto">
                        {key}
                      </span>
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

            <div className="flex min-w-0 flex-col gap-3 print:gap-1.5 compact:gap-4">
              <TaskTable {...lists} className="flex-1" />
              {/* Uses the room under the To Do rows; the To Do box gives up that space, not the page. */}
              <Section title="OFFICE HOURS TRACKER" disabled={readOnly} className="shrink-0">
                <OfficeHours control={control} register={register} />
              </Section>
              {/* Manager Note + Performance Index: written by the admin (PATCH /api/reports/[id]), read-only for staff. */}
              <Section title="MANAGER NOTE" className="shrink-0">
                <div className="flex items-center gap-3 py-1 print:py-0 compact:flex-wrap compact:gap-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.04em] print:text-[8.5px] compact:text-xs">Performance index:</span>
                  <Scale
                    label="Performance index"
                    value={performance}
                    onChange={setPerformance}
                    disabled={!canReview || reviewSaving}
                    size="plain"
                  />
                </div>
                {/* Six writing lines: the admin types straight onto them, staff get the same lines as plain text. */}
                {canReview && (
                  <textarea
                    value={managerNote}
                    onChange={(e) => setManagerNote(e.target.value)}
                    maxLength={MANAGER_NOTE_MAX}
                    rows={6}
                    aria-label="Manager note"
                    placeholder="Write feedback for this report…"
                    className={`${ruled} mt-1 w-full resize-none border-0 px-1 py-0 focus:bg-neutral-50 focus:outline-none print:hidden`}
                  />
                )}
                {/* On paper the lines tighten so even a full 600-character note stays on the one A4 page. */}
                <p
                  style={{ "--print-lines": 16 } as CSSProperties}
                  className={`${ruled} ${ruledPrint} print-text mt-1 overflow-y-auto whitespace-pre-wrap break-words px-1 print:mt-0.5 print:whitespace-pre-line ${
                    canReview ? "hidden" : ""
                  }`}
                >
                  {managerNote || (!canReview && <span className="text-neutral-400 print:hidden">No manager note yet.</span>)}
                </p>
              </Section>
            </div>
          </div>
        </article>
      </div>

      {/* Sticky, not fixed: it rides the bottom of the screen while scrolling and never covers the end of the form. */}
      {!printOnly && (
        <div className="sticky bottom-0 z-10 border-t border-neutral-200 bg-white/95 backdrop-blur print:hidden">
          <div className="mx-auto flex max-w-[948px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2.5 sm:px-6 phone:py-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1 phone:basis-full">
              {/* Messages live in the sticky bar so they are seen wherever the user has scrolled. */}
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
                {!isAdmin && report && !lockReason && (
                  <span>
                    Editable until{" "}
                    {submitted ? formatDateTime(report.editableUntil, timeZone) : formatDate(report.editableUntil)}
                  </span>
                )}
                {isAdmin && (
                  <span>
                    {report?.review?.reviewedAt ? `Reviewed: ${formatDateTime(report.review.reviewedAt, timeZone)}` : "Not reviewed yet"}
                    {reviewDirty && " · unsaved review changes"}
                  </span>
                )}
                {!readOnly && saveLabel && (
                  <span className={saveState === "error" ? "font-medium text-red-700" : "text-neutral-500"}>{saveLabel}</span>
                )}
                {navigating && <span>Loading…</span>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 phone:w-full">
              <button type="button" onClick={() => window.print()} className={`${btnSecondary} ${barButton}`}>
                Print
              </button>
              {!readOnly && !submitted && (
                <button
                  type="button"
                  onClick={() => void save("draft", true)}
                  disabled={saveState === "saving"}
                  className={`${btnSecondary} ${barButton}`}
                >
                  Save Draft
                </button>
              )}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => void onSubmit()}
                  disabled={saveState === "saving"}
                  className={`${btnPrimary} ${barButton} phone:grow`}
                >
                  {submitted ? "UPDATE DAILY REPORT" : "SUBMIT DAILY REPORT"}
                </button>
              )}
              {isAdmin && report && (
                <button
                  type="button"
                  onClick={() => void saveReview()}
                  disabled={!reviewDirty || reviewSaving}
                  className={`${btnPrimary} ${barButton} phone:grow`}
                >
                  {reviewSaving ? "Saving…" : "Save Review"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Action bar buttons: 40px touch targets below 1024px; on phones the primary action takes the rest of the row.
const barButton = "compact:min-h-10 phone:px-3";

// Six ruled "paper" lines for the manager's note; bg-local keeps them under the text when it scrolls.
const ruled =
  "h-36 bg-local bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_23px,#a3a3a3_23px,#a3a3a3_24px)] text-[13px] leading-6 compact:text-base";
// Printed: the same six lines at a tighter pitch, growing to at most 16 (the .print-text cap) for a long note.
const ruledPrint =
  "print:h-auto print:min-h-24 print:bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_15px,#a3a3a3_15px,#a3a3a3_16px)] print:text-[9.5px] print:leading-4";

// Header label columns: wide enough for "DEPARTMENT:" (left) and "JOB ROLE*:" (right); one shared width on phones (one field per row).
const HEADER_LABEL_LEFT = "w-[5.2rem] print:w-[4.2rem] compact:w-24";
const HEADER_LABEL_RIGHT = "w-[4.4rem] print:w-[3.6rem] compact:w-[5.25rem] phone:w-24";

function HeaderField({
  label,
  labelClass = "",
  htmlFor,
  required,
  children,
}: {
  label: string;
  labelClass?: string;
  htmlFor?: string;
  required?: boolean;
  children: ReactNode;
}) {
  const Label = htmlFor ? "label" : "span";
  return (
    <div className="flex min-w-0 items-end gap-2 compact:items-baseline">
      <Label
        htmlFor={htmlFor}
        className={`shrink-0 pb-1 text-[10px] font-bold uppercase tracking-[0.04em] text-neutral-900 print:text-[8px] compact:text-xs ${labelClass}`}
      >
        {label}
        {required && (
          <span aria-hidden className="text-red-700 print:hidden">
            *
          </span>
        )}
        :
      </Label>
      <span className="min-w-0 flex-1 truncate border-b border-neutral-900 pb-1 text-[13.5px] font-medium text-neutral-900 print:text-[10.5px] compact:text-base compact:leading-7">
        {children}
      </span>
    </div>
  );
}
