import type { ContributionsState } from "./contributions.js";

type DateRange = { from: string; to: string };

export type StreakSummary = {
  totalContributions: number;
  totalRange: DateRange;
  currentStreak: number;
  currentStreakRange: DateRange | null;
  longestStreak: number;
  longestStreakRange: DateRange | null;
  asOf: string;
};

/**
 * The current streak survives a zero on today, since the day isn't over yet;
 * it breaks only on a past day. `asOf` is a UTC date because that is the grid
 * the contribution calendar is bucketed on, and it travels with the summary so
 * rendering stays a pure function of this object.
 */
export function computeStreaks(state: ContributionsState): StreakSummary {
  const { days } = state;
  const asOf = new Date().toISOString().slice(0, 10);

  let longestStreak = 0;
  let longestStreakRange: DateRange | null = null;
  let run = 0;
  let runStart = "";

  for (const day of days) {
    if (day.count === 0) {
      run = 0;
      continue;
    }
    if (run === 0) runStart = day.date;
    run += 1;
    if (run > longestStreak) {
      longestStreak = run;
      longestStreakRange = { from: runStart, to: day.date };
    }
  }

  let currentStreak = 0;
  let currentStreakRange: DateRange | null = null;
  let currentEnd = "";

  for (const day of [...days].reverse()) {
    if (day.count === 0) {
      if (day.date === asOf) continue;
      break;
    }
    if (currentEnd === "") currentEnd = day.date;
    currentStreak += 1;
    currentStreakRange = { from: day.date, to: currentEnd };
  }

  return {
    totalContributions: state.totalContributions,
    totalRange: {
      from: days[0]?.date ?? state.firstDate,
      to: days[days.length - 1]?.date ?? state.firstDate,
    },
    currentStreak,
    currentStreakRange,
    longestStreak,
    longestStreakRange,
    asOf,
  };
}
