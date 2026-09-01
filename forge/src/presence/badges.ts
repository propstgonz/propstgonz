import type { Client } from "discord.js";
import { log } from "../lib/log.js";

// Discord serves badge art from fixed icon hashes; there is no API that maps
// flags to them, so they are pinned here. A rotated hash 404s and that badge
// is skipped rather than rendering a broken image.
const BADGE_ICONS: Record<string, string> = {
  Staff: "5e74e9b61934fc1f67c65515d1f7e60d",
  Partner: "3f9748e53446a137a052f3454e2de41e",
  Hypesquad: "bf01d1073931f921909045f3a39fd264",
  BugHunterLevel1: "2717692c7dca7289b35297368a940dd0",
  HypeSquadOnlineHouse1: "8a88d63823d8a71cd5e390baa45efa02",
  HypeSquadOnlineHouse2: "011940fd013da3f7fb926e4a1cd2e618",
  HypeSquadOnlineHouse3: "3aa41de486fa12454c3761e8e223442e",
  PremiumEarlySupporter: "7060786766c9c840eb3019e725d2b358",
  BugHunterLevel2: "848f79194d4be5ff5f81505cbd0ce1e6",
  VerifiedDeveloper: "6df5892e0f35b051f8b61eace34f4967",
  CertifiedModerator: "fee1624003e2fee35cb398e125dc479b",
  ActiveDeveloper: "6bdc42827a38498929a4920da12695d9",
};

const iconCache = new Map<string, string>();

async function iconDataUri(hash: string): Promise<string | null> {
  const cached = iconCache.get(hash);
  if (cached) return cached;
  const res = await fetch(`https://cdn.discordapp.com/badge-icons/${hash}.png`);
  if (!res.ok) {
    log("badges", `icon ${hash} unavailable (HTTP ${res.status}), skipping`);
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const uri = `data:image/png;base64,${buf.toString("base64")}`;
  iconCache.set(hash, uri);
  return uri;
}

export async function fetchBadges(client: Client, userId: string): Promise<string[]> {
  const user = await client.users.fetch(userId, { force: true });
  const flags = user.flags?.toArray() ?? [];
  log("badges", `public flags: ${flags.join(", ") || "none"}`);

  const uris: string[] = [];
  for (const flag of flags) {
    const hash = BADGE_ICONS[flag];
    if (!hash) continue;
    const uri = await iconDataUri(hash);
    if (uri) uris.push(uri);
  }
  return uris;
}
