import type { ContributionsState } from "./contributions.js";

export type StreakSummary = {
  totalContributions: number;
  totalRange: { from: string; to: string };
  currentStreak: number;
  currentStreakRange: { from: string; to: string } | null;
  longestStreak: number;
  longestStreakRange: { from: string; to: string } | null;
};

function todayLocalDate(): string {
  // TZ is set to Europe/Madrid at the container level so this cut matches the
  // reader's own contribution calendar on github.com.
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
}

/**
 * Reproduces the semantics of the reference streak widget: current streak
 * stays alive through "today" even if today has zero contributions yet,
 * since the day isn't over. It only breaks once a full day is skipped.
 */
export function computeStreaks(state: ContributionsState): StreakSummary {
  const days = state.days;
  const totalContributions = days.reduce((sum, d) => sum + d.count, 0);
  const totalRange = {
    from: days[0]?.date ?? state.firstDate,
    to: days[days.length - 1]?.date ?? state.firstDate,
  };

  let longestStreak = 0;
  let longestRange: { from: string; to: string } | null = null;
  let runStart: string | null = null;
  let runLength = 0;

  for (const day of days) {
    if (day.count > 0) {
      if (runLength === 0) runStart = day.date;
      runLength += 1;
      if (runLength > longestStreak) {
        longestStreak = runLength;
        longestRange = { from: runStart ?? day.date, to: day.date };
      }
    } else {
      runLength = 0;
      runStart = null;
    }
  }

  // Current streak: walk backwards from the last recorded day. If the most
  // recent day is today with zero contributions, skip it (the day isn't over)
  // and start counting from yesterday instead.
  let currentStreak = 0;
  let currentEnd: string | null = null;
  let currentStart: string | null = null;
  const today = todayLocalDate();

  for (let i = days.length - 1; i >= 0; i -= 1) {
    const day = days[i];
    if (!day) continue;
    if (day.count > 0) {
      currentStreak += 1;
      currentStart = day.date;
      if (currentEnd === null) currentEnd = day.date;
    } else if (day.date === today) {
      continue; // today not over yet; don't break the streak on it
    } else {
      break;
    }
  }

  const currentStreakRange =
    currentStreak > 0 && currentStart && currentEnd ? { from: currentStart, to: currentEnd } : null;

  return {
    totalContributions,
    totalRange,
    currentStreak,
    currentStreakRange,
    longestStreak,
    longestStreakRange: longestRange,
  };
}
