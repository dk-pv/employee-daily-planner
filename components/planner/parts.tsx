"use client";

import type { ReactNode } from "react";
import { useFieldArray, useWatch, type Control, type UseFormRegister } from "react-hook-form";
import { calcNetOfficeHours, formatHours, sumHours } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Form shape: inputs hold strings; PlannerForm converts to the API shape.
// ---------------------------------------------------------------------------

export type CheckRow = { text: string; done: boolean };
export type FormValues = {
  topPriorities: CheckRow[];
  callsEmails: CheckRow[];
  personalTodo: CheckRow[];
  appointments: CheckRow[];
  dailySchedules: { time: string; text: string }[];
  tasks: { text: string; done: boolean; planned: string; worked: string }[];
  officeIn: string;
  officeOut: string;
  breakMinutes: string;
  productivity: number | null;
  mood: number | null;
  health: number | null;
};

export const MAX_ROWS = 50;

export const lineInput =
  "w-full min-w-0 border-0 border-b border-neutral-300 bg-transparent px-0.5 py-1 text-[13px] leading-5 text-neutral-900 " +
  "placeholder:text-neutral-300 focus:border-neutral-900 focus:outline-none disabled:text-neutral-900 " +
  "aria-invalid:border-red-600 aria-invalid:text-red-700 " +
  "print:py-0.5 print:text-[10.5px] print:placeholder:text-transparent";

/** Empty time inputs render Chrome's "--:--"; on paper they should look like a blank line. */
const blankOnPaper = (value: string | undefined) => (value ? "" : "print:text-transparent");

// ---------------------------------------------------------------------------
// Layout pieces
// ---------------------------------------------------------------------------

export function Section({
  title,
  disabled,
  className = "",
  children,
}: {
  title: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`break-inside-avoid rounded-lg border border-neutral-800 px-3 py-2.5 print:px-2.5 print:py-1.5 ${className}`}
    >
      <h2 className="mb-1.5 text-[11px] font-bold tracking-[0.14em] text-neutral-900 print:mb-1 print:text-[9.5px]">{title}</h2>
      {/* A disabled fieldset makes every control inside read-only in one place. */}
      <fieldset disabled={disabled} className="m-0 min-w-0 border-0 p-0">
        {children}
      </fieldset>
    </section>
  );
}

export function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 print:hidden"
    >
      <span aria-hidden className="text-sm leading-none">
        +
      </span>{" "}
      {children}
    </button>
  );
}

/** Text inputs can't wrap, so on paper a wrapped copy of the value replaces the input. */
function PrintText({ value }: { value: string | undefined }) {
  return (
    <span className="hidden min-h-[17px] min-w-0 flex-1 whitespace-pre-wrap break-words border-b border-neutral-300 py-0.5 text-[10.5px] leading-snug text-neutral-900 print:block">
      {value}
    </span>
  );
}

const textInput = `${lineInput} print:hidden`;

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title="Remove row"
      className="grid size-5 shrink-0 place-items-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800 focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 print:hidden"
    >
      <span aria-hidden>×</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Dynamic lists
// ---------------------------------------------------------------------------

type ListProps = {
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  readOnly: boolean;
  /** Adding/removing rows doesn't emit a value event in RHF, so lists report it explicitly. */
  onRowsChange: () => void;
};

export function CheckList({
  control,
  register,
  readOnly,
  onRowsChange,
  name,
  itemLabel,
  addLabel,
  numbered,
  round,
}: ListProps & {
  name: "topPriorities" | "callsEmails" | "personalTodo" | "appointments";
  itemLabel: string;
  addLabel: string;
  numbered?: boolean;
  round?: boolean;
}) {
  const { fields, append, remove } = useFieldArray({ control, name });
  const rows = useWatch({ control, name });
  return (
    <div>
      <ul>
        {fields.map((field, i) => (
          <li key={field.id} className="group flex items-center gap-2">
            <input
              type="checkbox"
              {...register(`${name}.${i}.done`)}
              aria-label={`${itemLabel} ${i + 1} ${round ? "marked" : "done"}`}
              className={`paper-check ${round ? "round" : ""}`}
            />
            <input
              {...register(`${name}.${i}.text`)}
              aria-label={`${itemLabel} ${i + 1}`}
              placeholder={numbered && !readOnly ? `${itemLabel} ${i + 1}` : undefined}
              maxLength={500}
              className={textInput}
            />
            <PrintText value={rows[i]?.text} />
            {!readOnly && (
              <RemoveButton
                onClick={() => {
                  remove(i);
                  onRowsChange();
                }}
                label={`Remove ${itemLabel.toLowerCase()} ${i + 1}`}
              />
            )}
          </li>
        ))}
      </ul>
      {!readOnly && fields.length < MAX_ROWS && (
        <AddButton
          onClick={() => {
            append({ text: "", done: false });
            onRowsChange();
          }}
        >
          {addLabel}
        </AddButton>
      )}
    </div>
  );
}

export function ScheduleList({ control, register, readOnly, onRowsChange }: ListProps) {
  const { fields, append, remove } = useFieldArray({ control, name: "dailySchedules" });
  const rows = useWatch({ control, name: "dailySchedules" });
  return (
    <div>
      <ul>
        {fields.map((field, i) => (
          <li key={field.id} className="group flex items-center gap-2">
            <input
              type="time"
              {...register(`dailySchedules.${i}.time`)}
              aria-label={`Schedule ${i + 1} time`}
              // max-content = the browser's own width for the locale's time format (12h adds AM/PM);
              // flex-basis wins over lineInput's w-full, so the time can't squeeze the text field.
              className={`${lineInput} shrink-0 grow-0 basis-[max-content] tabular-nums print:basis-[4.2rem] ${blankOnPaper(rows[i]?.time)}`}
            />
            <input
              {...register(`dailySchedules.${i}.text`)}
              aria-label={`Schedule ${i + 1}`}
              maxLength={500}
              className={textInput}
            />
            <PrintText value={rows[i]?.text} />
            {!readOnly && (
              <RemoveButton
                onClick={() => {
                  remove(i);
                  onRowsChange();
                }}
                label={`Remove schedule ${i + 1}`}
              />
            )}
          </li>
        ))}
      </ul>
      {!readOnly && fields.length < MAX_ROWS && (
        <AddButton
          onClick={() => {
            append({ time: "", text: "" });
            onRowsChange();
          }}
        >
          Add Schedule
        </AddButton>
      )}
    </div>
  );
}

const hoursInput = `${lineInput} text-center tabular-nums`;
const hoursOk = (s: string) => s.trim() === "" || (Number(s) >= 0 && Number(s) <= 24);

export function TaskTable({ control, register, readOnly, onRowsChange }: ListProps) {
  const { fields, append, remove } = useFieldArray({ control, name: "tasks" });
  const tasks = useWatch({ control, name: "tasks" });
  // Invalid entries are flagged on the input and left out of the live totals (the save is blocked anyway).
  const toNum = (s: string) => (s.trim() === "" || !hoursOk(s) ? null : Number(s));
  const totalPlanned = sumHours(tasks.map((t) => toNum(t.planned)));
  const totalWorked = sumHours(tasks.map((t) => toNum(t.worked)));
  const cols =
    "grid grid-cols-[15px_minmax(0,1fr)_3.5rem_3.5rem_1.25rem] items-center gap-x-2 print:grid-cols-[15px_minmax(0,1fr)_3rem_3rem]";

  return (
    <div>
      <div
        className={`${cols} border-b border-neutral-800 pb-1 text-[10px] font-bold tracking-[0.1em] text-neutral-600 print:text-[8.5px]`}
      >
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
              className="paper-check"
            />
            <input {...register(`tasks.${i}.text`)} aria-label={`Task ${i + 1}`} maxLength={500} className={textInput} />
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
      {!readOnly && fields.length < MAX_ROWS && (
        <AddButton
          onClick={() => {
            append({ text: "", done: false, planned: "", worked: "" });
            onRowsChange();
          }}
        >
          Add Task
        </AddButton>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2 print:mt-1">
        <Total label="TOTAL PLANNED" value={totalPlanned} />
        <Total label="TOTAL WORKED" value={totalWorked} />
      </div>
    </div>
  );
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-neutral-800 px-2.5 py-1.5 print:py-1">
      <span className="text-[10px] font-bold tracking-[0.1em] print:text-[8.5px]">{label}</span>
      <span className="whitespace-nowrap text-sm font-semibold tabular-nums print:text-[10.5px]" aria-live="polite">
        {formatHours(value)} h
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Office hours: IN / OUT / BREAK with live NET OFFICE HOURS
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
      <label className={row}>
        <span className={label}>IN</span>
        <input type="time" {...register("officeIn")} className={`${lineInput} tabular-nums ${blankOnPaper(officeIn)}`} />
      </label>
      <label className={row}>
        <span className={label}>OUT</span>
        <input
          type="time"
          {...register("officeOut")}
          className={`${lineInput} tabular-nums ${blankOnPaper(officeOut)}`}
          aria-invalid={!!net.error}
        />
      </label>
      <label className={row}>
        <span className={label}>BREAK</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={720}
          step={1}
          {...register("breakMinutes")}
          aria-invalid={breakInvalid}
          className={`${lineInput} tabular-nums`}
        />
        <span className="text-xs text-neutral-500 print:text-[9px]">min</span>
      </label>
      <div className="mt-1.5 flex items-center justify-between gap-2 rounded-md bg-neutral-100 px-2 py-1.5 print:mt-1 print:py-1">
        <span className="text-[10px] font-bold tracking-[0.1em] print:text-[8.5px]">NET OFFICE HOURS</span>
        <span className="text-sm font-semibold tabular-nums print:text-[10.5px]" aria-live="polite">
          {net.hours == null ? "—" : `${formatHours(net.hours)} h`}
        </span>
      </div>
      {error && (
        <p role="alert" className="pt-1 text-xs text-red-700 print:hidden">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1–5 scale used for daily ratings and the performance index
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
      ? "size-8 text-sm rounded-md print:size-6 print:text-[10px]"
      : "size-[1.3rem] text-[10px] rounded-full print:size-4 print:text-[8px]";
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
