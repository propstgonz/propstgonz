import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { logError, log } from "../lib/log.js";
import { readStateJson, writeStateJson } from "../lib/state.js";
import { repoDirFor } from "./clone.js";
import type { Repo } from "./repos.js";

const run = promisify(execFile);

const LinguistLanguageSchema = z.object({
  size: z.number(),
  percentage: z.string().optional(),
});

// `github-linguist --json` output: { "<lang>": { size, percentage }, ... }
const LinguistOutputSchema = z.record(z.string(), LinguistLanguageSchema);

const LanguagesStateSchema = z.object({
  computedAt: z.string(),
  partial: z.boolean(),
  bytesByLanguage: z.record(z.string(), z.number()),
});
export type LanguagesState = z.infer<typeof LanguagesStateSchema>;

/**
 * Runs the actual github-linguist gem (the same tool GitHub uses) against each
 * local clone. Linguist applies GitHub's own vendored/generated/documentation
 * exclusions and honors .gitattributes -- this is what makes the resulting bar
 * match what GitHub would show for each repo, aggregated globally.
 */
export async function collectLanguages(repos: Repo[]): Promise<LanguagesState> {
  const bytesByLanguage: Record<string, number> = {};
  let anyFailed = false;

  for (const repo of repos) {
    const dir = repoDirFor(repo.nameWithOwner);
    try {
      const { stdout } = await run("github-linguist", ["--json", dir], {
        maxBuffer: 16 * 1024 * 1024,
      });
      const parsed = LinguistOutputSchema.parse(JSON.parse(stdout));
      for (const [language, info] of Object.entries(parsed)) {
        bytesByLanguage[language] = (bytesByLanguage[language] ?? 0) + info.size;
      }
    } catch (err) {
      logError("collect:languages", `linguist failed for ${repo.nameWithOwner}`, err);
      anyFailed = true;
    }
  }

  log("collect:languages", `${Object.keys(bytesByLanguage).length} languages across ${repos.length} repos`);

  const state: LanguagesState = {
    computedAt: new Date().toISOString(),
    partial: anyFailed,
    bytesByLanguage,
  };
  writeStateJson("languages.json", state);
  return state;
}

export function loadLanguagesState(): LanguagesState | null {
  return readStateJson("languages.json", LanguagesStateSchema);
}
