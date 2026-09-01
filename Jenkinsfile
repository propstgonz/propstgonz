// Builds and deploys forge-presence (the Discord bot).
//
// The collector is deliberately NOT part of this pipeline. It holds the SSH key
// and the GitHub PAT; a CI system able to redeploy it is a CI system able to
// exfiltrate them. Deploy the collector by hand, from the host.

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
    IMAGE      = 'forge-presence'
    SERVICE    = 'forge-presence'
    DEPLOY_DIR = '/srv/readme-forge'
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
      steps {
        script { deployed = true }
        sh '''
          set -eu
          if [ ! -f "${DEPLOY_DIR}/.env" ]; then
            echo "missing ${DEPLOY_DIR}/.env - see README.md" >&2
            exit 1
          fi

          # Sync code only. .env, forge/.secrets/ and forge/state/ live on the
          # host and are never touched by CI, which is why Jenkins needs no
          # secret of its own.
          rsync -a --delete \
            --exclude '.git/' --exclude '.env' \
            --exclude 'forge/.secrets/' --exclude 'forge/state/' \
            --exclude 'forge/node_modules/' --exclude 'forge/dist/' \
            ./ "${DEPLOY_DIR}/"

          if docker image inspect "${IMAGE}:latest" >/dev/null 2>&1; then
            docker tag "${IMAGE}:latest" "${IMAGE}:rollback"
          fi
          docker tag "${IMAGE}:${BUILD_NUMBER}" "${IMAGE}:latest"

          cd "${DEPLOY_DIR}"
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
          cd "${DEPLOY_DIR}"
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
            cd "${DEPLOY_DIR}"
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
