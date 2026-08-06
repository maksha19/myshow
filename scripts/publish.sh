#!/bin/bash
# Build the site and push it straight to the gh-pages branch from this machine.
#
# This is the primary deploy path. GitHub Pages serves the gh-pages branch
# directly, so publishing takes seconds instead of waiting for a runner to be
# allocated, build, and hand off to the Pages API.
#
# Run by hand:  npm run deploy
# `npm run refresh` calls this automatically after it pushes new episode data.

set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Project sites live at /<repo>/, so the build needs a matching base. Derived
# from the remote rather than hardcoded, to match what CI does.
REPO="$(basename -s .git "$(git config --get remote.origin.url)")"
export VITE_BASE="/$REPO/"

echo "Building with base $VITE_BASE ..."
npm run build

echo "Publishing dist/ to the gh-pages branch ..."
# --dotfiles keeps .nojekyll, which stops GitHub running the output through
# Jekyll and dropping files it thinks are private.
#
# Deliberately NOT --no-history: that force-creates the branch from main each
# run, and gh-pages' cleanup step does not clear dotfiles, so .github/ and
# .gitignore reappear on the published branch every time. Publishing
# incrementally onto an already-clean branch keeps it to just the built site.
npx gh-pages --dist dist --branch gh-pages --dotfiles \
  --message "deploy: $(date '+%Y-%m-%d %H:%M')"

echo "Published. https://$(git config --get remote.origin.url | sed -E 's#.*github.com[:/]([^/]+)/.*#\1#').github.io/$REPO/"
