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

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfUtcDay(date: Date): Date {
  return new Date(startOfUtcDay(date).getTime() + 86_400_000 - 1);
}

/**
 * One window per calendar year, cut on UTC midnight because that is the grid
 * GitHub buckets `contributionCalendar` days on. Local-midnight boundaries look
 * equivalent but land at 22:00/23:00Z, which puts the same UTC day at the end of
 * one window and the start of the next; the second copy only covers that last
 * hour, so it comes back near zero and overwrites the real count. That is how
 * whole days of contributions were disappearing.
 */
export function contributionWindows(accountCreatedAt: Date, now: Date): Window[] {
  const first = startOfUtcDay(accountCreatedAt);
  const last = endOfUtcDay(now);
  const windows: Window[] = [];

  for (let year = first.getUTCFullYear(); year <= last.getUTCFullYear(); year += 1) {
    windows.push({
      from: year === first.getUTCFullYear() ? first : new Date(Date.UTC(year, 0, 1)),
      to:
        year === last.getUTCFullYear()
          ? last
          : new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
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
    const from = window.from.toISOString();
    const to = window.to.toISOString();
    const raw = await client.request(QUERY, { from, to });
    const calendar = YearResponseSchema.parse(raw).viewer.contributionsCollection
      .contributionCalendar;

    const firstDay = from.slice(0, 10);
    const lastDay = to.slice(0, 10);
    let windowSum = 0;

    // GitHub pads the calendar out to whole Sunday-Saturday weeks, so the edge
    // weeks carry days from the neighbouring window at count 0.
    for (const week of calendar.weeks) {
      for (const day of week.contributionDays) {
        if (day.date < firstDay || day.date > lastDay) continue;
        byDate.set(day.date, day.contributionCount);
        windowSum += day.contributionCount;
      }
    }

    if (windowSum !== calendar.totalContributions) {
      throw new Error(
        `contribution calendar for ${firstDay}..${lastDay} is inconsistent: days sum to ${windowSum} but GitHub reports ${calendar.totalContributions}`,
      );
    }
    totalContributions += calendar.totalContributions;
  }

  const days = [...byDate]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

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
