import Fastify from "fastify";
import { renderPresenceSvg } from "./render/presence.svg.js";
import { startGateway, type Presence } from "./presence/gateway.js";
import { log } from "./lib/log.js";
import type { ThemeName } from "./lib/theme.js";

const PORT = Number(process.env["PORT"] ?? 8787);
const USER_ID = process.env["DISCORD_USER_ID"];
if (!USER_ID) throw new Error("DISCORD_USER_ID is required");

const getPresence = startGateway(USER_ID, (p: Presence) => {
  log("server", `presence changed: ${p.status}`);
});

const app = Fastify({ logger: false });

app.get("/healthz", async () => ({ ok: true }));

app.get("/presence.json", async (_req, reply) => {
  reply.header("Cache-Control", "no-cache, max-age=0, must-revalidate");
  return getPresence();
});

app.get("/discord.svg", async (req, reply) => {
  const theme = (req.query as { theme?: string }).theme === "light" ? "light" : "dark";
  const presence = getPresence();
  const svg = renderPresenceSvg(presence, theme as ThemeName);
  reply
    .header("Content-Type", "image/svg+xml; charset=utf-8")
    .header("Cache-Control", "no-cache, max-age=0, must-revalidate")
    .header("ETag", `"${presence.status}-${presence.activity ?? ""}-${presence.updatedAt}"`)
    .send(svg);
});

app
  .listen({ port: PORT, host: "0.0.0.0" })
  .then(() => log("server", `listening on :${PORT}`))
  .catch((err: Error) => {
    log("server", `failed to start: ${err.message}`);
    process.exit(1);
  });
