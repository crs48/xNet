#!/bin/bash
# Bump hub package version and create a git tag.
#
# Usage: ./scripts/bump-hub-version.sh [major|minor|patch]

set -euo pipefail

TYPE=${1:-patch}

cd packages/hub

# Bump version
npm version "$TYPE" --no-git-tag-version

# Get new version
VERSION=$(node -p "require('./package.json').version")

# Return to repo root
cd ../..

# Commit and tag
git add packages/hub/package.json
git commit -m "chore(hub): release v$VERSION"
git tag "hub-v$VERSION"

echo ""
echo "Hub version bumped to $VERSION"
echo ""
echo "Next steps:"
echo "  git push && git push --tags"
echo ""
echo "This will trigger:"
echo "  1. Railway auto-deploys demo hub (from main push)"
echo "  2. GitHub Actions builds + pushes Docker image to GHCR (from tag)"
echo ""
