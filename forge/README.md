# forge/

Self-hosted infrastructure that renders the widgets in the root `README.md`. See `../CLAUDE.md`
for architecture rules and conventions. This file is the operational setup checklist.

## One-time setup

1. **Discord bot**
   - Discord Developer Portal → New Application → Bot.
   - Enable **Presence Intent** and **Server Members Intent** under Privileged Gateway Intents.
   - Copy the bot token into `forge/.secrets/discord_bot_token`.
   - Invite the bot to a server you're a member of (OAuth2 URL Generator, scope `bot`, permissions
     `0` — it only needs to observe presence, not act). Presence is only visible in a shared guild.

2. **Dedicated SSH key**
   ```bash
   mkdir -p forge/.secrets
   ssh-keygen -t ed25519 -C readme-forge -N "" -f forge/.secrets/ssh_key
   ```
   Add `forge/.secrets/ssh_key.pub` to GitHub → Settings → SSH and GPG keys, as an **Authentication
   key**. Delete `ssh_key.pub` from `.secrets/` afterward if you like — only the private half is
   read by the container.

3. **GitHub PAT** (classic, scopes `repo` + `read:user`) → `forge/.secrets/github_pat`.

4. Verify the secrets directory is correct and ignored:
   ```bash
   ls forge/.secrets
   # ssh_key  github_pat  discord_bot_token
   git check-ignore -v forge/.secrets/ssh_key   # must print a match
   ```

5. Point a reverse proxy at `forge-presence`: `widgets.baronette.es` → `127.0.0.1:8787`. The
   `WIDGETS_BASE` env var in `docker-compose.yml` / `publish.ts` assumes that hostname; change both
   if you use a different one.

## Running it

See the **Commands** section of `../CLAUDE.md` for the full list (build, deploy, manual pipeline
run, per-stage debugging, presence checks, secret-leak audit).

The `assets` branch is created automatically by the collector on its first successful run — nothing
to do by hand there.
