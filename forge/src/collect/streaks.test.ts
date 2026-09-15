import assert from "node:assert/strict";
import test from "node:test";
import { contributionWindows } from "./contributions.js";
import type { ContributionsState } from "./contributions.js";
import { computeStreaks } from "./streaks.js";

const utcDate = (d: Date): string => d.toISOString().slice(0, 10);

const shift = (days: number): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return utcDate(d);
};

const stateOf = (days: { date: string; count: number }[]): ContributionsState => ({
  fetchedAt: new Date().toISOString(),
  firstDate: days[0]?.date ?? "",
  totalContributions: days.reduce((sum, d) => sum + d.count, 0),
  days,
});

test("windows are whole UTC calendar years, contiguous, ending with today", () => {
  const windows = contributionWindows(
    new Date("2018-11-01T22:52:21Z"),
    new Date("2026-09-15T04:00:00Z"),
  );

  assert.equal(windows.length, 9);
  assert.equal(windows[0]?.from.toISOString(), "2018-11-01T00:00:00.000Z");
  assert.equal(windows.at(-1)?.to.toISOString(), "2026-09-15T23:59:59.999Z");

  for (const [i, w] of windows.entries()) {
    assert.equal(w.from.getUTCHours(), 0);
    assert.equal(w.from.getUTCMinutes(), 0);
    assert.equal(w.from.getUTCFullYear(), w.to.getUTCFullYear());
    const next = windows[i + 1];
    if (next) assert.equal(next.from.getTime() - w.to.getTime(), 1);
  }
});

test("a year seam never puts the same UTC day in two windows", () => {
  const windows = contributionWindows(
    new Date("2018-11-01T22:52:21Z"),
    new Date("2026-09-15T04:00:00Z"),
  );
  const seen = new Set<string>();

  for (const w of windows) {
    const first = utcDate(w.from);
    const last = utcDate(w.to);
    assert.ok(!seen.has(first), `${first} appears in two windows`);
    assert.ok(!seen.has(last), `${last} appears in two windows`);
    seen.add(first).add(last);
  }
});

test("a full run through today counts every day", () => {
  const days = [-4, -3, -2, -1, 0].map((offset) => ({ date: shift(offset), count: 2 }));
  const summary = computeStreaks(stateOf(days));

  assert.equal(summary.currentStreak, 5);
  assert.equal(summary.longestStreak, 5);
  assert.equal(summary.currentStreakRange?.to, shift(0));
  assert.equal(summary.asOf, shift(0));
});

test("today at zero does not break the streak, a past zero does", () => {
  const alive = computeStreaks(
    stateOf([
      { date: "2026-01-01", count: 4 },
      { date: shift(-1), count: 3 },
      { date: shift(0), count: 0 },
    ]),
  );
  assert.equal(alive.currentStreak, 2);
  assert.equal(alive.currentStreakRange?.to, shift(-1));

  const broken = computeStreaks(
    stateOf([
      { date: "2026-09-12", count: 9 },
      { date: "2026-09-13", count: 0 },
      { date: "2026-09-14", count: 2 },
    ]),
  );
  assert.equal(broken.currentStreak, 1);
  assert.equal(broken.longestStreak, 1);
});

test("total comes from GitHub's own figure, not a re-sum", () => {
  const summary = computeStreaks({
    fetchedAt: new Date().toISOString(),
    firstDate: "2026-09-01",
    totalContributions: 1519,
    days: [{ date: "2026-09-01", count: 3 }],
  });

  assert.equal(summary.totalContributions, 1519);
});
