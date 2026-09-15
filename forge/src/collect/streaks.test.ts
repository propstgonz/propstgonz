import assert from "node:assert/strict";
import test from "node:test";
import { contributionWindows } from "./contributions.js";
import { computeStreaks } from "./streaks.js";

test("windows are contiguous whole days and cover today", () => {
  const windows = contributionWindows(new Date("2018-11-01T22:52:21Z"), new Date());
  const today = new Date().toLocaleDateString("en-CA");

  for (const [i, w] of windows.entries()) {
    assert.equal(w.from.toLocaleTimeString("en-GB"), "00:00:00", `window ${i} starts mid-day`);
    const nextFrom = windows[i + 1]?.from;
    if (nextFrom) assert.equal(nextFrom.getTime() - w.to.getTime(), 1, `gap after window ${i}`);
    assert.ok(w.to.getTime() - w.from.getTime() <= 366 * 86_400_000, `window ${i} exceeds a year`);
  }

  assert.equal(windows.at(-1)?.to.toLocaleDateString("en-CA"), today);
});

test("a run that reaches today survives today having no contributions yet", () => {
  const today = new Date().toLocaleDateString("en-CA");
  const day = (offset: number, count: number) => {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() + offset);
    return { date: d.toLocaleDateString("en-CA"), count };
  };

  const summary = computeStreaks({
    fetchedAt: new Date().toISOString(),
    firstDate: day(-3, 0).date,
    days: [day(-3, 0), day(-2, 4), day(-1, 2), day(0, 0)],
  });

  assert.equal(summary.currentStreak, 2);
  assert.deepEqual(summary.currentStreakRange, { from: day(-2, 0).date, to: day(-1, 0).date });
  assert.equal(summary.longestStreak, 2);
  assert.equal(summary.totalContributions, 6);
});

test("a zero on a past day ends the current streak", () => {
  const summary = computeStreaks({
    fetchedAt: "2026-09-15T02:00:00.000Z",
    firstDate: "2026-09-12",
    days: [
      { date: "2026-09-12", count: 9 },
      { date: "2026-09-13", count: 0 },
      { date: "2026-09-14", count: 2 },
    ],
  });

  assert.equal(summary.currentStreak, 1);
  assert.equal(summary.longestStreak, 1);
});
