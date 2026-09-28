"use client";

import { useState } from "react";
import { formatTime12, from12h, to12h, type Time12 } from "@/lib/utils";

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

const part =
  "min-w-0 cursor-pointer appearance-none bg-transparent px-1 py-[3px] text-center text-[13.5px] leading-5 tabular-nums text-neutral-900 " +
  "rounded hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900 " +
  "disabled:cursor-default disabled:hover:bg-transparent pointer-coarse:px-2";

/**
 * 12-hour time picker (Hour / Minute / AM-PM) built from native selects, so it works with the
 * keyboard, opens the platform picker on phones and can never be clipped by the planner cards.
 * `value` is the stored 24-hour "HH:MM" (or ""); onChange only reports a complete time or "".
 */
export function TimePicker({
  value,
  onChange,
  label,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  invalid?: boolean;
}) {
  // Local parts keep a half-picked time (e.g. hour chosen, AM/PM not yet) without storing it.
  const [parts, setParts] = useState<Time12>(() => to12h(value));
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    // The form changed the value from outside (e.g. switching reports): follow it.
    setSeen(value);
    if (value !== from12h(parts)) setParts(to12h(value));
  }

  function update(patch: Partial<Time12>) {
    const next = { ...parts, ...patch };
    if (patch.hour && !next.minute) next.minute = "00"; // most times are on the hour
    setParts(next);
    const stored = from12h(next);
    setSeen(stored);
    if (stored !== value) onChange(stored);
  }

  // Something picked but not a complete time yet (e.g. no AM/PM): flag it, since it isn't stored.
  const incomplete = !!(parts.hour || parts.minute || parts.period) && !from12h(parts);
  const flagged = !!invalid || incomplete;

  return (
    <div
      role="group"
      aria-label={`${label} time`}
      title={incomplete ? "Choose hour, minute and AM/PM to save this time" : undefined}
      className={`inline-flex shrink-0 items-center border-b ${flagged ? "border-red-600" : "border-neutral-400"} print:border-neutral-400`}
    >
      <select
        aria-label={`${label} hour`}
        aria-invalid={flagged || undefined}
        value={parts.hour}
        onChange={(e) => update({ hour: e.target.value })}
        className={`${part} w-[2.4em] print:hidden`}
      >
        <option value="">--</option>
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span aria-hidden className="text-neutral-400 print:hidden">
        :
      </span>
      <select
        aria-label={`${label} minute`}
        aria-invalid={flagged || undefined}
        value={parts.minute}
        onChange={(e) => update({ minute: e.target.value })}
        className={`${part} w-[2.4em] print:hidden`}
      >
        <option value="">--</option>
        {MINUTES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <select
        aria-label={`${label} AM or PM`}
        aria-invalid={flagged || undefined}
        value={parts.period}
        onChange={(e) => update({ period: e.target.value as Time12["period"] })}
        className={`${part} w-[2.9em] print:hidden`}
      >
        <option value="">--</option>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
      {/* On paper: plain text, or a blank line when no time was set. */}
      <span className="hidden min-h-[15px] min-w-[3.8rem] py-0.5 text-[10px] leading-snug tabular-nums print:inline-block">
        {formatTime12(value)}
      </span>
    </div>
  );
}
