// Builds and deploys both forge-presence and forge-collector from the same
// workspace, monolith-style: one checkout, one pipeline, no separate deploy
// directory or manual step beyond the one-time secrets bootstrap (.env and
// forge/.secrets/ssh_key placed in this workspace by hand).
//
// This does mean Jenkins now has practical authority to redeploy the
// collector, which holds the SSH key (full account write access) and the
// GitHub PAT -- a deliberate trade-off for a single self-controlled host,
// not the default posture. See "Continuous deployment" in CLAUDE.md.

def deployed = false

pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
    timeout(time: 20, unit: 'MINUTES')
  }

  environment {
    IMAGE             = 'forge-presence'
    SERVICE           = 'forge-presence'
    COLLECTOR_SERVICE = 'forge-collector'
  }

  stages {
    stage('Build image') {
      // The image build runs `tsc`, so a type error fails the build right here.
      // There is no separate typecheck stage: it would run the same compiler twice.
      steps {
        sh 'docker build -f docker/Dockerfile.presence -t "${IMAGE}:${BUILD_NUMBER}" .'
      }
    }

    stage('Smoke test') {
      // Regression guard for a real bug: an invalid token must degrade the widget
      // to "unknown" and leave the HTTP server up, not take the process down.
      steps {
        sh '''
          set -eu
          CID=$(docker run -d \
            -e DISCORD_BOT_TOKEN=smoke-test-invalid-token \
            -e DISCORD_USER_ID=0 \
            "${IMAGE}:${BUILD_NUMBER}")
          trap 'docker rm -f "$CID" >/dev/null 2>&1 || true' EXIT

          # Probed from inside the container: a published port would land on the
          # host, which this Jenkins container cannot reach on 127.0.0.1.
          PROBE="fetch('http://127.0.0.1:8787/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
          for _ in $(seq 1 20); do
            if docker exec "$CID" node -e "$PROBE" >/dev/null 2>&1; then
              echo "smoke: healthz ok with an invalid token"
              exit 0
            fi
            sleep 1
          done

          echo "smoke: service never became healthy" >&2
          docker logs "$CID" >&2
          exit 1
        '''
      }
    }

    stage('Deploy') {
      // Runs docker compose directly in the Jenkins workspace -- there is no
      // separate deploy directory to rsync into. .env and forge/.secrets/
      // are untracked and gitignored, so a plain `git checkout -f` (this
      // job runs no `git clean`) never touches them; they persist here
      // across builds and CI never writes to them.
      steps {
        script { deployed = true }
        sh '''
          set -eu
          if [ ! -f .env ]; then
            echo "missing .env in the Jenkins workspace - see forge/README.md" >&2
            exit 1
          fi

          if docker image inspect "${IMAGE}:latest" >/dev/null 2>&1; then
            docker tag "${IMAGE}:latest" "${IMAGE}:rollback"
          fi
          docker tag "${IMAGE}:${BUILD_NUMBER}" "${IMAGE}:latest"

          docker compose up -d --no-deps "${SERVICE}"
        '''
      }
    }

    stage('Verify') {
      // No compose healthcheck to poll (Traefik does its own routing checks),
      // so this execs into the container and probes /healthz directly --
      // the same approach as the smoke test above.
      steps {
        sh '''
          set -eu
          CID=$(docker compose ps -q "${SERVICE}")
          [ -n "$CID" ] || { echo "verify: service is not running" >&2; exit 1; }

          PROBE="fetch('http://127.0.0.1:8787/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
          for _ in $(seq 1 30); do
            if docker exec "$CID" node -e "$PROBE" >/dev/null 2>&1; then
              echo "verify: healthy"
              exit 0
            fi
            sleep 2
          done

          echo "verify: container did not become healthy" >&2
          docker logs --tail 50 "$CID" >&2
          exit 1
        '''
      }
    }

    stage('Collector build + smoke test') {
      // A real dry run against this workspace's own .env and ssh_key: verifies
      // SSH auth to GitHub, clones/updates every repo, runs linguist, computes
      // the contribution calendar, and renders the SVGs -- everything except
      // the final `git push`. Catches a broken build before it ever touches
      // the live collector. The same command as CLAUDE.md's manual pre-push
      // check, just run here against the freshly built image.
      steps {
        sh '''
          set -eu
          if [ ! -f forge/.secrets/ssh_key ]; then
            echo "missing forge/.secrets/ssh_key in the Jenkins workspace - see forge/README.md" >&2
            exit 1
          fi

          docker compose build "${COLLECTOR_SERVICE}"
          docker compose run --rm "${COLLECTOR_SERVICE}" node dist/cron.js --once --dry-run
        '''
      }
    }

    stage('Deploy collector') {
      // No rollback dance needed here: the smoke test above already ran the
      // exact image this recreates the container with, so a broken build
      // never reaches this step -- the previous container just keeps running
      // untouched if the smoke test failed.
      steps {
        sh 'docker compose up -d --no-deps "${COLLECTOR_SERVICE}"'
      }
    }
  }

  post {
    failure {
      script {
        if (deployed) {
          sh '''
            set -eu
            if ! docker image inspect "${IMAGE}:rollback" >/dev/null 2>&1; then
              echo "rollback: no previous image to fall back to" >&2
              exit 0
            fi
            docker tag "${IMAGE}:rollback" "${IMAGE}:latest"
            docker compose up -d --no-deps "${SERVICE}"
            echo "rollback: restored previous image"
          '''
        }
      }
    }
    always {
      sh 'docker image prune -f --filter "until=168h" >/dev/null 2>&1 || true'
    }
  }
}
