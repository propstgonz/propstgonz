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

/**
 * The GraphQL contributionsCollection is the only source that matches GitHub's
 * own contribution graph exactly: it includes private repos, PRs, and issues,
 * none of which the REST events API or SSH access can see. contributionCalendar
 * is capped at one year per query, so we walk year by year from account creation.
 */
export async function collectContributions(accountCreatedAt: string): Promise<ContributionsState> {
  const client = githubClient();
  const start = new Date(accountCreatedAt);
  const now = new Date();
  const days: { date: string; count: number }[] = [];

  let from = start;
  while (from < now) {
    const to = new Date(Math.min(from.getTime() + 365 * 24 * 60 * 60 * 1000, now.getTime()));
    const raw = await client.request(QUERY, { from: from.toISOString(), to: to.toISOString() });
    const parsed = YearResponseSchema.parse(raw);
    for (const week of parsed.viewer.contributionsCollection.contributionCalendar.weeks) {
      for (const day of week.contributionDays) {
        days.push({ date: day.date, count: day.contributionCount });
      }
    }
    from = new Date(to.getTime() + 24 * 60 * 60 * 1000);
  }

  // Dedup by date (year windows can overlap by a day) and sort chronologically.
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
