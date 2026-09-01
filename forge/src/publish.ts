import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git } from "./lib/git.js";
import { log } from "./lib/log.js";
import { statePath } from "./lib/state.js";
import { buildBlock, injectReadme } from "./readme.js";

const PROFILE_REPO = process.env["PROFILE_REPO"] ?? "";
const ASSETS_BRANCH = process.env["ASSETS_BRANCH"] ?? "assets";
const GITHUB_LOGIN = process.env["GITHUB_LOGIN"] ?? "";
const WIDGETS_BASE = process.env["WIDGETS_BASE"] ?? "https://widgets.baronette.es";

function assetsWorktree(): string {
  return statePath("assets-worktree");
}

function profileClone(): string {
  return statePath("profile");
}

async function ensureProfileClone(): Promise<string> {
  const dir = profileClone();
  if (existsSync(join(dir, ".git"))) {
    await git(["fetch", "origin"], dir);
  } else {
    mkdirSync(dir, { recursive: true });
    await git(["clone", PROFILE_REPO, dir]);
  }
  await git(["checkout", "main"], dir);
  await git(["reset", "--hard", "origin/main"], dir);
  return dir;
}

async function ensureAssetsWorktree(profileDir: string): Promise<string> {
  const dir = assetsWorktree();
  if (existsSync(join(dir, ".git"))) return dir;

  const remoteBranches = await git(["ls-remote", "--heads", "origin", ASSETS_BRANCH], profileDir);
  if (remoteBranches.trim().length > 0) {
    await git(["fetch", "origin", ASSETS_BRANCH], profileDir);
    await git(["worktree", "add", dir, `origin/${ASSETS_BRANCH}`, "-B", ASSETS_BRANCH], profileDir);
  } else {
    // First run: create the orphan branch with nothing in it, then check it out as a worktree.
    await git(["worktree", "add", "--detach", dir], profileDir);
    await git(["checkout", "--orphan", ASSETS_BRANCH], dir);
    await git(["rm", "-rf", "--quiet", "."], dir).catch(() => undefined);
    writeFileSync(join(dir, ".gitkeep"), "");
    await git(["add", "-A"], dir);
    await git(["-c", "user.name=readme-forge", "-c", "user.email=forge@propstgonz.dev", "commit", "-m", "assets: initialize branch"], dir);
    await git(["push", "origin", `HEAD:${ASSETS_BRANCH}`], dir);
  }
  return dir;
}

function sha8(files: string[]): string {
  const hash = createHash("sha256");
  for (const f of files.sort()) {
    if (existsSync(f)) hash.update(readFileSync(f));
  }
  return hash.digest("hex").slice(0, 8);
}

/**
 * Writes rendered SVGs into the `assets` orphan branch, commits only if bytes
 * changed, pushes, then rewrites the README's managed block on `main` to
 * point at the new commit-derived cache-busting version. Two separate pushes,
 * one function, because the README's version string depends on the assets
 * commit actually landing first.
 */
export async function publish(svgs: Record<string, string>): Promise<void> {
  const profileDir = await ensureProfileClone();
  const assetsDir = await ensureAssetsWorktree(profileDir);

  const writtenPaths: string[] = [];
  for (const [name, content] of Object.entries(svgs)) {
    const path = join(assetsDir, `${name}.svg`);
    writeFileSync(path, content, "utf8");
    writtenPaths.push(path);
  }

  await git(["add", "-A"], assetsDir);
  const status = await git(["status", "--porcelain"], assetsDir);
  if (status.trim().length === 0) {
    log("publish", "assets unchanged, skipping commit");
  } else {
    await git(
      ["-c", "user.name=readme-forge", "-c", "user.email=forge@propstgonz.dev", "commit", "-m", "assets: update rendered widgets"],
      assetsDir,
    );
    await git(["push", "origin", `HEAD:${ASSETS_BRANCH}`], assetsDir);
    log("publish", "pushed updated assets");
  }

  const version = sha8(writtenPaths);
  const assetsBase = `https://raw.githubusercontent.com/${GITHUB_LOGIN}/${GITHUB_LOGIN}/${ASSETS_BRANCH}`;
  const block = buildBlock(version, assetsBase, WIDGETS_BASE);
  const readmePath = join(profileDir, "README.md");
  const changed = injectReadme(readmePath, block);

  if (!changed) {
    log("publish", "README unchanged, skipping commit");
    return;
  }

  await git(["add", "README.md"], profileDir);
  await git(
    ["-c", "user.name=readme-forge", "-c", "user.email=forge@propstgonz.dev", "commit", "-m", `readme: refresh widgets (${version})`],
    profileDir,
  );
  await git(["push", "origin", "HEAD:main"], profileDir);
  log("publish", `pushed README update (${version})`);
}
