#!/usr/bin/env bash
# Commit everything and publish to GitHub Pages.
#   ./publish.sh "commit message"
set -euo pipefail
cd "$(dirname "$0")"

[ -f .env ] || { echo "Missing .env (needs GITHUB_USER and GITHUB_API_TOKEN)"; exit 1; }
# tr -d '\r' guards against CRLF line endings sneaking into the token.
set -a; . <(tr -d '\r' < .env); set +a
: "${GITHUB_USER:?GITHUB_USER not set in .env}"
: "${GITHUB_API_TOKEN:?GITHUB_API_TOKEN not set in .env}"

REPO="${REPO:-blessing-cards}"
MSG="${1:-Update blessing cards}"

# GitHub Pages serves assets with max-age=600, so a returning visitor can sit on
# a stale stylesheet for ten minutes after a deploy. Re-stamp ?v= on every
# publish so each release fetches fresh files immediately.
STAMP="$(date +%Y%m%d%H%M%S)"
sed -i -E "s|(assets/(css\|js\|audio)/[a-z-]+\.(css\|js))\?v=[0-9]+|\1?v=${STAMP}|g" index.html
echo "Asset version: ${STAMP}"

git add -A
if git diff --cached --quiet; then
  echo "Nothing to commit."
else
  git commit -m "$MSG"
fi

# The token is passed inline rather than stored in the remote, and scrubbed
# from anything git prints.
git push "https://${GITHUB_USER}:${GITHUB_API_TOKEN}@github.com/${GITHUB_USER}/${REPO}.git" HEAD:main 2>&1 \
  | sed "s/${GITHUB_API_TOKEN}/***/g"

echo "Published: https://${GITHUB_USER}.github.io/${REPO}/"
