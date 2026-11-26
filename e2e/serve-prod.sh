#!/usr/bin/env bash
# Production server for Playwright: `next build && next start` on its own port (default 3200).
#
# Builds from a synced snapshot of the repo (outside the tree, node_modules symlinked) so it never
# touches the `.next` that a running `pnpm dev` is using, and so files edited mid-run can't trigger
# a recompile under the tests. `.next` in the snapshot is kept between runs for incremental builds.
set -euo pipefail

PORT="${1:-3200}"
SRC="$(cd "$(dirname "$0")/.." && pwd)"
APP="${E2E_APP_DIR:-${TMPDIR:-/tmp}/yk-e2e-app}"

mkdir -p "$APP"
# scripts/ (CLI tooling) and tests/ (Vitest) are never bundled; leaving them out keeps `next build`'s
# type check to the app, so a half-edited script elsewhere in the repo can't fail the e2e run.
rm -rf "$APP/scripts" "$APP/tests"
rsync -a --delete \
  --exclude /node_modules --exclude /.next --exclude /.git --exclude /.data \
  --exclude /test-results --exclude /playwright-report --exclude /tsconfig.tsbuildinfo \
  --exclude /scripts --exclude /tests \
  "$SRC/" "$APP/"
ln -sfn "$SRC/node_modules" "$APP/node_modules"
cd "$APP"

# Let Next read .env.local itself rather than inheriting stale shell exports of the same keys.
if [[ -f .env.example ]]; then
  for v in $(grep -oE '^[A-Z0-9_]+=' .env.example | tr -d '='); do unset "$v"; done
fi
# Links the app generates (e.g. the impact-check link the test opens) must point at this server,
# not the APP_URL in .env.local (the dev server). Exported env wins over .env.local.
export APP_URL="http://localhost:$PORT"

echo "[e2e] building $APP → http://127.0.0.1:$PORT"
./node_modules/.bin/next build --no-lint
# No --hostname: middleware rewrites proxy to localhost:$PORT, which may resolve to ::1.
exec ./node_modules/.bin/next start --port "$PORT"
