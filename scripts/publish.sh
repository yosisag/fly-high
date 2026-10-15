#!/bin/bash
# Publish to https://yosisag.github.io/fly-high/
#  1. source → public/main as ONE fresh commit (private history with old personal data is never pushed)
#  2. build from a CLEAN checkout (no .env.local → no home address); the only secret baked in is the
#     URL-restricted Cesium token from .env.public (optional) → pushed to public/gh-pages
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
# public commits use the GitHub noreply identity, never the personal email
export GIT_AUTHOR_NAME="yosisag" GIT_AUTHOR_EMAIL="108081623+yosisag@users.noreply.github.com" GIT_COMMITTER_NAME="yosisag" GIT_COMMITTER_EMAIL="108081623+yosisag@users.noreply.github.com"
git diff --quiet && git diff --cached --quiet || { echo "commit your changes on master first"; exit 1; }
git fetch -q public 2>/dev/null || true
# always a single root commit: the public repo never carries any history
C=$(git rev-parse HEAD^{tree} | xargs git commit-tree -m "Fly High — public release ($(date +%F))")
git push -q -f public "$C:refs/heads/main"
TMP=$(mktemp -d); git archive HEAD | tar -x -C "$TMP"; cd "$TMP"
npm ci --silent
TOKEN=""; [ -f "$ROOT/.env.public" ] && TOKEN=$(sed -n 's/^VITE_GOOGLE_MAPS_KEY=//p' "$ROOT/.env.public")
VITE_GOOGLE_MAPS_KEY="$TOKEN" npx vite build --logLevel error
# personal values are read from local, untracked files — never written in this script
HOMEV=$(sed -n 's/^VITE_HOME=//p' "$ROOT/.env.local" 2>/dev/null | cut -d'|' -f1); MAIL=$(git -C "$ROOT" config user.email)
for v in "VITE_HOME" "$HOMEV|" "$MAIL"; do [ -n "$v" ] && [ "$v" != "|" ] && grep -rqF "$v" dist && { echo "ABORT: personal data in build"; exit 1; }; done
PRIV=$(sed -n 's/^VITE_GOOGLE_MAPS_KEY=//p' "$ROOT/.env.local" 2>/dev/null); if [ -n "$PRIV" ] && grep -rqF "$PRIV" dist; then echo "ABORT: private token in build"; exit 1; fi
touch dist/.nojekyll
cd dist && git init -q && git checkout -q -b gh-pages && git add -A && git commit -qm "Deploy $(date +%F)" && git push -q -f https://github.com/yosisag/fly-high.git gh-pages
rm -rf "$TMP"; echo "published: https://yosisag.github.io/fly-high/"
