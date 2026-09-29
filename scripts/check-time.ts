// Self-check for the 12-hour <-> stored 24-hour conversion and office hours. Run: npx tsx scripts/check-time.ts
import assert from "node:assert/strict";
import { calcOfficeTime, formatDateTime, formatMinutes, formatTime12, from12h, to12h, totalBreakMinutes } from "../lib/utils";

const cases: [string, string, string, "AM" | "PM", string][] = [
  // stored, hour, minute, period, display
  ["00:00", "12", "00", "AM", "12:00 AM"],
  ["00:30", "12", "30", "AM", "12:30 AM"],
  ["01:05", "01", "05", "AM", "01:05 AM"],
  ["11:59", "11", "59", "AM", "11:59 AM"],
  ["12:00", "12", "00", "PM", "12:00 PM"],
  ["13:00", "01", "00", "PM", "01:00 PM"],
  ["15:39", "03", "39", "PM", "03:39 PM"],
  ["23:59", "11", "59", "PM", "11:59 PM"],
];
for (const [stored, hour, minute, period, display] of cases) {
  assert.deepEqual(to12h(stored), { hour, minute, period }, `to12h(${stored})`);
  assert.equal(from12h({ hour, minute, period }), stored, `from12h(${hour}:${minute} ${period})`);
  assert.equal(formatTime12(stored), display, `formatTime12(${stored})`);
}
// Every minute of the day round-trips.
for (let m = 0; m < 24 * 60; m++) {
  const stored = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  assert.equal(from12h(to12h(stored)), stored);
}
// Incomplete or invalid input stores nothing.
assert.equal(from12h({ hour: "03", minute: "", period: "PM" }), "");
assert.equal(from12h({ hour: "03", minute: "39", period: "" }), "");
assert.deepEqual(to12h(""), { hour: "", minute: "", period: "" });
assert.deepEqual(to12h("24:00"), { hour: "", minute: "", period: "" });
assert.equal(formatTime12(null), "");
// Timestamps ("Last updated", "Reviewed", admin lists) use the same 12-hour style.
assert.equal(formatDateTime("2026-09-28T09:32:00Z", "Asia/Kolkata"), "28 Sep 2026, 03:02 PM");
assert.equal(formatDateTime("2026-09-27T18:35:00Z", "Asia/Kolkata"), "28 Sep 2026, 12:05 AM");
// Office hours: whole minutes, shown as "X h Y min" — never decimal hours.
const office = (inT: string, outT: string, ...breaks: (number | null)[]) => {
  const t = calcOfficeTime(inT, outT, totalBreakMinutes(...breaks));
  return [t.officeMinutes, totalBreakMinutes(...breaks), t.netMinutes].map((m) => (m == null ? null : formatMinutes(m)));
};
// 09:30 AM -> 06:45 PM is 9 h 15 min.
assert.deepEqual(office("09:30", "18:45", 30), ["9 h 15 min", "30 min", "8 h 45 min"]);
assert.deepEqual(office("09:30", "18:45", 15, 20, 10), ["9 h 15 min", "45 min", "8 h 30 min"]);
assert.deepEqual(office("09:30", "18:45", 30, null, 30), ["9 h 15 min", "1 h 00 min", "8 h 15 min"]);
assert.deepEqual(office("09:00", "18:00", null, 15, null), ["9 h 00 min", "15 min", "8 h 45 min"]);
assert.deepEqual(office("09:00", "18:00", null, null, null), ["9 h 00 min", "0 min", "9 h 00 min"]);
// AM/PM edges: 11:50 AM -> 12:10 PM, 12:00 AM -> 12:30 AM, 12:00 PM -> 11:59 PM.
assert.deepEqual(office("11:50", "12:10"), ["20 min", "0 min", "20 min"]);
assert.deepEqual(office("00:00", "00:30"), ["30 min", "0 min", "30 min"]);
assert.deepEqual(office("12:00", "23:59"), ["11 h 59 min", "0 min", "11 h 59 min"]);
// Breaks 10 + 45 + 20 = 1 h 15 min, net 8 h 00 min.
assert.deepEqual(office("09:30", "18:45", 10, 45, 20), ["9 h 15 min", "1 h 15 min", "8 h 00 min"]);
assert.equal(formatMinutes(65), "1 h 05 min");
// Impossible combinations are errors, not negative times.
assert.equal(calcOfficeTime("18:45", "09:30", 0).error, "OUT time must be after IN time.");
assert.equal(calcOfficeTime("09:00", "10:00", totalBreakMinutes(30, 20, 15)).error, "Breaks cannot be longer than the time between IN and OUT.");
assert.equal(calcOfficeTime("09:00", "10:00", 60).netMinutes, 0);
assert.equal(calcOfficeTime(null, "10:00", 0).officeMinutes, null);
console.log("time conversion + office hours: all checks passed");
