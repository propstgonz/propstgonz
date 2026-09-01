FROM jenkins/jenkins:2.568.2-lts-jdk21

# Pinned static binaries instead of Debian's `docker.io` package, which drags in
# the whole daemon this container has no business running: it talks to the host's.
ARG DOCKER_VERSION=27.5.1
ARG COMPOSE_VERSION=v2.32.4

USER root
RUN apt-get update && apt-get install -y --no-install-recommends rsync curl \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL "https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_VERSION}.tgz" \
      | tar -xz -C /tmp docker/docker \
 && mv /tmp/docker/docker /usr/local/bin/docker \
 && rm -rf /tmp/docker \
 && mkdir -p /usr/libexec/docker/cli-plugins \
 && curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
      -o /usr/libexec/docker/cli-plugins/docker-compose \
 && chmod 0755 /usr/libexec/docker/cli-plugins/docker-compose

USER jenkins
COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt
