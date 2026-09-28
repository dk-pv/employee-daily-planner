"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  Controller,
  useFieldArray,
  useWatch,
  type Control,
  type UseFormRegister,
  type UseFormRegisterReturn,
} from "react-hook-form";
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
  appointments: { text: string; done: boolean; time: string }[];
  dailySchedules: { time: string; text: string }[];
  tasks: { text: string; done: boolean; planned: string; worked: string }[];
  officeIn: string;
  officeOut: string;
  breakMinutes: string;
  productivity: number | null;
  mood: number | null;
  health: number | null;
};

export const lineInput =
  "w-full min-w-0 border-0 border-b border-neutral-300 bg-transparent px-1 py-1 text-[14px] leading-5 text-neutral-900 " +
  "placeholder:text-neutral-300 focus:border-neutral-900 focus:bg-neutral-50 focus:outline-none " +
  "disabled:bg-transparent disabled:text-neutral-900 aria-invalid:border-red-600 aria-invalid:text-red-700 " +
  "print:py-0.5 print:text-[10.5px] print:placeholder:text-transparent";

// ---------------------------------------------------------------------------
// Layout pieces
// ---------------------------------------------------------------------------

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
    <section
      className={`break-inside-avoid rounded-lg border border-neutral-800 px-3 py-2 print:px-2.5 print:py-1.5 ${className}`}
    >
      <div className="mb-1 flex min-h-6 items-center justify-between gap-2 print:mb-0.5 print:min-h-0">
        <h2 className="text-[11.5px] font-bold tracking-[0.14em] text-neutral-900 print:text-[9.5px]">{title}</h2>
        {action}
      </div>
      {/* A disabled fieldset makes every control inside read-only in one place. */}
      <fieldset disabled={disabled} className="m-0 min-w-0 border-0 p-0">
        {children}
      </fieldset>
    </section>
  );
}

/**
 * "n/max" counter + "+ Add" for a fixed-size A4 section. The button disappears at the limit
 * (and the add handler re-checks it), so no section can grow past its printed space.
 */
function RowLimit({
  count,
  max,
  label,
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
    <div className="flex shrink-0 items-center gap-2 print:hidden">
      <span className="text-[10px] font-medium tabular-nums text-neutral-400" title={`${count} of ${max} rows used`}>
        {count}/{max}
      </span>
      {count < max && (
        <button
          type="button"
          onClick={onAdd}
          aria-label={label}
          title={label}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-neutral-300 px-2 py-0.5 text-xs font-medium text-neutral-700 hover:border-neutral-500 hover:bg-neutral-50 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
        >
          <span aria-hidden className="text-sm leading-none">
            +
          </span>
          Add
        </button>
      )}
    </div>
  );
}

/** On paper the text is printed as wrapped text, so nothing typed is lost to a narrow field. */
function PrintText({ value }: { value: string | undefined }) {
  return (
    <span className="hidden min-h-[17px] min-w-0 flex-1 whitespace-pre-wrap break-words border-b border-neutral-300 py-0.5 text-[10.5px] leading-snug text-neutral-900 print:block">
      {value}
    </span>
  );
}

/**
 * Writing line that grows with its text up to `maxLines` (then scrolls inside the field), so long
 * entries wrap and stay readable without letting the fixed A4 sheet grow.
 */
function GrowingText({
  registration,
  label,
  placeholder,
  className = "",
  maxLines = 2,
}: {
  registration: UseFormRegisterReturn;
  label: string;
  placeholder?: string;
  className?: string;
  maxLines?: number;
}) {
  const box = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const cs = getComputedStyle(el);
      const border = el.offsetHeight - el.clientHeight;
      const max = maxLines * parseFloat(cs.lineHeight) + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + border;
      el.style.height = "auto";
      const full = el.scrollHeight + border;
      el.style.height = `${Math.min(full, max)}px`;
      el.style.overflowY = full > max ? "auto" : "hidden";
    };
    fit(); // react-hook-form has already written the saved value by now
    let width = el.clientWidth;
    let frame = 0;
    // Re-fit on width changes, one frame later so the resize never loops inside the observer.
    const onResize = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });
    onResize.observe(el);
    el.addEventListener("input", fit);
    return () => {
      cancelAnimationFrame(frame);
      onResize.disconnect();
      el.removeEventListener("input", fit);
    };
  }, [maxLines]);
  const { ref, ...field } = registration;
  return (
    <textarea
      rows={1}
      {...field}
      ref={(el) => {
        ref(el);
        box.current = el;
      }}
      aria-label={label}
      placeholder={placeholder}
      maxLength={ROW_TEXT_MAX}
      className={`${lineInput} block resize-none overflow-hidden print:hidden ${className}`}
    />
  );
}

/** Single writing line for the wide right-hand column. */
function LineText({
  registration,
  label,
  className = "",
}: {
  registration: UseFormRegisterReturn;
  label: string;
  className?: string;
}) {
  return (
    <input
      type="text"
      {...registration}
      aria-label={label}
      maxLength={ROW_TEXT_MAX}
      autoComplete="off"
      className={`${lineInput} print:hidden ${className}`}
    />
  );
}

function RemoveButton({ onClick, label, floating }: { onClick: () => void; label: string; floating?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title="Remove row"
      className={`${floating ? "absolute right-0 top-[3px]" : ""} grid size-6 shrink-0 place-items-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800 focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 print:hidden`}
    >
      <span aria-hidden>×</span>
    </button>
  );
}

// Checkbox/marker lined up with the first line of a (possibly two-line) text field.
const rowMarker = "mt-[7px] print:mt-[3px]";
// Editable rows keep room at the end of the text for the floating remove (×) button.
const roomForRemove = (readOnly: boolean) => (readOnly ? "" : "pr-7");
const columnHead = "border-b border-neutral-800 pb-0.5 text-[10px] font-bold tracking-[0.1em] text-neutral-600 print:text-[8.5px]";

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
  numbered,
}: ListProps & {
  name: "topPriorities" | "personalTodo";
  title: string;
  itemLabel: string;
  numbered?: boolean;
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
      <ul className="space-y-0.5">
        {fields.map((field, i) => (
          <li key={field.id} className="group relative flex items-start gap-2">
            <input
              type="checkbox"
              {...register(`${name}.${i}.done`)}
              aria-label={`${itemLabel} ${i + 1} done`}
              className={`paper-check ${rowMarker}`}
            />
            <GrowingText
              registration={register(`${name}.${i}.text`)}
              label={`${itemLabel} ${i + 1}`}
              placeholder={numbered && !readOnly ? `${itemLabel} ${i + 1}` : undefined}
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

export function ScheduleList({ control, register, readOnly, onRowsChange, className }: ListProps) {
  const { fields, append, remove } = useFieldArray({ control, name: "dailySchedules" });
  const rows = useWatch({ control, name: "dailySchedules" });
  const max = ROW_LIMITS.dailySchedules;
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
      {/* In a narrow column the time sits above a full-width text line; side by side when there is room and on paper. */}
      <ul className="space-y-1 @container @2xs:space-y-0.5">
        {fields.map((field, i) => (
          <li
            key={field.id}
            className="group relative flex flex-col items-start @2xs:flex-row @2xs:gap-2 print:flex-row print:gap-2"
          >
            <Controller
              control={control}
              name={`dailySchedules.${i}.time`}
              render={({ field: time }) => <TimePicker value={time.value} onChange={time.onChange} label={`Schedule ${i + 1}`} />}
            />
            <GrowingText
              registration={register(`dailySchedules.${i}.text`)}
              label={`Schedule ${i + 1}`}
              className={readOnly ? "" : "@2xs:pr-7"}
            />
            <PrintText value={rows[i]?.text} />
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

/** First communication type not used yet, so a new row defaults to a sensible choice. */
function nextCommunicationType(rows: CommunicationRow[] | undefined): CommunicationType {
  return COMMUNICATION_TYPES.find((t) => !rows?.some((r) => r.type === t)) ?? "CALL";
}

export function CommunicationsTable({ control, register, readOnly, onRowsChange, className }: ListProps) {
  const { fields, append, remove } = useFieldArray({ control, name: "callsEmails" });
  const rows = useWatch({ control, name: "callsEmails" });
  const max = ROW_LIMITS.callsEmails;
  const cols = "grid grid-cols-[8.75rem_minmax(0,1fr)] items-start gap-x-3 print:grid-cols-[5.75rem_minmax(0,1fr)] print:gap-x-2";
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
        <span>TYPE</span>
        <span>DETAILS / CONTACT</span>
      </div>
      <ul>
        {fields.map((field, i) => {
          const type = rows[i]?.type ?? "";
          return (
            <li key={field.id} className={`group relative ${cols}`}>
              <select
                {...register(`callsEmails.${i}.type`)}
                aria-label={`Communication ${i + 1} type`}
                aria-invalid={!type && !!rows[i]?.text}
                className={`${lineInput} cursor-pointer disabled:cursor-default print:hidden`}
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
                className={roomForRemove(readOnly)}
              />
              <PrintText value={rows[i]?.text} />
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

export function AppointmentList({ control, register, readOnly, onRowsChange, className }: ListProps) {
  const { fields, append, remove } = useFieldArray({ control, name: "appointments" });
  const rows = useWatch({ control, name: "appointments" });
  const max = ROW_LIMITS.appointments;
  return (
    <Section
      title="APPOINTMENTS"
      disabled={readOnly}
      className={className}
      action={
        <RowLimit
          count={fields.length}
          max={max}
          label="Add appointment"
          readOnly={readOnly}
          onAdd={() => {
            if (fields.length >= max) return;
            append({ text: "", done: false, time: "" });
            onRowsChange();
          }}
        />
      }
    >
      <ul>
        {fields.map((field, i) => (
          <li key={field.id} className="group relative flex items-start gap-2">
            <input
              type="checkbox"
              {...register(`appointments.${i}.done`)}
              aria-label={`Appointment ${i + 1} marked`}
              className={`paper-check round ${rowMarker}`}
            />
            <Controller
              control={control}
              name={`appointments.${i}.time`}
              render={({ field: time }) => <TimePicker value={time.value} onChange={time.onChange} label={`Appointment ${i + 1}`} />}
            />
            <LineText
              registration={register(`appointments.${i}.text`)}
              label={`Appointment ${i + 1}`}
              className={roomForRemove(readOnly)}
            />
            <PrintText value={rows[i]?.text} />
            {!readOnly && (
              <RemoveButton
                onClick={() => {
                  remove(i);
                  onRowsChange();
                }}
                label={`Remove appointment ${i + 1}`}
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
  // Narrower hour columns on phones so the task text keeps most of the row.
  const cols =
    "grid grid-cols-[16px_minmax(0,1fr)_3.25rem_3.25rem_1.25rem] sm:grid-cols-[16px_minmax(0,1fr)_4rem_4rem_1.5rem] items-start gap-x-2 print:grid-cols-[15px_minmax(0,1fr)_3rem_3rem]";

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
      <div className={`${cols} items-end ${columnHead}`}>
        <span />
        <span>TASK</span>
        <span className="whitespace-nowrap text-center tracking-normal">PLAN HRS</span>
        <span className="whitespace-nowrap text-center tracking-normal">WORKED</span>
        <span className="print:hidden" />
      </div>
      <ul>
        {fields.map((field, i) => (
          <li key={field.id} className={`group ${cols}`}>
            <input
              type="checkbox"
              {...register(`tasks.${i}.done`)}
              aria-label={`Task ${i + 1} completed`}
              className={`paper-check ${rowMarker}`}
            />
            <LineText registration={register(`tasks.${i}.text`)} label={`Task ${i + 1}`} />
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
      <div className="mt-2 grid grid-cols-2 gap-2 print:mt-1">
        <Total label="TOTAL PLANNED" value={totalPlanned} />
        <Total label="TOTAL WORKED" value={totalWorked} />
      </div>
    </Section>
  );
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-neutral-800 px-2.5 py-1 print:py-0.5">
      <span className="text-[10px] font-bold tracking-[0.1em] print:text-[8.5px]">{label}</span>
      <span className="whitespace-nowrap text-sm font-semibold tabular-nums print:text-[10.5px]" aria-live="polite">
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
  const error = breakInvalid ? "Break must be a whole number of minutes, 0 or more." : net.error;
  const row = "flex items-center gap-2";
  const label = "w-12 shrink-0 text-[10px] font-bold tracking-[0.1em] print:text-[8.5px]";

  return (
    <div className="space-y-0.5">
      <div className={row}>
        <span className={label}>IN</span>
        <Controller
          control={control}
          name="officeIn"
          render={({ field }) => <TimePicker value={field.value} onChange={field.onChange} label="IN" />}
        />
      </div>
      <div className={row}>
        <span className={label}>OUT</span>
        <Controller
          control={control}
          name="officeOut"
          render={({ field }) => (
            <TimePicker value={field.value} onChange={field.onChange} label="OUT" invalid={!!net.error} />
          )}
        />
      </div>
      <label className={row}>
        <span className={label}>BREAK</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={720}
          step={1}
          {...register("breakMinutes")}
          aria-label="Break in minutes"
          aria-invalid={breakInvalid}
          className={`${lineInput} max-w-24 tabular-nums`}
        />
        <span className="text-xs text-neutral-500 print:text-[9px]">min</span>
      </label>
      <div className="mt-1.5 flex items-center justify-between gap-2 rounded-md bg-neutral-100 px-2.5 py-1 print:mt-1 print:py-0.5">
        <span className="text-[10px] font-bold tracking-[0.1em] print:text-[8.5px]">NET OFFICE HOURS</span>
        <span className="text-sm font-semibold tabular-nums print:text-[10.5px]" aria-live="polite">
          {net.hours == null ? "—" : `${formatHours(net.hours)} h`}
        </span>
      </div>
      {error && (
        <p role="alert" className="pt-0.5 text-xs text-red-700 print:hidden">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1–5 scale used for daily ratings and the manager's performance index
// ---------------------------------------------------------------------------

export function Scale({
  label,
  value,
  onChange,
  disabled,
  size = "sm",
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  size?: "sm" | "lg";
}) {
  const dot =
    size === "lg"
      ? "size-9 text-base rounded-md print:size-6 print:text-[10px]"
      : "size-6 text-[11px] rounded-full print:size-4 print:text-[8px]";
  return (
    <div role="radiogroup" aria-label={label} className={`flex ${size === "lg" ? "gap-2" : "gap-1"}`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const selected = value === n;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${label}: ${n} of 5`}
            disabled={disabled}
            // Clicking the selected value again clears it.
            onClick={() => onChange(selected ? null : n)}
            className={`grid shrink-0 place-items-center border border-neutral-800 font-semibold tabular-nums transition-colors ${dot} ${
              selected ? "bg-neutral-900 text-white" : "bg-white text-neutral-700 enabled:hover:bg-neutral-100"
            } disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900`}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}
