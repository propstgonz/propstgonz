import { z } from "zod";
import { githubClient } from "../lib/github-graphql.js";
import { log } from "../lib/log.js";
import { readStateJson, writeStateJson } from "../lib/state.js";

const DaySchema = z.object({ date: z.string(), contributionCount: z.number() });

const YearResponseSchema = z.object({
  viewer: z.object({
    contributionsCollection: z.object({
      contributionCalendar: z.object({
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
  days: z.array(z.object({ date: z.string(), count: z.number() })),
});
export type ContributionsState = z.infer<typeof ContributionsStateSchema>;

function localMidnight(date: Date): Date {
  return new Date(`${date.toLocaleDateString("en-CA")}T00:00:00`);
}

function addDays(date: Date, days: number): Date {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

/**
 * GitHub buckets contributions by calendar day, so a window that starts or ends
 * mid-day reports a partial count for that day. Anchoring every boundary to
 * local midnight keeps each day whole, and starting window N+1 exactly where N
 * ended closes the 24h hole the previous `to + 1 day` step left behind. 365 days
 * wide because GitHub rejects a range longer than a year.
 */
export function contributionWindows(accountCreatedAt: Date, now: Date): { from: Date; to: Date }[] {
  const end = addDays(localMidnight(now), 1);
  const windows: { from: Date; to: Date }[] = [];
  for (let from = localMidnight(accountCreatedAt); from < end; from = addDays(from, 365)) {
    const boundary = Math.min(addDays(from, 365).getTime(), end.getTime());
    windows.push({ from, to: new Date(boundary - 1) });
  }
  return windows;
}

/**
 * The GraphQL contributionsCollection is the only source that matches GitHub's
 * own contribution graph exactly: it includes private repos, PRs, and issues,
 * none of which the REST events API or SSH access can see. contributionCalendar
 * is capped at one year per query, so we walk year by year from account creation.
 */
export async function collectContributions(accountCreatedAt: string): Promise<ContributionsState> {
  const client = githubClient();
  const days: { date: string; count: number }[] = [];

  for (const window of contributionWindows(new Date(accountCreatedAt), new Date())) {
    const raw = await client.request(QUERY, {
      from: window.from.toISOString(),
      to: window.to.toISOString(),
    });
    const parsed = YearResponseSchema.parse(raw);
    for (const week of parsed.viewer.contributionsCollection.contributionCalendar.weeks) {
      for (const day of week.contributionDays) {
        days.push({ date: day.date, count: day.contributionCount });
      }
    }
  }

  const byDate = new Map(days.map((d) => [d.date, d.count]));
  const sortedDays = [...byDate.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  log("collect:contributions", `${sortedDays.length} days fetched since ${accountCreatedAt}`);

  const state: ContributionsState = {
    fetchedAt: new Date().toISOString(),
    firstDate: sortedDays[0]?.date ?? accountCreatedAt,
    days: sortedDays,
  };
  writeStateJson("contributions.json", state);
  return state;
}

export function loadContributionsState(): ContributionsState | null {
  return readStateJson("contributions.json", ContributionsStateSchema);
}
