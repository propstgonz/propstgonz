import { z } from "zod";
import { githubClient } from "../lib/github-graphql.js";
import { log } from "../lib/log.js";
import { readStateJson, writeStateJson } from "../lib/state.js";

const RepoSchema = z.object({
  nameWithOwner: z.string(),
  sshUrl: z.string(),
  defaultBranchRef: z.object({ name: z.string() }).nullable(),
  pushedAt: z.string().nullable(),
  isPrivate: z.boolean(),
});
export type Repo = z.infer<typeof RepoSchema>;

const PageSchema = z.object({
  viewer: z.object({
    createdAt: z.string(),
    repositories: z.object({
      nodes: z.array(RepoSchema),
      pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
    }),
  }),
});

const QUERY = /* GraphQL */ `
  query Repos($after: String) {
    viewer {
      createdAt
      repositories(
        first: 50
        after: $after
        ownerAffiliations: OWNER
        isFork: false
        privacy: null
      ) {
        nodes {
          nameWithOwner
          sshUrl
          isPrivate
          pushedAt
          isArchived
          defaultBranchRef { name }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const RawNodeSchema = RepoSchema.extend({ isArchived: z.boolean() });

const ReposStateSchema = z.object({
  fetchedAt: z.string(),
  accountCreatedAt: z.string(),
  repos: z.array(RepoSchema),
});
export type ReposState = z.infer<typeof ReposStateSchema>;

/**
 * Fetches the full list of owned, non-fork repositories, excluding archived ones.
 * This is the filtering that keeps forked/vendored code out of the language bar.
 */
export async function collectRepos(): Promise<ReposState> {
  const client = githubClient();
  const repos: Repo[] = [];
  let after: string | null = null;
  let accountCreatedAt = "";

  for (;;) {
    const raw = await client.request(QUERY, { after });
    const page = PageSchema.parse({
      viewer: {
        createdAt: (raw as { viewer: { createdAt: string } }).viewer.createdAt,
        repositories: (raw as { viewer: { repositories: unknown } }).viewer.repositories,
      },
    });
    accountCreatedAt = page.viewer.createdAt;

    const nodesRaw = (raw as {
      viewer: { repositories: { nodes: unknown[] } };
    }).viewer.repositories.nodes;

    for (const node of nodesRaw) {
      const parsed = RawNodeSchema.parse(node);
      if (parsed.isArchived) continue;
      repos.push({
        nameWithOwner: parsed.nameWithOwner,
        sshUrl: parsed.sshUrl,
        defaultBranchRef: parsed.defaultBranchRef,
        pushedAt: parsed.pushedAt,
        isPrivate: parsed.isPrivate,
      });
    }

    if (!page.viewer.repositories.pageInfo.hasNextPage) break;
    after = page.viewer.repositories.pageInfo.endCursor;
  }

  log("collect:repos", `${repos.length} owned, non-fork, non-archived repositories`);

  const state: ReposState = { fetchedAt: new Date().toISOString(), accountCreatedAt, repos };
  writeStateJson("repos.json", state);
  return state;
}

export function loadReposState(): ReposState | null {
  return readStateJson("repos.json", ReposStateSchema);
}
