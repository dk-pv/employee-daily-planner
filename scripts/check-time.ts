// Self-check for the 12-hour <-> stored 24-hour conversion. Run: npx tsx scripts/check-time.ts
import assert from "node:assert/strict";
import { formatDateTime, formatTime12, from12h, to12h } from "../lib/utils";

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
console.log("time conversion: all checks passed");
