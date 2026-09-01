import {
  ActivityType,
  Client,
  GatewayIntentBits,
  Partials,
  type Presence as DiscordPresence,
  type PresenceStatus,
  type User,
} from "discord.js";
import { fetchBadges } from "./badges.js";
import { log } from "../lib/log.js";

export type Presence = {
  status: PresenceStatus | "unknown";
  activity: string | null;
  avatarDataUri: string | null;
  displayName: string;
  badges: string[];
  updatedAt: string;
};

const RESYNC_MS = 5 * 60_000;
const avatarCache = new Map<string, string>();

async function fetchAvatarDataUri(user: User | null | undefined): Promise<string | null> {
  if (!user) return null;
  const url = user.displayAvatarURL({ extension: "png", size: 128 });
  const cached = avatarCache.get(url);
  if (cached) return cached;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const dataUri = `data:image/png;base64,${buf.toString("base64")}`;
    avatarCache.set(url, dataUri);
    return dataUri;
  } catch {
    return null;
  }
}

function initialPresence(): Presence {
  return {
    status: "unknown",
    activity: null,
    avatarDataUri: null,
    displayName: "propstgonz",
    badges: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Connects to the Discord Gateway and tracks presence for a single user ID.
 * Discord has no REST endpoint for presence -- the Gateway with the
 * GUILD_PRESENCES intent, and a shared guild with the bot, are the only way.
 * Returns a getter that degrades to "unknown" only when the gateway itself is
 * not connected, so the widget never claims "offline" when it actually just
 * lost connection -- and never claims "unknown" just because the user hasn't
 * changed status in a while, which is the normal case, not a stale one.
 */
export function startGateway(userId: string, onChange: (p: Presence) => void): () => Presence {
  let current = initialPresence();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildPresences,
    ],
    partials: [Partials.GuildMember, Partials.User],
  });

  let badges: string[] = [];

  const publish = (p: Presence) => {
    current = p;
    onChange(p);
  };

  const publishFromDiscordPresence = async (discordPresence: DiscordPresence) => {
    const activityObj = discordPresence.activities.find((a) => a.type !== ActivityType.Custom);
    const customState =
      discordPresence.activities.find((a) => a.type === ActivityType.Custom)?.state ?? null;
    publish({
      status: discordPresence.status,
      activity: activityObj ? activityObj.name : customState,
      avatarDataUri: await fetchAvatarDataUri(discordPresence.user),
      displayName: discordPresence.user?.globalName ?? discordPresence.user?.username ?? "propstgonz",
      badges,
      updatedAt: new Date().toISOString(),
    });
  };

  // Kept off the presenceUpdate path: badges change far more rarely than status.
  const refreshBadges = async () => {
    badges = await fetchBadges(client, userId).catch((err: Error) => {
      log("gateway", `badge refresh failed, keeping previous: ${err.message}`);
      return badges;
    });
  };

  const syncFromCache = (): boolean => {
    const found = client.guilds.cache
      .map((guild) => guild.presences.cache.get(userId))
      .find((p): p is DiscordPresence => p !== undefined);
    if (!found) return false;
    void publishFromDiscordPresence(found);
    return true;
  };

  client.on("presenceUpdate", (_old, next) => {
    if (next.userId !== userId) return;
    void publishFromDiscordPresence(next);
  });

  // presenceUpdate only fires on a change, so read the initial cached presence.
  client.once("clientReady", () => {
    void (async () => {
      const guilds = client.guilds.cache;
      log("gateway", `connected, tracking ${userId}`);
      log("gateway", `${guilds.size} guild(s): ${guilds.map((g) => g.name).join(", ") || "NONE"}`);
      await refreshBadges();
      if (syncFromCache()) return;

      for (const guild of guilds.values()) {
        const member = await guild.members.fetch(userId).catch(() => null);
        log(
          "gateway",
          member
            ? `${guild.name}: member found, but no presence cached (offline or invisible?)`
            : `${guild.name}: ${userId} is NOT a member of this guild`,
        );
      }
    })();
  });
  client.on("error", (err) => log("gateway", `client error: ${err.message}`));

  setInterval(() => {
    if (!client.isReady()) return;
    void refreshBadges().then(() => syncFromCache());
  }, RESYNC_MS);

  // A bad or revoked token must degrade the widget to "unknown", not crash the
  // HTTP server that also answers /healthz and /discord.svg.
  const token = process.env["DISCORD_BOT_TOKEN"];
  if (!token) throw new Error("DISCORD_BOT_TOKEN is not set; provide it in .env");
  client.login(token).catch((err: Error) => {
    log("gateway", `login failed, presence will report "unknown": ${err.message}`);
  });

  return () => (client.isReady() ? current : { ...current, status: "unknown" });
}
