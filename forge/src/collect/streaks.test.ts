import assert from "node:assert/strict";
import test from "node:test";
import { contributionWindows } from "./contributions.js";
import type { ContributionsState } from "./contributions.js";
import { computeStreaks } from "./streaks.js";

const localDate = (d: Date): string => d.toLocaleDateString("en-CA");

const stateOf = (days: { date: string; count: number }[]): ContributionsState => ({
  fetchedAt: new Date().toISOString(),
  firstDate: days[0]?.date ?? "",
  totalContributions: days.reduce((sum, d) => sum + d.count, 0),
  days,
});

test("windows are whole calendar years, contiguous, ending with today", () => {
  const now = new Date(2026, 8, 15, 4, 0, 0);
  const windows = contributionWindows(new Date("2018-11-01T22:52:21Z"), now);

  assert.equal(windows.length, 9);
  assert.equal(localDate(windows[0]!.from), "2018-11-01");
  assert.equal(localDate(windows.at(-1)!.to), "2026-09-15");

  for (const [i, w] of windows.entries()) {
    assert.equal(w.from.getHours() + w.from.getMinutes() + w.from.getSeconds(), 0);
    assert.equal(w.from.getFullYear(), w.to.getFullYear());
    assert.ok(w.to.getTime() - w.from.getTime() < 366 * 86_400_000);
    const next = windows[i + 1];
    if (next) assert.equal(next.from.getTime() - w.to.getTime(), 1);
  }
});

test("a full run through today counts every day", () => {
  const today = new Date();
  const days = [-4, -3, -2, -1, 0].map((offset) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    return { date: localDate(d), count: 2 };
  });

  const summary = computeStreaks(stateOf(days));

  assert.equal(summary.currentStreak, 5);
  assert.equal(summary.longestStreak, 5);
  assert.equal(summary.currentStreakRange?.to, localDate(today));
  assert.equal(summary.asOf, localDate(today));
});

test("today at zero does not break the streak, a past zero does", () => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const alive = computeStreaks(
    stateOf([
      { date: "2026-01-01", count: 4 },
      { date: localDate(yesterday), count: 3 },
      { date: localDate(today), count: 0 },
    ]),
  );
  assert.equal(alive.currentStreak, 2);
  assert.equal(alive.currentStreakRange?.to, localDate(yesterday));

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
    totalContributions: 1510,
    days: [{ date: "2026-09-01", count: 3 }],
  });

  assert.equal(summary.totalContributions, 1510);
});
