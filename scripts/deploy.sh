#!/usr/bin/env bash
# Deploy Task-Board-Flow to a remote server over SSH.
#
# Typical one-shot update (from repo root):
#   ./scripts/deploy.sh 1
#
# Steps (local): optional scripts/deploy.local.env (gitignored) loads DEPLOY_SSH_PASSWORD,
#                then (on $DEPLOY_BRANCH) commit if dirty, push origin $DEPLOY_BRANCH,
#                then SSH remote pull/build/restart.
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
#   DEPLOY_SKIP_GIT_PUSH=1   skip local git commit/push (remote-only sync)
#   DEPLOY_SKIP_COMMIT=1     push only; do not auto-commit (you committed already)
#   DEPLOY_COMMIT_MESSAGE=   message for auto-commit (default: chore: deploy <timestamp>)
#   DEPLOY_ALLOW_OTHER_BRANCH=1  allow deploy when not checked out on DEPLOY_BRANCH
#
# Local credentials: copy scripts/deploy.local.env.example → scripts/deploy.local.env
# (never commit deploy.local.env — it is in .gitignore.)
#
# Without a key or sshpass: SSH will prompt for a password (interactive).
#
# Note: Remote script is piped to ssh (not stored in $()) so macOS Bash 3.2
# does not treat ")" in "fn()" as closing command substitution.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -f "$SCRIPT_DIR/deploy.local.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/deploy.local.env"
  set +a
fi

usage() {
  cat <<'USAGE'
Deploy Task-Board-Flow to a remote server over SSH.

Run:
  ./scripts/deploy.sh              # interactive menu
  ./scripts/deploy.sh 1|2|3        # skip menu (for scripts/CI)

Options:
  1  Code only:  local commit+push, then remote git reset to origin, npm ci, build, restart
  2  DB only:     local commit+push, then remote db:push (needs node_modules on server)
  3  Code + DB:   local commit+push, then remote pull, ci, db:push, build, restart

Environment:
  DEPLOY_HOST, DEPLOY_PATH, DEPLOY_BRANCH, DEPLOY_SERVICE
  DEPLOY_SSH_KEY=/path/to/key     Use this identity file
  DEPLOY_SSH_PASSWORD=...         Use sshpass (brew install hudochenkov/sshpass/sshpass)
  scripts/deploy.local.env        Gitignored file: export DEPLOY_SSH_PASSWORD='...'
  DEPLOY_SKIP_GIT_PUSH=1          Skip local commit/push before SSH
  DEPLOY_SKIP_COMMIT=1            Skip auto-commit; still runs git push
  DEPLOY_COMMIT_MESSAGE='msg'     Auto-commit message when the tree is dirty
  DEPLOY_ALLOW_OTHER_BRANCH=1     Allow running when not on DEPLOY_BRANCH

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
  echo "  1) Deploy code only     — local commit+push, then pull, npm ci, build, restart ${DEPLOY_SERVICE}"
  echo "  2) Deploy database only — local commit+push, then npm run db:push on server"
  echo "  3) Deploy code + DB     — local commit+push, then pull, ci, db:push, build, restart"
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

if [[ "${DEPLOY_SKIP_GIT_PUSH:-0}" != "1" ]]; then
  echo "==> Git: commit (if needed), push origin $DEPLOY_BRANCH — $REPO_ROOT"
  cd "$REPO_ROOT"
  if [[ ! -d .git ]]; then
    echo "error: $REPO_ROOT is not a git repository" >&2
    exit 1
  fi

  current_branch="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$current_branch" != "$DEPLOY_BRANCH" ]]; then
    if [[ "${DEPLOY_ALLOW_OTHER_BRANCH:-0}" != "1" ]]; then
      echo "error: checked out '$current_branch' but DEPLOY_BRANCH is '$DEPLOY_BRANCH'." >&2
      echo "  Checkout the deploy branch first, or run with DEPLOY_ALLOW_OTHER_BRANCH=1." >&2
      exit 1
    fi
    echo "warning: on branch '$current_branch' (DEPLOY_BRANCH=$DEPLOY_BRANCH); continuing."
  fi

  if [[ "${DEPLOY_SKIP_COMMIT:-0}" != "1" ]]; then
    if [[ -n "$(git status --porcelain)" ]]; then
      git add -A
      if ! git diff --cached --quiet; then
        msg="${DEPLOY_COMMIT_MESSAGE:-chore: deploy $(date -u +%Y-%m-%dT%H:%M:%SZ)}"
        echo "==> Git: committing with message: $msg"
        git commit -m "$msg"
      else
        echo "==> Git: nothing to commit after add (only ignored/untracked noise?)"
      fi
    else
      echo "==> Git: working tree clean, no commit needed"
    fi
  else
    echo "==> Git: skip auto-commit (DEPLOY_SKIP_COMMIT=1)"
    if [[ -n "$(git status --porcelain)" ]]; then
      echo "warning: you have uncommitted changes; push may not include them." >&2
    fi
  fi

  git push origin "$DEPLOY_BRANCH"
  echo ""
else
  echo "==> Git: skipped (DEPLOY_SKIP_GIT_PUSH=1)"
  echo ""
fi

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

print_ssh_auth_help() {
  cat <<EOF >&2

==> SSH to ${DEPLOY_HOST} failed (authentication).
    deploy.sh never stores credentials in git. Fix one of:

    1) Create scripts/deploy.local.env from the example and set either:
         - DEPLOY_SSH_PASSWORD + install sshpass (see deploy.local.env.example), or
         - DEPLOY_SSH_KEY=/path/to/private_key (and install the matching pubkey on the server).

    2) Or add your Mac SSH public key (~/.ssh/id_ed25519.pub) to the server user’s
       ~/.ssh/authorized_keys (VPS panel: SSH keys, or paste via recovery console).

    Defaults: host ${DEPLOY_HOST}  path ${DEPLOY_PATH}  (override with env vars).

EOF
}

set +e
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
  if [[ -z "${PROJECT_SECRETS_MASTER_KEY:-}" ]]; then
    echo "error: PROJECT_SECRETS_MASTER_KEY is missing in ${DEPLOY_PATH}/.env" >&2
    echo "       Required for project credentials encryption/decryption." >&2
    exit 1
  fi
}

deploy_db() {
  echo "==> Database: npm run db:push"
  cd "$DEPLOY_PATH"
  load_env
  npm run db:push
}

deploy_code() {
  echo "==> Code: git fetch + reset to origin/$DEPLOY_BRANCH, npm ci, db push, build, restart"
  cd "$DEPLOY_PATH"
  git fetch origin
  git checkout "$DEPLOY_BRANCH"
  # Match GitHub exactly; avoids pull failures from manual edits or untracked files on the server.
  git reset --hard "origin/$DEPLOY_BRANCH"
  unset NODE_ENV
  npm ci
  load_env
  echo "==> Database: npm run db:push (applies schema; safe if already up to date)"
  npm run db:push
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
    git reset --hard "origin/$DEPLOY_BRANCH"
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
deploy_ssh_rc=$?
set -euo pipefail
if [[ "$deploy_ssh_rc" -ne 0 ]]; then
  print_ssh_auth_help
  exit "$deploy_ssh_rc"
fi
