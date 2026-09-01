import { mkdirSync, writeFileSync } from "node:fs";
import { collectRepos, loadReposState } from "./collect/repos.js";
import { syncClones } from "./collect/clone.js";
import { collectLanguages } from "./collect/languages.js";
import { collectContributions } from "./collect/contributions.js";
import { computeStreaks } from "./collect/streaks.js";
import { renderLanguagesSvg } from "./render/languages.svg.js";
import { renderStreakSvg } from "./render/streak.svg.js";
import { verifySshAccess } from "./lib/git.js";
import { log, logError } from "./lib/log.js";
import { statePath } from "./lib/state.js";
import { publish } from "./publish.js";

export type PipelineOptions = {
  dryRun: boolean;
  only?: "languages" | "contributions";
};

export async function runPipeline(opts: PipelineOptions): Promise<void> {
  await verifySshAccess();

  const previousRepos = loadReposState();
  const previousPushedAt = new Map(
    (previousRepos?.repos ?? []).map((r) => [r.nameWithOwner, r.pushedAt ?? ""]),
  );

  const reposState = await collectRepos();

  let languagesState;
  if (!opts.only || opts.only === "languages") {
    await syncClones(reposState.repos, previousPushedAt);
    languagesState = await collectLanguages(reposState.repos);
  }

  let streaks;
  if (!opts.only || opts.only === "contributions") {
    const contributions = await collectContributions(reposState.accountCreatedAt);
    streaks = computeStreaks(contributions);
  }

  if (!languagesState || !streaks) {
    log("pipeline", `partial run (--only=${opts.only}), skipping render/publish`);
    return;
  }

  const svgs = {
    "langs-dark": renderLanguagesSvg(languagesState, "dark"),
    "langs-light": renderLanguagesSvg(languagesState, "light"),
    "streak-dark": renderStreakSvg(streaks, "dark"),
    "streak-light": renderStreakSvg(streaks, "light"),
  };

  const outDir = statePath("out");
  mkdirSync(outDir, { recursive: true });
  for (const [name, svg] of Object.entries(svgs)) {
    writeFileSync(`${outDir}/${name}.svg`, svg, "utf8");
  }
  log("pipeline", `rendered ${Object.keys(svgs).length} SVGs to ${outDir}`);

  if (opts.dryRun) {
    log("pipeline", "dry run: skipping publish");
    return;
  }

  try {
    await publish(svgs);
  } catch (err) {
    logError("pipeline", "publish failed", err);
    throw err;
  }
}
