"use client";

import type { CSSProperties, ReactNode } from "react";
import { Controller, useFieldArray, useWatch, type Control, type UseFormRegister, type UseFormRegisterReturn } from "react-hook-form";
import { calcOfficeTime, formatHours, formatMinutes, sumHours, totalBreakMinutes } from "@/lib/utils";
import {
  BREAK_REASON_MAX,
  COMMUNICATION_LABELS,
  COMMUNICATION_TYPES,
  ROW_LIMITS,
  ROW_TEXT_MAX,
  type CommunicationType,
} from "@/lib/validations";
import { TimePicker } from "./TimePicker";

// ---------------------------------------------------------------------------
// Form shape: inputs hold strings; PlannerForm converts to the API shape.
// Times are stored 24-hour "HH:MM" (or ""); the TimePicker shows them as 12-hour.
// ---------------------------------------------------------------------------

export type CheckRow = { text: string; done: boolean };
export type CommunicationRow = { type: CommunicationType | ""; text: string; done: boolean };
export type FormValues = {
  jobRole: string;
  topPriorities: CheckRow[];
  /** Communications table (Call / Email / Direct Meeting); stored in the existing callsEmails column. */
  callsEmails: CommunicationRow[];
  personalTodo: CheckRow[];
  dailySchedules: { time: string; text: string }[];
  tasks: { text: string; done: boolean; planned: string; worked: string }[];
  officeIn: string;
  officeOut: string;
  /** Break 1, 2 and 3, in minutes. */
  breakMinutes: string;
  break2Minutes: string;
  break3Minutes: string;
  break1Reason: string;
  break2Reason: string;
  break3Reason: string;
  productivity: number | null;
  mood: number | null;
  health: number | null;
};

/** A thin writing line, like the printed planner. */
export const lineInput =
  "w-full min-w-0 border-0 border-b border-neutral-400 bg-transparent px-1 py-[3px] text-[13.5px] leading-5 text-neutral-900 " +
  "placeholder:text-neutral-300 focus:border-neutral-900 focus:bg-neutral-50 focus:outline-none " +
  "disabled:bg-transparent disabled:text-neutral-900 aria-invalid:border-red-600 aria-invalid:text-red-700 " +
  "print:py-0.5 print:text-[10px] print:placeholder:text-transparent compact:py-1.5 compact:text-base compact:leading-6";

const label = "text-[10px] font-bold uppercase tracking-[0.04em] text-neutral-900 print:text-[8px] compact:text-xs";

// ---------------------------------------------------------------------------
// Layout pieces
// ---------------------------------------------------------------------------

/** Rounded box with a ruled title strip, as in the A4 reference. */
export function Section({
  title,
  action,
  disabled,
  className = "",
  children,
}: {
  title: string;
  action?: ReactNode;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`flex min-w-0 flex-col break-inside-avoid rounded-md border border-neutral-900 px-2.5 pb-2 print:px-2 print:pb-1 compact:px-4 compact:pb-3 phone:px-3 ${className}`}>
      <div className="-mx-2.5 mb-1.5 flex min-h-8 items-center justify-between gap-2 border-b border-neutral-900 px-2.5 print:-mx-2 print:mb-1 print:min-h-5 print:px-2 compact:-mx-4 compact:mb-2 compact:min-h-11 compact:px-4 phone:-mx-3 phone:px-3">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.04em] text-neutral-900 print:text-[8.5px] compact:text-xs">{title}</h2>
        {action}
      </div>
      {/* A disabled fieldset makes every control inside read-only in one place. */}
      <fieldset disabled={disabled} className="m-0 flex min-h-0 min-w-0 flex-1 flex-col border-0 p-0">
        {children}
      </fieldset>
    </section>
  );
}

/**
 * "n/max" counter + small "+ Add" for a fixed-size section. The button disappears at the limit
 * (and the add handler re-checks it), so no section can outgrow its space on the A4 page.
 */
function RowLimit({
  count,
  max,
  label: addLabel,
  onAdd,
  readOnly,
}: {
  count: number;
  max: number;
  label: string;
  onAdd: () => void;
  readOnly: boolean;
}) {
  if (readOnly) return null;
  return (
    <div className="flex shrink-0 items-center gap-1.5 print:hidden">
      <span className="text-[10px] font-medium tabular-nums text-neutral-400 compact:text-xs" title={`${count} of ${max} rows used`}>
        {count}/{max}
      </span>
      {count < max && (
        <button
          type="button"
          onClick={onAdd}
          aria-label={addLabel}
          title={addLabel}
          className="rounded border border-dashed border-neutral-400 px-1.5 text-[11px] font-medium leading-5 text-neutral-700 hover:border-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-900 compact:min-h-8 compact:px-3 compact:text-[13px]"
        >
          + Add
        </button>
      )}
    </div>
  );
}

/**
 * On paper the text is printed wrapped, so nothing typed is lost to a short writing line. Line
 * breaks collapse and long words break. `lines` is a last-resort cap (see .print-text in
 * globals.css): text within the row limits never reaches it, only freak all-wide-letter text would.
 */
function PrintText({ value, lines = 2 }: { value: string | undefined; lines?: number }) {
  return (
    <span
      style={{ "--print-lines": lines } as CSSProperties}
      className="print-text hidden min-h-[14px] min-w-0 flex-1 whitespace-normal break-words border-b border-neutral-400 py-px text-[9.5px] leading-[1.25] text-neutral-900"
    >
      {value}
    </span>
  );
}

/** Single writing line. */
function LineText({
  registration,
  label: aria,
  maxLength,
  className = "",
}: {
  registration: UseFormRegisterReturn;
  label: string;
  maxLength: number;
  className?: string;
}) {
  return (
    <input
      type="text"
      {...registration}
      aria-label={aria}
      maxLength={maxLength}
      autoComplete="off"
      className={`${lineInput} print:hidden ${className}`}
    />
  );
}

function RemoveButton({ onClick, label: aria, className = "" }: { onClick: () => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={aria}
      title="Remove row"
      className={`${className} grid size-6 shrink-0 place-items-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800 focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 print:hidden compact:size-8 compact:text-xl`}
    >
      <span aria-hidden>×</span>
    </button>
  );
}

// Checkbox lined up with its writing line.
const rowMarker = "mt-[6px] print:mt-[2px] compact:mt-0 compact:self-center";
// Editable rows keep room at the end of the line for the floating remove (×) button.
const roomForRemove = (readOnly: boolean) => (readOnly ? "" : "pr-7 compact:pr-9");
const floatingRemove = "absolute right-0 top-[2px] compact:top-0.5";
const columnHead = "text-[9px] font-bold uppercase tracking-[0.04em] text-neutral-900 print:text-[7.5px] compact:text-[11px]";

// ---------------------------------------------------------------------------
// Dynamic lists (each one a fixed-maximum section)
// ---------------------------------------------------------------------------

type ListProps = {
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  readOnly: boolean;
  /** Adding/removing rows doesn't emit a value event in RHF, so lists report it explicitly. */
  onRowsChange: () => void;
  className?: string;
};

export function CheckList({
  control,
  register,
  readOnly,
  onRowsChange,
  className,
  name,
  title,
  itemLabel,
}: ListProps & {
  name: "topPriorities" | "personalTodo";
  title: string;
  itemLabel: string;
}) {
  const { fields, append, remove } = useFieldArray({ control, name });
  const rows = useWatch({ control, name });
  const max = ROW_LIMITS[name];
  return (
    <Section
      title={title}
      disabled={readOnly}
      className={className}
      action={
        <RowLimit
          count={fields.length}
          max={max}
          label={`Add ${itemLabel.toLowerCase()}`}
          readOnly={readOnly}
          onAdd={() => {
            if (fields.length >= max) return;
            append({ text: "", done: false });
            onRowsChange();
          }}
        />
      }
    >
      <ul>
        {fields.map((field, i) => (
          <li key={field.id} title={rows[i]?.text || undefined} className="group relative flex items-start gap-2 compact:gap-3">
            <input
              type="checkbox"
              {...register(`${name}.${i}.done`)}
              aria-label={`${itemLabel} ${i + 1} done`}
              className={`paper-check ${rowMarker}`}
            />
            <LineText
              registration={register(`${name}.${i}.text`)}
              label={`${itemLabel} ${i + 1}`}
              maxLength={ROW_TEXT_MAX[name]}
              className={roomForRemove(readOnly)}
            />
            <PrintText value={rows[i]?.text} />
            {!readOnly && (
              <RemoveButton
                onClick={() => {
                  remove(i);
                  onRowsChange();
                }}
                label={`Remove ${itemLabel.toLowerCase()} ${i + 1}`}
                className={floatingRemove}
              />
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** First communication type not used yet, so a new row defaults to a sensible choice. */
function nextCommunicationType(rows: CommunicationRow[] | undefined): CommunicationType {
  return COMMUNICATION_TYPES.find((t) => !rows?.some((r) => r.type === t)) ?? "CALL";
}

export function CommunicationsTable({ control, register, readOnly, onRowsChange, className }: ListProps) {
  const { fields, append, remove } = useFieldArray({ control, name: "callsEmails" });
  const rows = useWatch({ control, name: "callsEmails" });
  const max = ROW_LIMITS.callsEmails;
  const cols =
    "grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-x-2 print:grid-cols-[4.6rem_minmax(0,1fr)] print:gap-x-1.5 compact:grid-cols-[9.5rem_minmax(0,1fr)] compact:gap-x-3 phone:grid-cols-1";
  return (
    <Section
      title="COMMUNICATIONS"
      disabled={readOnly}
      className={className}
      action={
        <RowLimit
          count={fields.length}
          max={max}
          label="Add communication"
          readOnly={readOnly}
          onAdd={() => {
            if (fields.length >= max) return;
            append({ type: nextCommunicationType(rows), text: "", done: false });
            onRowsChange();
          }}
        />
      }
    >
      <div className={`${cols} ${columnHead} phone:hidden`}>
        <span>Type</span>
        <span>Details</span>
      </div>
      <ul>
        {fields.map((field, i) => {
          const type = rows[i]?.type ?? "";
          return (
            <li key={field.id} title={rows[i]?.text || undefined} className={`group relative ${cols} phone:justify-items-start phone:pb-2`}>
              <select
                {...register(`callsEmails.${i}.type`)}
                aria-label={`Communication ${i + 1} type`}
                aria-invalid={!type && !!rows[i]?.text}
                className={`${lineInput} cursor-pointer pl-0 text-[12.5px] disabled:cursor-default print:hidden compact:text-base phone:w-auto`}
              >
                {/* Only rows saved before types existed can be blank; they must pick one to be saved. */}
                {!type && <option value="">Choose type…</option>}
                {COMMUNICATION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {COMMUNICATION_LABELS[t]}
                  </option>
                ))}
              </select>
              <PrintText value={type ? COMMUNICATION_LABELS[type] : ""} />
              <LineText
                registration={register(`callsEmails.${i}.text`)}
                label={`Communication ${i + 1} details`}
                maxLength={ROW_TEXT_MAX.callsEmails}
                className={roomForRemove(readOnly)}
              />
              <PrintText value={rows[i]?.text} lines={3} />
              {!readOnly && (
                <RemoveButton
                  onClick={() => {
                    remove(i);
                    onRowsChange();
                  }}
                  label={`Remove communication ${i + 1}`}
                  className={floatingRemove}
                />
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function ScheduleList({ control, register, readOnly, onRowsChange, className }: ListProps) {
  const { fields, append, remove } = useFieldArray({ control, name: "dailySchedules" });
  const rows = useWatch({ control, name: "dailySchedules" });
  const max = ROW_LIMITS.dailySchedules;
  const cols =
    "grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 print:grid-cols-[4.2rem_minmax(0,1fr)] print:gap-x-1.5 compact:gap-x-3 phone:grid-cols-1";
  return (
    <Section
      title="DAILY SCHEDULES"
      disabled={readOnly}
      className={className}
      action={
        <RowLimit
          count={fields.length}
          max={max}
          label="Add schedule"
          readOnly={readOnly}
          onAdd={() => {
            if (fields.length >= max) return;
            append({ time: "", text: "" });
            onRowsChange();
          }}
        />
      }
    >
      <div className={`${cols} ${columnHead} phone:hidden`}>
        <span className="w-[6.1rem] print:w-auto compact:w-[8rem]">Time</span>
        <span>Schedule / Appointment</span>
      </div>
      <ul>
        {fields.map((field, i) => (
          <li key={field.id} title={rows[i]?.text || undefined} className={`group relative ${cols} phone:justify-items-start phone:pb-2`}>
            <Controller
              control={control}
              name={`dailySchedules.${i}.time`}
              render={({ field: time }) => <TimePicker value={time.value} onChange={time.onChange} label={`Schedule ${i + 1}`} />}
            />
            <LineText
              registration={register(`dailySchedules.${i}.text`)}
              label={`Schedule ${i + 1}`}
              maxLength={ROW_TEXT_MAX.dailySchedules}
              className={roomForRemove(readOnly)}
            />
            <PrintText value={rows[i]?.text} lines={3} />
            {!readOnly && (
              <RemoveButton
                onClick={() => {
                  remove(i);
                  onRowsChange();
                }}
                label={`Remove schedule ${i + 1}`}
                className={floatingRemove}
              />
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

const hoursInput = `${lineInput} text-center tabular-nums`;
const hoursOk = (s: string) => s.trim() === "" || (Number(s) >= 0 && Number(s) <= 24);

export function TaskTable({ control, register, readOnly, onRowsChange, className }: ListProps) {
  const { fields, append, remove } = useFieldArray({ control, name: "tasks" });
  const tasks = useWatch({ control, name: "tasks" });
  const max = ROW_LIMITS.tasks;
  // Invalid entries are flagged on the input and left out of the live totals (the save is blocked anyway).
  const toNum = (s: string) => (s.trim() === "" || !hoursOk(s) ? null : Number(s));
  const totalPlanned = sumHours(tasks.map((t) => toNum(t.planned)));
  const totalWorked = sumHours(tasks.map((t) => toNum(t.worked)));
  const cols =
    "grid grid-cols-[16px_minmax(0,1fr)_4.5rem_4.5rem_1.5rem] items-start gap-x-2.5 print:grid-cols-[14px_minmax(0,1fr)_3.2rem_3.2rem] print:gap-x-2 " +
    "compact:grid-cols-[24px_minmax(0,1fr)_5rem_5rem_2rem] compact:gap-x-3 phone:grid-cols-[24px_auto_minmax(0,1fr)_auto_minmax(0,1fr)] phone:gap-x-2";

  return (
    <Section
      title="TO DO LIST — TASK + PLANNED HOURS + WORKED HOURS"
      disabled={readOnly}
      className={className}
      action={
        <RowLimit
          count={fields.length}
          max={max}
          label="Add task"
          readOnly={readOnly}
          onAdd={() => {
            if (fields.length >= max) return;
            append({ text: "", done: false, planned: "", worked: "" });
            onRowsChange();
          }}
        />
      }
    >
      <div className={`${cols} ${columnHead} phone:hidden`}>
        <span className="col-span-2">Task</span>
        <span className="text-center">Plan Hrs</span>
        <span className="text-center">Worked</span>
        <span className="print:hidden" />
      </div>
      <ul>
        {fields.map((field, i) => (
          <li key={field.id} title={tasks[i]?.text || undefined} className={`group ${cols} phone:relative phone:gap-y-1 phone:pb-3`}>
            <input
              type="checkbox"
              {...register(`tasks.${i}.done`)}
              aria-label={`Task ${i + 1} completed`}
              className={`paper-check ${rowMarker}`}
            />
            <LineText
              registration={register(`tasks.${i}.text`)}
              label={`Task ${i + 1}`}
              maxLength={ROW_TEXT_MAX.tasks}
              className={`phone:col-span-4 ${readOnly ? "" : "phone:pr-9"}`}
            />
            <PrintText value={tasks[i]?.text} />
            {/* Phones only (display:none elsewhere, so never a grid cell): the hours sit on their own line, labelled. */}
            <span aria-hidden className={`${columnHead} hidden phone:col-start-2 phone:block`}>
              Plan hrs
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={24}
              step="any"
              {...register(`tasks.${i}.planned`)}
              aria-label={`Task ${i + 1} planned hours`}
              aria-invalid={!hoursOk(tasks[i]?.planned ?? "")}
              className={hoursInput}
            />
            <span aria-hidden className={`${columnHead} hidden phone:block phone:pl-2`}>
              Worked
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={24}
              step="any"
              {...register(`tasks.${i}.worked`)}
              aria-label={`Task ${i + 1} worked hours`}
              aria-invalid={!hoursOk(tasks[i]?.worked ?? "")}
              className={hoursInput}
            />
            {readOnly ? (
              <span className="print:hidden phone:hidden" />
            ) : (
              <RemoveButton
                onClick={() => {
                  remove(i);
                  onRowsChange();
                }}
                label={`Remove task ${i + 1}`}
                className="phone:absolute phone:right-0 phone:top-0.5"
              />
            )}
          </li>
        ))}
      </ul>
      {/* Totals sit at the foot of the box, as in the reference. */}
      <div className="mt-auto grid grid-cols-2 gap-6 pt-3 print:gap-4 print:pt-2 compact:pt-4 phone:gap-4">
        <Total label="TOTAL PLANNED:" value={totalPlanned} />
        <Total label="TOTAL WORKED:" value={totalWorked} />
      </div>
    </Section>
  );
}

function Total({ label: text, value }: { label: string; value: number }) {
  return (
    <div className="flex items-end gap-2 phone:flex-col phone:items-stretch phone:gap-1">
      <span className={`${label} shrink-0`}>{text}</span>
      <span
        className="flex-1 border-b border-neutral-900 pb-0.5 text-center text-[13.5px] font-semibold tabular-nums print:text-[10px] compact:text-base"
        aria-live="polite"
      >
        {formatHours(value)} h
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Office hours: IN / OUT (12-hour pickers) / Break 1–3 (minutes + reason), with live totals in hours + minutes
// ---------------------------------------------------------------------------

const BREAKS = ["breakMinutes", "break2Minutes", "break3Minutes"] as const;
const BREAK_REASONS = ["break1Reason", "break2Reason", "break3Reason"] as const;
// Grid rows of Break 1–3, written out so Tailwind generates the classes.
const BREAK_ROWS = ["row-start-3", "row-start-4", "row-start-5"] as const;
/** Office-box rows are tighter than the list rows: 1px instead of 3px vertical padding. */
const tightInput = lineInput.replace("py-[3px]", "py-px");

export function OfficeHours({ control, register }: Pick<ListProps, "control" | "register">) {
  const [officeIn, officeOut, ...breakRaw] = useWatch({ control, name: ["officeIn", "officeOut", ...BREAKS] });
  const breaks = breakRaw.map((s) => (s.trim() === "" ? null : Number(s)));
  const breakInvalid = breaks.map((b) => b != null && (!Number.isInteger(b) || b < 0 || b > 720));
  const anyInvalid = breakInvalid.some(Boolean);
  // Everything is whole minutes: office = OUT − IN, total break = 1 + 2 + 3, net = office − total break.
  const totalBreak = totalBreakMinutes(...breaks);
  const time = calcOfficeTime(officeIn || null, officeOut || null, anyInvalid ? 0 : totalBreak);
  const error = anyInvalid ? "Breaks must be whole minutes, 0 or more." : time.error;
  const showBreak = !anyInvalid && (breaks.some((b) => b != null) || time.officeMinutes != null);
  const row = "flex min-w-0 items-center gap-1.5 compact:gap-2 phone:col-start-auto phone:row-start-auto";
  const entryLabel = `${label} w-[2.9rem] shrink-0 compact:w-16`;
  const resultLabel = `${label} w-[6.5rem] shrink-0 print:w-[5.2rem] compact:w-32`;
  const result =
    "min-w-0 flex-1 border-b border-neutral-400 px-1 py-px text-[13.5px] leading-5 tabular-nums print:py-0.5 print:text-[10px] compact:py-1.5 compact:text-base compact:leading-6";

  return (
    <div>
      {/* Entries on the left (IN, OUT, Break 1–3); results on the right, NET level with Break 3. */}
      <div className="grid grid-cols-[minmax(0,1fr)_12rem] gap-x-4 print:grid-cols-[minmax(0,1fr)_10.5rem] compact:grid-cols-[minmax(0,1fr)_15rem] phone:grid-cols-1">
        <div className={`${row} col-start-1 row-start-1`}>
          <span className={entryLabel}>IN</span>
          <Controller
            control={control}
            name="officeIn"
            render={({ field }) => <TimePicker value={field.value} onChange={field.onChange} label="IN" />}
          />
        </div>
        <div className={`${row} col-start-1 row-start-2`}>
          <span className={entryLabel}>OUT</span>
          <Controller
            control={control}
            name="officeOut"
            render={({ field }) => <TimePicker value={field.value} onChange={field.onChange} label="OUT" invalid={!!time.error} />}
          />
        </div>
        {BREAKS.map((name, i) => (
          <div key={name} className={`${row} col-start-1 ${BREAK_ROWS[i]}`}>
            <span className={entryLabel}>BREAK {i + 1}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={720}
              step={1}
              {...register(name)}
              placeholder="Minutes"
              aria-label={`Break ${i + 1} in minutes`}
              aria-invalid={breakInvalid[i]}
              className={`${tightInput} max-w-12 shrink-0 text-center tabular-nums placeholder:text-[10.5px] compact:max-w-16 compact:placeholder:text-xs`}
            />
            <span className="shrink-0 text-[11px] text-neutral-500 print:text-[8px] compact:text-xs">min</span>
            <input
              type="text"
              {...register(BREAK_REASONS[i])}
              maxLength={BREAK_REASON_MAX}
              placeholder="Reason"
              aria-label={`Break ${i + 1} reason`}
              className={`${tightInput} flex-1`}
            />
          </div>
        ))}
        <div className={`${row} col-start-2 row-start-1`}>
          <span className={resultLabel}>TOTAL OFFICE TIME</span>
          <span className={result}>{time.officeMinutes == null ? "" : formatMinutes(time.officeMinutes)}</span>
        </div>
        <div className={`${row} col-start-2 row-start-2`}>
          <span className={resultLabel}>TOTAL BREAK</span>
          <span className={result}>{showBreak ? formatMinutes(totalBreak) : ""}</span>
        </div>
        <div className={`${row} col-start-2 row-start-5`}>
          <span className={resultLabel}>NET OFFICE HOURS</span>
          <span className={`${result} font-semibold`} aria-live="polite">
            {time.netMinutes == null ? "" : formatMinutes(time.netMinutes)}
          </span>
        </div>
      </div>
      {error && (
        <p role="alert" className="pt-0.5 text-[11px] text-red-700 print:hidden compact:text-xs">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1–5 scale: small squares for the daily ratings, plain circled numerals for the performance index (as in the reference)
// ---------------------------------------------------------------------------

export function Scale({
  label: aria,
  value,
  onChange,
  disabled,
  size = "sm",
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  /** "plain": bare numerals like the printed "1 2 3 4 5", the chosen one circled as if with a pen. */
  size?: "sm" | "plain";
}) {
  const plain = size === "plain";
  const box = plain
    ? "size-6 rounded-full border-[1.5px] text-[13px] print:size-4 print:border print:text-[9px] compact:size-9 compact:text-base"
    : "size-[1.3rem] rounded-[3px] border text-[10px] print:size-[14px] print:text-[7.5px] compact:size-8 compact:rounded compact:text-sm phone:size-7";
  return (
    <div role="radiogroup" aria-label={aria} className={`flex ${plain ? "gap-2 print:gap-1.5 compact:gap-3 phone:gap-2" : "gap-1 compact:gap-2 phone:gap-1.5"}`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const selected = value === n;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${aria}: ${n} of 5`}
            disabled={disabled}
            // Clicking the selected value again clears it.
            onClick={() => onChange(selected ? null : n)}
            className={`grid shrink-0 place-items-center font-semibold tabular-nums transition-colors ${box} ${
              plain
                ? selected
                  ? "border-neutral-900 text-neutral-900"
                  : "border-transparent text-neutral-700 enabled:hover:bg-neutral-100"
                : selected
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-900 bg-white text-neutral-700 enabled:hover:bg-neutral-100"
            } disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900`}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}
