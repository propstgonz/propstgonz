# forge/

Application source for the self-hosted infrastructure that renders the widgets in the root
`README.md`. The orchestration files that build and run it — `docker-compose.yml`, `Jenkinsfile`,
`docker/` — live at the repo root, one level up. See `../CLAUDE.md` for architecture rules and
conventions. This file is the operational setup checklist.

## One-time setup

1. **Root `.env`**
   ```bash
   cp .env.example .env
   ```
   Fill in `GITHUB_PAT` and `DISCORD_BOT_TOKEN` (see below), and adjust the rest if your setup
   differs from the defaults. `.env` is gitignored and read by `docker-compose.yml` for both
   services — this is the only file you edit to configure the stack.

2. **Discord bot**
   - Discord Developer Portal → New Application → Bot.
   - Enable **Presence Intent** and **Server Members Intent** under Privileged Gateway Intents.
   - Copy the bot token into `DISCORD_BOT_TOKEN` in `.env`.
   - Invite the bot to a server you're a member of (OAuth2 URL Generator, scope `bot`, permissions
     `0` — it only needs to observe presence, not act). Presence is only visible in a shared guild.

3. **Dedicated SSH key** — the one credential that stays a file, not an env var, because an
   account-level key carries write access to every repo the account owns:
   ```bash
   mkdir -p forge/.secrets
   ssh-keygen -t ed25519 -C readme-forge -N "" -f forge/.secrets/ssh_key
   ```
   Add `forge/.secrets/ssh_key.pub` to GitHub → Settings → SSH and GPG keys, as an **Authentication
   key**. Delete `ssh_key.pub` from `.secrets/` afterward if you like — only the private half is
   read by the container.

4. **GitHub PAT** (classic, scopes `repo` + `read:user`) → `GITHUB_PAT` in `.env`.

5. Verify nothing secret is tracked by git:
   ```bash
   git status --porcelain .env forge/.secrets   # both must print nothing
   git check-ignore -v .env forge/.secrets/ssh_key   # both must print a match
   ```

6. `forge-presence` has no published port — it's routed by Traefik via the labels already on the
   service in `docker-compose.yml`, over the external `traefik-net` network (create it once with
   `docker network create traefik-net` if this is a fresh host). The router rule is
   `widgets.baronette.es`; the `WIDGETS_BASE` var in `.env` assumes that hostname, so change both
   together if you use a different one.

## Running it

See the **Commands** section of `../CLAUDE.md` for the full list (build, deploy, manual pipeline
run, per-stage debugging, presence checks, secret-leak audit). All commands run from the repo root
now, not from `forge/`.

The `assets` branch is created automatically by the collector on its first successful run — nothing
to do by hand there.
