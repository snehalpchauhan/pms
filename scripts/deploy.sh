#!/usr/bin/env bash
# Deploy Task-Board-Flow to a remote server over SSH.
#
# Run: ./scripts/deploy.sh
#   You will be prompted to choose 1 (code), 2 (DB), or 3 (both).
#
# Optional CLI arg (skips menu): ./scripts/deploy.sh 1|2|3
#
# Environment:
#   DEPLOY_HOST          default: root@72.61.227.155
#   DEPLOY_PATH          default: /var/www/pms
#   DEPLOY_BRANCH        default: main
#   DEPLOY_SERVICE       default: pms.service
#   DEPLOY_SSH_KEY       optional path to private key (-i)
#   DEPLOY_SSH_PASSWORD  optional; if set and sshpass is installed, uses password auth
#
# Without a key or sshpass: SSH will prompt for a password (interactive).
#
# Note: Remote script is piped to ssh (not stored in $()) so macOS Bash 3.2
# does not treat ")" in "fn()" as closing command substitution.

set -euo pipefail

usage() {
  cat <<'USAGE'
Deploy Task-Board-Flow to a remote server over SSH.

Run:
  ./scripts/deploy.sh              # interactive menu
  ./scripts/deploy.sh 1|2|3        # skip menu (for scripts/CI)

Options:
  1  Code only:  git pull, npm ci, build, restart systemd service
  2  DB only:     npm run db:push (needs node_modules on server)
  3  Code + DB:   pull, npm ci, db:push, build, restart

Environment:
  DEPLOY_HOST, DEPLOY_PATH, DEPLOY_BRANCH, DEPLOY_SERVICE
  DEPLOY_SSH_KEY=/path/to/key     Use this identity file
  DEPLOY_SSH_PASSWORD=...         Use sshpass (brew install hudochenkov/sshpass/sshpass)
USAGE
}

DEPLOY_HOST="${DEPLOY_HOST:-root@72.61.227.155}"
DEPLOY_PATH="${DEPLOY_PATH:-/var/www/pms}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
DEPLOY_SERVICE="${DEPLOY_SERVICE:-pms.service}"

pick_mode() {
  echo ""
  echo "Deploy to ${DEPLOY_HOST}:${DEPLOY_PATH} (branch: ${DEPLOY_BRANCH})"
  echo ""
  echo "  1) Deploy code only     — git pull, npm ci, build, restart ${DEPLOY_SERVICE}"
  echo "  2) Deploy database only — npm run db:push (schema already on server)"
  echo "  3) Deploy code + DB     — pull, ci, db:push, build, restart"
  echo "  q) Quit"
  echo ""
  while true; do
    read -r -p "Enter choice [1-3 or q]: " choice
    case "$choice" in
      1 | 2 | 3)
        MODE=$choice
        return
        ;;
      q | Q)
        echo "Aborted."
        exit 0
        ;;
      *)
        echo "Invalid choice. Enter 1, 2, 3, or q."
        ;;
    esac
  done
}

MODE="${1:-}"
case "$MODE" in
  1 | 2 | 3) ;;
  -h | --help)
    usage
    exit 0
    ;;
  "")
    pick_mode
    ;;
  *)
    echo "Unknown argument: $MODE" >&2
    usage
    exit 1
    ;;
esac

ssh_opts=(
  -o StrictHostKeyChecking=accept-new
  -o PreferredAuthentications=publickey,password,keyboard-interactive
)
if [[ -n "${DEPLOY_SSH_KEY:-}" ]]; then
  ssh_opts+=(-i "$DEPLOY_SSH_KEY" -o IdentitiesOnly=yes)
fi

ssh_cmd=(
  "${ssh_opts[@]}"
  "$DEPLOY_HOST"
  MODE="$MODE"
  DEPLOY_PATH="$DEPLOY_PATH"
  DEPLOY_BRANCH="$DEPLOY_BRANCH"
  DEPLOY_SERVICE="$DEPLOY_SERVICE"
  bash -s
)

echo ""
echo "==> Deploy mode: $MODE  |  $DEPLOY_HOST:$DEPLOY_PATH  (branch: $DEPLOY_BRANCH)"
echo ""

# Pipe heredoc into ssh — avoids macOS Bash 3.2 breaking on ")" inside VAR=$(cat <<... )
run_remote() {
  if [[ -n "${DEPLOY_SSH_PASSWORD:-}" ]]; then
    if ! command -v sshpass &>/dev/null; then
      echo "error: DEPLOY_SSH_PASSWORD is set but sshpass is not installed." >&2
      echo "  macOS:  brew install hudochenkov/sshpass/sshpass" >&2
      echo "  Debian: sudo apt install sshpass" >&2
      exit 1
    fi
    SSHPASS="$DEPLOY_SSH_PASSWORD" sshpass -e ssh "${ssh_cmd[@]}"
  else
    ssh "${ssh_cmd[@]}"
  fi
}

run_remote <<'REMOTE'
set -euo pipefail

load_env() {
  if [[ ! -f "${DEPLOY_PATH}/.env" ]]; then
    echo "error: missing ${DEPLOY_PATH}/.env on server" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "${DEPLOY_PATH}/.env"
  set +a
}

deploy_db() {
  echo "==> Database: npm run db:push"
  cd "$DEPLOY_PATH"
  load_env
  npm run db:push
}

deploy_code() {
  echo "==> Code: git pull, npm ci, build, restart"
  cd "$DEPLOY_PATH"
  git fetch origin
  git checkout "$DEPLOY_BRANCH"
  git pull origin "$DEPLOY_BRANCH"
  unset NODE_ENV
  npm ci
  load_env
  npm run build
  chown -R www-data:www-data "$DEPLOY_PATH"
  systemctl restart "$DEPLOY_SERVICE"
  systemctl is-active --quiet "$DEPLOY_SERVICE" && echo "==> Service $DEPLOY_SERVICE is active"
}

case "$MODE" in
  1) deploy_code ;;
  2) deploy_db ;;
  3)
    cd "$DEPLOY_PATH"
    git fetch origin
    git checkout "$DEPLOY_BRANCH"
    git pull origin "$DEPLOY_BRANCH"
    unset NODE_ENV
    npm ci
    load_env
    npm run db:push
    npm run build
    chown -R www-data:www-data "$DEPLOY_PATH"
    systemctl restart "$DEPLOY_SERVICE"
    systemctl is-active --quiet "$DEPLOY_SERVICE" && echo "==> Service $DEPLOY_SERVICE is active"
    ;;
esac

echo "==> Done."
REMOTE
