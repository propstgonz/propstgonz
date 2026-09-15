import { z } from "zod";
import { githubClient } from "../lib/github-graphql.js";
import { log } from "../lib/log.js";
import { readStateJson, writeStateJson } from "../lib/state.js";

const DaySchema = z.object({ date: z.string(), contributionCount: z.number() });

const YearResponseSchema = z.object({
  viewer: z.object({
    contributionsCollection: z.object({
      contributionCalendar: z.object({
        totalContributions: z.number(),
        weeks: z.array(z.object({ contributionDays: z.array(DaySchema) })),
      }),
    }),
  }),
});

const QUERY = /* GraphQL */ `
  query ContributionsInRange($from: DateTime!, $to: DateTime!) {
    viewer {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
      }
    }
  }
`;

const ContributionsStateSchema = z.object({
  fetchedAt: z.string(),
  firstDate: z.string(),
  totalContributions: z.number(),
  days: z.array(z.object({ date: z.string(), count: z.number() })),
});
export type ContributionsState = z.infer<typeof ContributionsStateSchema>;

export type Window = { from: Date; to: Date };

function startOfDay(date: Date): Date {
  return new Date(`${date.toLocaleDateString("en-CA")}T00:00:00`);
}

function endOfDay(date: Date): Date {
  const next = startOfDay(date);
  next.setDate(next.getDate() + 1);
  return new Date(next.getTime() - 1);
}

/**
 * One window per calendar year, which is how GitHub itself slices the
 * contribution graph — the year tabs on a profile are exactly these ranges.
 * A range that straddles two years makes GitHub stitch two precomputed
 * calendars together and it drops days at the seam; the previous rolling
 * 365-day windows hit that seam on every run and additionally left a 24h hole
 * between consecutive windows. Every boundary is local midnight so no day is
 * ever counted in half.
 */
export function contributionWindows(accountCreatedAt: Date, now: Date): Window[] {
  const first = startOfDay(accountCreatedAt);
  const last = endOfDay(now);
  const windows: Window[] = [];

  for (let year = first.getFullYear(); year <= last.getFullYear(); year += 1) {
    windows.push({
      from: year === first.getFullYear() ? first : new Date(year, 0, 1),
      to: year === last.getFullYear() ? last : new Date(year, 11, 31, 23, 59, 59, 999),
    });
  }
  return windows;
}

/**
 * The GraphQL contributionsCollection is the only source that matches GitHub's
 * own contribution graph exactly: it includes private repos, PRs, and issues,
 * none of which the REST events API or SSH access can see.
 */
export async function collectContributions(accountCreatedAt: string): Promise<ContributionsState> {
  const client = githubClient();
  const byDate = new Map<string, number>();
  let totalContributions = 0;

  for (const window of contributionWindows(new Date(accountCreatedAt), new Date())) {
    const raw = await client.request(QUERY, {
      from: window.from.toISOString(),
      to: window.to.toISOString(),
    });
    const calendar = YearResponseSchema.parse(raw).viewer.contributionsCollection
      .contributionCalendar;

    totalContributions += calendar.totalContributions;
    for (const week of calendar.weeks) {
      for (const day of week.contributionDays) {
        byDate.set(day.date, day.contributionCount);
      }
    }
  }

  const days = [...byDate]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const summed = days.reduce((sum, d) => sum + d.count, 0);
  if (summed !== totalContributions) {
    throw new Error(
      `contribution calendar is inconsistent: days sum to ${summed} but GitHub reports ${totalContributions}`,
    );
  }

  log("collect:contributions", `${days.length} days, ${totalContributions} contributions`);

  const state: ContributionsState = {
    fetchedAt: new Date().toISOString(),
    firstDate: days[0]?.date ?? accountCreatedAt,
    totalContributions,
    days,
  };
  writeStateJson("contributions.json", state);
  return state;
}

export function loadContributionsState(): ContributionsState | null {
  return readStateJson("contributions.json", ContributionsStateSchema);
}
