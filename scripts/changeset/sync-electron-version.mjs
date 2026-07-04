#!/usr/bin/env node
/**
 * Peg the desktop app's version to the `fixed` core group so the Electron app
 * "rides the core release train": every time changesets publishes a new core
 * version, `apps/electron/package.json` follows, which makes electron-release.yml
 * cut a matching `v<version>` desktop release on the next push to main.
 *
 * Runs as the tail of `pnpm version-packages` (i.e. inside `changeset version`),
 * so the bump lands in the same "Version Packages" PR as the library bumps.
 * `xnet-desktop` is `private` and in the changeset `ignore` list, so changesets
 * never versions it on its own — this script is what keeps it in lockstep.
 *
 * The version source is `@xnetjs/core`, the anchor of the fixed group (they all
 * move together, so any member would do). Idempotent: a no-op when already synced.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const coreVersion = JSON.parse(
  readFileSync(join(root, 'packages/core/package.json'), 'utf8'),
).version

const electronPath = join(root, 'apps/electron/package.json')
const raw = readFileSync(electronPath, 'utf8')
const pkg = JSON.parse(raw)

if (pkg.version === coreVersion) {
  console.log(`sync-electron-version: already at ${coreVersion}, nothing to do`)
  process.exit(0)
}

// Rewrite only the version field's value, preserving the file's exact formatting
// (indentation, key order, trailing newline) so the diff stays a one-liner.
const updated = raw.replace(
  /("version"\s*:\s*")[^"]*(")/,
  (_, pre, post) => `${pre}${coreVersion}${post}`,
)

if (updated === raw || !updated.includes(`"version": "${coreVersion}"`)) {
  console.error('sync-electron-version: failed to rewrite version field')
  process.exit(1)
}

writeFileSync(electronPath, updated)
console.log(
  `sync-electron-version: ${pkg.version} -> ${coreVersion} (following @xnetjs/core)`,
)
