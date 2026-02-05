#!/bin/bash
# Bump xNet desktop app version and create a git tag.
#
# Usage: ./scripts/bump-version.sh [major|minor|patch]

set -euo pipefail

TYPE=${1:-patch}

cd apps/electron

# Bump version
npm version "$TYPE" --no-git-tag-version

# Get new version
VERSION=$(node -p "require('./package.json').version")

# Return to repo root
cd ../..

# Update root package.json (optional, keep in sync)
npm version "$VERSION" --no-git-tag-version --allow-same-version 2>/dev/null || true

# Commit and tag
git add .
git commit -m "chore: bump version to $VERSION"
git tag "v$VERSION"

echo "Version bumped to $VERSION"
echo "Run 'git push && git push --tags' to trigger release"
