#!/bin/bash
# Daily refresh: scrape the latest episodes, and push if anything changed.
#
# This runs from a normal machine rather than CI because tamildhool.tech is
# behind a Cloudflare challenge that blocks GitHub's hosted runners (see the
# note at the top of .github/workflows/scrape.yml). A residential connection
# passes it; a datacentre one does not.
#
# Pushing to main triggers the Pages deploy, so the site updates on its own.
#
# Run by hand:  ./scripts/refresh.sh
# Or on a schedule, see "Daily refresh" in the README.

set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR" || exit 1

echo "=== $(date '+%Y-%m-%d %H:%M:%S') refresh starting ==="

# Launched from Finder or launchd, PATH is minimal — fail loudly rather than
# with a confusing stack trace. The scraper needs built-in fetch (Node 18+).
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is not on PATH. Open Terminal and run ./scripts/refresh.sh there."
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "ERROR: node $(node --version) is too old; the scraper needs Node 18 or newer."
  exit 1
fi

if ! node scripts/scrape.mjs; then
  # Non-zero means every show failed — the site structure changed, or the
  # network is down. shows.json is left untouched, so nothing is lost.
  echo "Scrape failed; leaving data and repository untouched."
  exit 1
fi

if git diff --quiet -- data/shows.json; then
  echo "No episode changes; nothing to push."
  exit 0
fi

git add data/shows.json
git commit -q -m "data: refresh latest episodes"

if git push -q origin main; then
  echo "Pushed. GitHub Pages will redeploy automatically."
else
  # Most likely an expired credential. The commit is kept so a later run or a
  # manual push still carries it.
  echo "Push failed — commit is kept locally, push it when you can."
  exit 1
fi
