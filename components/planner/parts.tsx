"use client";

import type { CSSProperties, ReactNode } from "react";
import { Controller, useFieldArray, useWatch, type Control, type UseFormRegister, type UseFormRegisterReturn } from "react-hook-form";
import { calcNetOfficeHours, formatHours, sumHours } from "@/lib/utils";
import {
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
  topPriorities: CheckRow[];
  /** Communications table (Call / Email / Direct Meeting); stored in the existing callsEmails column. */
  callsEmails: CommunicationRow[];
  personalTodo: CheckRow[];
  dailySchedules: { time: string; text: string }[];
  tasks: { text: string; done: boolean; planned: string; worked: string }[];
  officeIn: string;
  officeOut: string;
  breakMinutes: string;
  productivity: number | null;
  mood: number | null;
  health: number | null;
};

/** A thin writing line, like the printed planner. */
export const lineInput =
  "w-full min-w-0 border-0 border-b border-neutral-400 bg-transparent px-1 py-[3px] text-[13.5px] leading-5 text-neutral-900 " +
  "placeholder:text-neutral-300 focus:border-neutral-900 focus:bg-neutral-50 focus:outline-none " +
  "disabled:bg-transparent disabled:text-neutral-900 aria-invalid:border-red-600 aria-invalid:text-red-700 " +
  "print:py-0.5 print:text-[10px] print:placeholder:text-transparent";

const label = "text-[10px] font-bold uppercase tracking-[0.04em] text-neutral-900 print:text-[8px]";

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
    <section className={`flex min-w-0 flex-col break-inside-avoid rounded-md border border-neutral-900 px-2.5 pb-2 print:px-2 print:pb-1 ${className}`}>
      <div className="-mx-2.5 mb-1.5 flex min-h-8 items-center justify-between gap-2 border-b border-neutral-900 px-2.5 print:-mx-2 print:mb-1 print:min-h-5 print:px-2">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.04em] text-neutral-900 print:text-[8.5px]">{title}</h2>
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
      <span className="text-[10px] font-medium tabular-nums text-neutral-400" title={`${count} of ${max} rows used`}>
        {count}/{max}
      </span>
      {count < max && (
        <button
          type="button"
          onClick={onAdd}
          aria-label={addLabel}
          title={addLabel}
          className="rounded border border-dashed border-neutral-400 px-1.5 text-[11px] font-medium leading-5 text-neutral-700 hover:border-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-900"
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

function RemoveButton({ onClick, label: aria, floating }: { onClick: () => void; label: string; floating?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={aria}
      title="Remove row"
      className={`${floating ? "absolute right-0 top-[2px]" : ""} grid size-6 shrink-0 place-items-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800 focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 print:hidden`}
    >
      <span aria-hidden>×</span>
    </button>
  );
}

// Checkbox lined up with its writing line.
const rowMarker = "mt-[6px] print:mt-[2px]";
// Editable rows keep room at the end of the line for the floating remove (×) button.
const roomForRemove = (readOnly: boolean) => (readOnly ? "" : "pr-7");
const columnHead = "text-[9px] font-bold uppercase tracking-[0.04em] text-neutral-900 print:text-[7.5px]";

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
          <li key={field.id} title={rows[i]?.text || undefined} className="group relative flex items-start gap-2">
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
                floating
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
  const cols = "grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-x-2 print:grid-cols-[4.6rem_minmax(0,1fr)] print:gap-x-1.5";
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
      <div className={`${cols} ${columnHead}`}>
        <span>Type</span>
        <span>Details</span>
      </div>
      <ul>
        {fields.map((field, i) => {
          const type = rows[i]?.type ?? "";
          return (
            <li key={field.id} title={rows[i]?.text || undefined} className={`group relative ${cols}`}>
              <select
                {...register(`callsEmails.${i}.type`)}
                aria-label={`Communication ${i + 1} type`}
                aria-invalid={!type && !!rows[i]?.text}
                className={`${lineInput} cursor-pointer pl-0 text-[12.5px] disabled:cursor-default print:hidden`}
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
                  floating
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
  const cols = "grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 print:grid-cols-[4.2rem_minmax(0,1fr)] print:gap-x-1.5";
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
      <div className={`${cols} ${columnHead}`}>
        <span className="w-[6.1rem] print:w-auto">Time</span>
        <span>Schedule / Appointment</span>
      </div>
      <ul>
        {fields.map((field, i) => (
          <li key={field.id} title={rows[i]?.text || undefined} className={`group relative ${cols}`}>
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
                floating
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
    "grid grid-cols-[16px_minmax(0,1fr)_4.5rem_4.5rem_1.5rem] items-start gap-x-2.5 print:grid-cols-[14px_minmax(0,1fr)_3.2rem_3.2rem] print:gap-x-2";

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
      <div className={`${cols} ${columnHead}`}>
        <span className="col-span-2">Task</span>
        <span className="text-center">Plan Hrs</span>
        <span className="text-center">Worked</span>
        <span className="print:hidden" />
      </div>
      <ul>
        {fields.map((field, i) => (
          <li key={field.id} title={tasks[i]?.text || undefined} className={`group ${cols}`}>
            <input
              type="checkbox"
              {...register(`tasks.${i}.done`)}
              aria-label={`Task ${i + 1} completed`}
              className={`paper-check ${rowMarker}`}
            />
            <LineText registration={register(`tasks.${i}.text`)} label={`Task ${i + 1}`} maxLength={ROW_TEXT_MAX.tasks} />
            <PrintText value={tasks[i]?.text} />
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
              <span className="print:hidden" />
            ) : (
              <RemoveButton
                onClick={() => {
                  remove(i);
                  onRowsChange();
                }}
                label={`Remove task ${i + 1}`}
              />
            )}
          </li>
        ))}
      </ul>
      {/* Totals sit at the foot of the box, as in the reference. */}
      <div className="mt-auto grid grid-cols-2 gap-6 pt-3 print:gap-4 print:pt-2">
        <Total label="TOTAL PLANNED:" value={totalPlanned} />
        <Total label="TOTAL WORKED:" value={totalWorked} />
      </div>
    </Section>
  );
}

function Total({ label: text, value }: { label: string; value: number }) {
  return (
    <div className="flex items-end gap-2">
      <span className={`${label} shrink-0`}>{text}</span>
      <span
        className="flex-1 border-b border-neutral-900 pb-0.5 text-center text-[13.5px] font-semibold tabular-nums print:text-[10px]"
        aria-live="polite"
      >
        {formatHours(value)} h
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Office hours: IN / OUT (12-hour pickers) / BREAK minutes, with live NET OFFICE HOURS
// ---------------------------------------------------------------------------

export function OfficeHours({ control, register }: Pick<ListProps, "control" | "register">) {
  const [officeIn, officeOut, breakRaw] = useWatch({ control, name: ["officeIn", "officeOut", "breakMinutes"] });
  const breakMinutes = breakRaw.trim() === "" ? null : Number(breakRaw);
  const breakInvalid = breakMinutes != null && (!Number.isInteger(breakMinutes) || breakMinutes < 0);
  const net = calcNetOfficeHours(officeIn || null, officeOut || null, breakInvalid ? null : breakMinutes);
  const error = breakInvalid ? "Break must be whole minutes, 0 or more." : net.error;
  const row = "flex items-center gap-2";
  const rowLabel = `${label} w-[7.5rem] shrink-0 print:w-[5.2rem]`;

  return (
    <div>
      <div className={row}>
        <span className={rowLabel}>IN</span>
        <Controller
          control={control}
          name="officeIn"
          render={({ field }) => <TimePicker value={field.value} onChange={field.onChange} label="IN" />}
        />
      </div>
      <div className={row}>
        <span className={rowLabel}>OUT</span>
        <Controller
          control={control}
          name="officeOut"
          render={({ field }) => <TimePicker value={field.value} onChange={field.onChange} label="OUT" invalid={!!net.error} />}
        />
      </div>
      <label className={row}>
        <span className={rowLabel}>BREAK</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={720}
          step={1}
          {...register("breakMinutes")}
          aria-label="Break in minutes"
          aria-invalid={breakInvalid}
          className={`${lineInput} max-w-20 tabular-nums`}
        />
        <span className="text-[11px] text-neutral-500 print:text-[8px]">min</span>
      </label>
      <div className={row}>
        <span className={rowLabel}>NET OFFICE HOURS</span>
        <span className="min-w-0 flex-1 border-b border-neutral-400 px-1 py-[3px] text-[13.5px] font-semibold leading-5 tabular-nums print:py-0.5 print:text-[10px]" aria-live="polite">
          {net.hours == null ? "" : `${formatHours(net.hours)} h`}
        </span>
      </div>
      {error && (
        <p role="alert" className="pt-0.5 text-[11px] text-red-700 print:hidden">
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
    ? "size-6 rounded-full border-[1.5px] text-[13px] print:size-4 print:border print:text-[9px]"
    : "size-[1.3rem] rounded-[3px] border text-[10px] print:size-[14px] print:text-[7.5px]";
  return (
    <div role="radiogroup" aria-label={aria} className={`flex ${plain ? "gap-2 print:gap-1.5" : "gap-1"}`}>
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
