import { readFileSync, writeFileSync, renameSync } from "node:fs";

const START = "<!-- FORGE:START -->";
const END = "<!-- FORGE:END -->";

/**
 * Replaces the managed block in place. The `?v=` cache buster on the picture
 * sources (added by the caller via `version`) is not cosmetic: GitHub's Camo
 * image proxy caches aggressively, and without a changing URL the README
 * would keep showing yesterday's numbers indefinitely.
 */
export function injectReadme(path: string, block: string): boolean {
  const original = readFileSync(path, "utf8");
  const start = original.indexOf(START);
  const end = original.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`README markers ${START} / ${END} missing or out of order in ${path}`);
  }
  const next =
    original.slice(0, start + START.length) + "\n" + block.trim() + "\n" + original.slice(end);
  if (next === original) return false;
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, next, "utf8");
  renameSync(tmp, path);
  return true;
}

export function buildBlock(version: string, assetsBase: string, widgetsBase: string): string {
  const picture = (name: string, alt: string, width: string) => `
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="${assetsBase}/${name}-dark.svg?v=${version}" />
  <img src="${assetsBase}/${name}-light.svg?v=${version}" alt="${alt}" width="${width}" />
</picture>`;

  return `<p><img src="${widgetsBase}/discord.svg" alt="Discord status" width="360" /></p>
<h2>My GitHub statistics</h2>
${picture("streak", "Contribution streak", "95%")}
${picture("langs", "Language usage across all my repositories", "95%")}
<sub>Rendered by <a href="./forge">forge/</a> — self-hosted, updated daily at 04:00 CET. No Vercel, no Heroku, no third parties.</sub>`;
}
