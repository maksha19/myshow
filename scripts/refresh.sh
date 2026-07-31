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
