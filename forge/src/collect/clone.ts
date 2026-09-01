import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { git } from "../lib/git.js";
import { log, logError } from "../lib/log.js";
import { statePath } from "../lib/state.js";
import type { Repo } from "./repos.js";

function repoDirName(nameWithOwner: string): string {
  return nameWithOwner.replace("/", "__");
}

export function repoDirFor(nameWithOwner: string): string {
  return statePath("repos", repoDirName(nameWithOwner));
}

/**
 * Clones or refreshes each repo into state/repos/<owner>__<name>. Repos whose
 * pushedAt hasn't changed since the last run are skipped entirely. Repos that
 * are no longer in the current list are pruned so the cache doesn't grow forever.
 * A single repo failing to clone is logged and skipped, not fatal to the run.
 */
export async function syncClones(
  repos: Repo[],
  previousPushedAt: Map<string, string>,
): Promise<{ synced: string[]; failed: string[]; unchanged: string[] }> {
  const reposRoot = statePath("repos");
  mkdirSync(reposRoot, { recursive: true });

  const synced: string[] = [];
  const failed: string[] = [];
  const unchanged: string[] = [];
  const keep = new Set(repos.map((r) => repoDirName(r.nameWithOwner)));

  for (const repo of repos) {
    const dir = repoDirFor(repo.nameWithOwner);
    const prev = previousPushedAt.get(repo.nameWithOwner);
    if (prev && repo.pushedAt && prev === repo.pushedAt && existsSync(dir)) {
      unchanged.push(repo.nameWithOwner);
      continue;
    }
    try {
      if (existsSync(join(dir, ".git"))) {
        await git(["fetch", "--depth=1", "origin"], dir);
        await git(["reset", "--hard", "origin/HEAD"], dir);
      } else {
        rmSync(dir, { recursive: true, force: true });
        await git(["clone", "--depth=1", "--single-branch", repo.sshUrl, dir]);
      }
      synced.push(repo.nameWithOwner);
    } catch (err) {
      logError("collect:clone", `skipping ${repo.nameWithOwner}`, err);
      failed.push(repo.nameWithOwner);
    }
  }

  // Prune directories for repos no longer owned (deleted, renamed, or now a fork/archived).
  for (const entry of readdirSync(reposRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && !keep.has(entry.name)) {
      rmSync(join(reposRoot, entry.name), { recursive: true, force: true });
      log("collect:clone", `pruned stale clone ${entry.name}`);
    }
  }

  log(
    "collect:clone",
    `${synced.length} synced, ${unchanged.length} unchanged, ${failed.length} failed`,
  );
  return { synced, failed, unchanged };
}
