#!/bin/sh
set -eu
# The SSH key never touches the filesystem: ssh-agent holds it in memory for the
# lifetime of the container. This also avoids ssh's 0600 permission check on
# bind-mounted secrets, which Compose cannot satisfy.
if [ -r /run/secrets/ssh_key ]; then
  eval "$(ssh-agent -s -a /tmp/ssh-agent.sock)" >/dev/null
  SSH_AUTH_SOCK=/tmp/ssh-agent.sock
  export SSH_AUTH_SOCK
  ssh-add /run/secrets/ssh_key >/dev/null 2>&1 || { echo "[entrypoint] ssh-add failed" >&2; exit 1; }
  echo "[entrypoint] ssh key loaded into agent"
else
  echo "[entrypoint] /run/secrets/ssh_key missing" >&2; exit 1
fi
exec "$@"
