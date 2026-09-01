import {
  ActivityType,
  Client,
  GatewayIntentBits,
  Partials,
  type PresenceStatus,
  type User,
} from "discord.js";
import { readSecret } from "../lib/secrets.js";
import { log } from "../lib/log.js";

export type Presence = {
  status: PresenceStatus | "unknown";
  activity: string | null;
  avatarDataUri: string | null;
  displayName: string;
  updatedAt: string;
};

const STALE_MS = 60_000;
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
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Connects to the Discord Gateway and tracks presence for a single user ID.
 * Discord has no REST endpoint for presence -- the Gateway with the
 * GUILD_PRESENCES intent, and a shared guild with the bot, are the only way.
 * Returns a getter that degrades to "unknown" if the gateway has gone quiet,
 * so the widget never claims "offline" when it actually just lost connection.
 */
export function startGateway(userId: string, onChange: (p: Presence) => void): () => Presence {
  let current = initialPresence();
  let lastSeen = 0;

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildPresences,
    ],
    partials: [Partials.GuildMember, Partials.User],
  });

  const publish = (p: Presence) => {
    current = p;
    lastSeen = Date.now();
    onChange(p);
  };

  client.on("presenceUpdate", (_old, next) => {
    if (next.userId !== userId) return;
    void (async () => {
      const activityObj = next.activities.find((a) => a.type !== ActivityType.Custom);
      const customState = next.activities.find((a) => a.type === ActivityType.Custom)?.state ?? null;
      publish({
        status: next.status,
        activity: activityObj ? activityObj.name : customState,
        avatarDataUri: await fetchAvatarDataUri(next.user),
        displayName: next.user?.globalName ?? next.user?.username ?? "propstgonz",
        updatedAt: new Date().toISOString(),
      });
    })();
  });

  client.once("clientReady", () => log("gateway", "connected to discord"));
  client.on("error", (err) => log("gateway", `client error: ${err.message}`));

  // A bad or revoked token must degrade the widget to "unknown", not crash the
  // HTTP server that also answers /healthz and /discord.svg.
  client.login(readSecret("discord_bot_token")).catch((err: Error) => {
    log("gateway", `login failed, presence will report "unknown": ${err.message}`);
  });

  return () => {
    if (current.status !== "unknown" && Date.now() - lastSeen > STALE_MS) {
      return { ...current, status: "unknown" };
    }
    return current;
  };
}
