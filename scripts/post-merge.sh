#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
unset NODE_ENV
npm ci
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi
npm run db:push
npm run build
