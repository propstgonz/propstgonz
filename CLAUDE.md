# CLAUDE.md — propstgonz/propstgonz

This repository is my GitHub profile **and** the self-hosted infrastructure that renders it.
The README is the product; `forge/` is the factory. Both are public on purpose: the point of the
profile is that the infrastructure behind it is auditable.

## Prime directives

1. **No third-party widget services.** No Vercel `github-readme-stats`, no Heroku streak stats, no
   Lanyard. If a widget appears in the README, this repository renders it. Removing an external
   dependency is always an acceptable diff; adding one requires an explicit decision recorded here.
2. **No bloat.** Every dependency added to `forge/package.json` must be justified in the PR body in
   one sentence. Current allowlist: `discord.js`, `fastify`, `node-cron`, `graphql-request`, `zod`.
   No template engines, no SVG libraries, no ORMs, no logging frameworks. Template literals and
   `JSON.stringify` are sufficient and always will be.
3. **Flat files only.** State lives in `forge/state/*.json`. There is no database and there will not
   be one. If state ever outgrows JSON files, the correct fix is to store less state.
4. **Accuracy over convenience.** Language bytes come from `github-linguist` run over real clones.
   Contribution data comes from the GraphQL contribution calendar. If a number cannot be computed
   correctly, render `—`, never an estimate.
5. **The widget never lies.** Unknown Discord presence renders as `unknown`, not as `offline`.
   Stale data renders with its timestamp. Silent fallbacks to plausible-looking wrong values are bugs.

## Architecture rules

- **Orchestration lives at the repo root, application code lives in `forge/`.**
  `docker-compose.yml`, `Jenkinsfile`, and `docker/` (the two Dockerfiles, the collector entrypoint,
  the pinned `known_hosts`) live at the repo root — that is the standard, muscle-memory layout and
  every command in this file assumes it. `forge/` holds only `src/`, `dist/`, `package.json`,
  `state/`, and `.secrets/` (the SSH key). Build contexts are the repo root; Dockerfiles `COPY` from
  `forge/...` accordingly.
- **Two services, two images, one source tree.**
  - `forge-presence` — internet-facing. Alpine, Node only. Holds the Discord token. No SSH key,
    no PAT, no `git`, no shell tooling it does not need.
  - `forge-collector` — no listening ports. Holds the SSH key and the PAT. Runs the daily pipeline.
  - **No container ever holds all three secrets.** Any change that violates this is rejected.
- **Collection, rendering and publishing are separate modules.** `collect/*` only produces JSON in
  `state/`. `render/*` is a pure function from JSON to an SVG string — it must not perform network
  I/O, read the clock, or touch the filesystem. `publish.ts` is the only module allowed to run
  `git push`. This is what makes rendering testable without a network.
- **State writes are atomic**: write to `<file>.tmp`, then `rename()`. The presence service reads the
  same volume and must never observe a half-written file.
- **The pipeline is idempotent and resumable.** Running it twice in a row produces zero commits the
  second time. A failure in one repo's clone must not abort the whole run — log it, skip it, and mark
  the language data as partial.
- **SVGs are rendered for a sandbox.** No `<script>`, no external `href`/`src` of any kind (GitHub's
  image proxy will not load them), no webfonts. Avatars are embedded as `data:` URIs. Fonts are the
  system stack: `system-ui, -apple-system, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`.

## Code conventions

- TypeScript, ESM, `"strict": true`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. No `any`;
  no `as` casts to silence the compiler — fix the type.
- Every external payload (GraphQL response, `github-linguist --json` output, Discord presence) is
  parsed through a `zod` schema at the boundary. Inside the boundary, types are trusted.
- Errors: throw `Error` with a message that says what was being attempted and with which input.
  No swallowed exceptions, no `catch {}`. The pipeline logs and continues only where the rule above
  explicitly allows it.
- Logging is `console.log` with a `[module] message` prefix, to stdout, unbuffered. Docker is the
  log aggregator.
- File naming: `kebab-case.ts`. Exports are named; no default exports.
- Comments explain *why*, never *what*. If a line needs a comment to say what it does, rewrite it.
- Commits: imperative mood, lowercase, scoped — `collector: skip repos unchanged since last run`.

## Secrets — non-negotiable handling

Two different mechanisms, by deliberate choice, not oversight:

- **The SSH key** stays file-based: `forge/.secrets/` (gitignored, never committed).
- **`GITHUB_PAT` and `DISCORD_BOT_TOKEN`** live in a root-level `.env` (gitignored, never committed,
  see `.env.example` for the full var list) and reach containers via Compose `env_file: .env`. This
  is a conscious trade-off for one-file configuration, accepted for these two only because a bearer
  token is bounded (revoke and rotate) where the SSH key is not — see below.

Verify before every commit:

```bash
git status --porcelain forge/.secrets .env   # must print nothing
git diff --cached | grep -iE 'BEGIN .*PRIVATE KEY|ghp_|github_pat_|MT[A-Za-z0-9]{20,}'
```

Rules:

- `GITHUB_PAT` and `DISCORD_BOT_TOKEN` are read with plain `process.env["NAME"]` and a throw if
  missing — there is no file-reading helper for them, because they no longer arrive as files.
- The SSH key is the one credential that **never** goes through `environment:`/`ENV`/`.env`, is
  **never copied to disk**, and is **never used with `ssh -i`**. It reaches the container only
  through Docker Compose `secrets:` (bind-mounted read-only at `/run/secrets/ssh_key`).
  `entrypoint-collector.sh` starts `ssh-agent`, runs `ssh-add /run/secrets/ssh_key`, and exports
  `SSH_AUTH_SOCK` into a `tmpfs`. The key exists only in agent memory. This also sidesteps the
  file-permission checks that make bind-mounted keys miserable. The reason it gets this extra
  isolation and the bearer tokens don't: an account-level SSH key carries write access to every repo
  the account owns, and cannot be scoped down the way a PAT or bot token can.
- Host key verification is **on**. `docker/known_hosts.github` is baked into the image and pinned via
  `GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/etc/ssh/known_hosts.github"`.
  `StrictHostKeyChecking=no` is never acceptable, not even temporarily.
- Never log a secret, never interpolate one into a URL, never write one into `state/`.
  `state/presence.json` stores status and activity — never the bot token, never guild IDs.
- Use a **dedicated** SSH key (`readme-forge`), not your personal one. The lower-privilege
  alternative, if you ever want it, is a fine-grained PAT with `contents:read` over HTTPS — the
  collector is written so only `clone.ts` would change.
- Rotation: revoke in GitHub/Discord first. For the SSH key, replace the file in `forge/.secrets/`.
  For `GITHUB_PAT`/`DISCORD_BOT_TOKEN`, replace the value in `.env`. Either way, finish with
  `docker compose up -d --force-recreate` — Compose secrets and `env_file` are both read on
  container start, not live.

## Container hardening baseline

Both services run with `user: "10001:10001"`, `read_only: true`, `cap_drop: [ALL]`,
`security_opt: [no-new-privileges:true]`, and `tmpfs` for `/tmp`. Only the collector mounts the state
volume read-write; the presence service mounts it `:ro`. Do not relax any of these to fix a bug —
fix the bug.

## Continuous deployment

Jenkins is a **shared service that already runs on the deployment server** — it hosts
pipeline jobs for many projects, this one included. This repo does not provision,
build, or contain that Jenkins instance; it only supplies the `Jenkinsfile` at the
repo root. A job on that shared Jenkins ("Pipeline script from SCM", pointing at
this repo's `main` branch, `scriptPath: Jenkinsfile`) is what actually runs it —
configuring that job, its credentials, and the Jenkins instance itself happens on
the server, out of scope for this repo.

The `Jenkinsfile` builds and deploys **only `forge-presence`**. The collector is
excluded on purpose: it holds the SSH key and the PAT, and a CI system able to
redeploy it is a CI system able to exfiltrate them. Deploy the collector by hand.

- **The pipeline holds none of the three secrets.** Compose reads them from
  `/srv/readme-forge/.env` and `/srv/readme-forge/forge/.secrets/` on the host
  at container start; the pipeline only runs `docker compose up -d`. The profile
  repo is public, so there are no git credentials either. Do not "simplify" this
  by injecting tokens as Jenkins credentials — it would undo the entire secret model.
- The deploy step rsyncs the repo into `/srv/readme-forge` with `.env`,
  `forge/.secrets/` and `forge/state/` excluded. Those are host state and the
  pipeline must never write them.
- Jenkins mounting the docker socket, binding to `127.0.0.1`, admin auth, and
  which jobs are allowed to run on it are all properties of the shared server,
  not of this repo — see whatever configures that Jenkins instance for those.

## Commands

```bash
# --- deploy (run from repo root) ---
# CI is the shared Jenkins already running on the server, not something this
# repo starts — there is no local "start Jenkins" command here anymore.
docker compose build
docker compose up -d
docker compose ps
docker compose logs -f forge-collector

# --- run the daily pipeline right now (no waiting for cron) ---
docker compose run --rm forge-collector node dist/cron.js --once

# --- individual stages, for debugging ---
docker compose run --rm forge-collector node dist/cron.js --once --only=languages
docker compose run --rm forge-collector node dist/cron.js --once --only=contributions
docker compose run --rm forge-collector node dist/cron.js --once --dry-run   # renders, does not push

# --- presence service ---
# No published port: forge-presence sits behind Traefik on traefik-net, so
# reach it either through the public hostname or by execing into the container.
curl -s https://widgets.baronette.es/healthz
docker compose exec forge-presence node -e "fetch('http://127.0.0.1:8787/presence.json').then(r=>r.text()).then(console.log)"

# --- local development (no Docker; linguist stages will not work) ---
npm ci && npm run build && npm run typecheck

# --- verify no secret leaked into the image ---
docker run --rm --entrypoint sh forge-collector -c 'ls -la /run/secrets 2>/dev/null; echo ---; env | grep -iE "token|key|pat" || echo clean'
```

## Verification checklist before pushing anything

1. `npm run typecheck` passes.
2. `docker compose run --rm forge-collector node dist/cron.js --once --dry-run` produces four SVGs in
   `state/out/` that open correctly in a browser in both light and dark.
3. Language percentages are sane: HTML and XSLT are **not** in the top three. If they are, Linguist is
   seeing forks or vendored files and `collect/repos.ts` has a filtering bug.
4. Streak numbers match github.com/propstgonz's contribution graph exactly. Off-by-one means a
   timezone bug — check `TZ` in `docker-compose.yml`.
5. `git status --porcelain forge/.secrets .env` prints nothing.

## Tone of the README itself

Semi-professional with dry irony. Opinionated, first person, short sentences. It mocks bloat and
subscription-ware, not people. Do not add emoji rows, "hi there 👋" banners, trophy walls, visitor
counters, or animated typing GIFs. If a section does not tell the reader something true about how I
work, delete it.
