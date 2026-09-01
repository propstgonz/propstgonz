# forge/jenkins/

A single-job Jenkins that builds, smoke-tests and deploys `forge-presence`.
Everything it knows lives in `casc.yaml` (Configuration as Code) rather than in a
mutable volume nobody can reproduce — the job definition is in git, not in a click path.

## The trade-off you are accepting

This Jenkins mounts `/var/run/docker.sock`. **Anyone who can run a job on it is
effectively root on the host.** That is the price of letting CI deploy containers,
and there is no clever way around it: docker-in-docker moves the problem, it does
not remove it.

Mitigations, all of which are already applied or assumed:

- Bound to `127.0.0.1:8080` only. Put it behind the reverse proxy with auth, or a
  VPN, if you need it remotely. Never straight onto the internet.
- Anonymous read is off; signup is off. One local admin account.
- Single user, single job. Do not add jobs from repositories you do not control.

## What Jenkins deliberately does NOT have

- **No Discord token.** Compose reads it from `/srv/readme-forge/.secrets/` on the
  host at container start. CI only runs `docker compose up -d`.
- **No SSH key, no GitHub PAT.** The collector is not part of the pipeline, on
  purpose: a CI system able to redeploy it could exfiltrate those secrets.
- **No git credentials.** The profile repo is public, so it clones over HTTPS.

The result is that the CI system holds none of the three secrets the project uses.

## One-time setup

1. Admin password (a file, consistent with how every other secret here works):
   ```bash
   mkdir -p forge/jenkins/.secrets
   openssl rand -base64 24 > forge/jenkins/.secrets/jenkins_admin_password
   ```

2. Tell Compose the host's docker group id, so Jenkins can reach the socket:
   ```bash
   echo "DOCKER_GID=$(getent group docker | cut -d: -f3)" > forge/jenkins/.env
   ```

3. Prepare the deploy directory that holds the persistent secrets and state:
   ```bash
   sudo mkdir -p /srv/readme-forge/.secrets
   sudo cp forge/.secrets/discord_bot_token /srv/readme-forge/.secrets/
   sudo chown -R "$(id -u):$(id -g)" /srv/readme-forge
   ```

4. Start it:
   ```bash
   cd forge/jenkins
   docker compose up -d --build
   ```
   Log in at http://127.0.0.1:8080 as `admin` with the generated password.
   The `forge-presence-deploy` job is already there.

## Maintenance note

`plugins.txt` pins no versions, so `jenkins-plugin-cli` always resolves the latest
plugins. When those move ahead of the pinned core, the image build fails with
`requires a greater version of Jenkins than <pinned>`. The fix is to bump the
`FROM` tag in the `Dockerfile` to a current LTS — check the available tags first:

```bash
curl -s "https://hub.docker.com/v2/repositories/jenkins/jenkins/tags?page_size=100&name=lts-jdk21" \
  | grep -o '"name":"[0-9.]*-lts-jdk21"'
```

This is the intended trade-off: floating plugins with a pinned, deliberately
bumped core, rather than pinning 40 plugin versions nobody will ever update.

## Pipeline stages

| Stage | What it does | Why |
|---|---|---|
| Build image | `docker build` of `Dockerfile.presence` | The build runs `tsc`, so type errors fail here. No separate typecheck stage would run the same compiler twice. |
| Smoke test | Boots the new image with an invalid token, expects `/healthz` to answer | Regression guard: a bad token must degrade the widget to `unknown`, not crash the process. This bug was real once. |
| Deploy | rsyncs code to `/srv/readme-forge`, retags images, `compose up -d` | `.secrets/` and `state/` are excluded from the sync and never touched by CI. |
| Verify | Polls the container's healthcheck | Reuses the healthcheck already in `docker-compose.yml` instead of reaching for a port from inside the Jenkins container. |

On failure after the deploy stage, the pipeline retags `forge-presence:rollback`
back to `:latest` and brings the previous image back up.
