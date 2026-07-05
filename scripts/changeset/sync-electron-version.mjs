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
 *
 * Because the bump happens inside the `version` command, changesets/action
 * counts `xnet-desktop` among the changed packages and unconditionally reads
 * its CHANGELOG.md to build the release-PR body — a missing file crashes the
 * whole release workflow with ENOENT (changesets/action#256, exploration 0265).
 * changesets never writes that changelog (the package is ignored), so this
 * script owns it: every bump prepends a matching `## <version>` entry.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const CHANGELOG_TITLE = '# xnet-desktop'

export function syncElectronVersion(root, log = console.log) {
  const coreVersion = JSON.parse(
    readFileSync(join(root, 'packages/core/package.json'), 'utf8'),
  ).version

  const electronPath = join(root, 'apps/electron/package.json')
  const raw = readFileSync(electronPath, 'utf8')
  const pkg = JSON.parse(raw)

  if (pkg.version === coreVersion) {
    log(`sync-electron-version: already at ${coreVersion}, nothing to do`)
    return { changed: false, version: coreVersion }
  }

  // Rewrite only the version field's value, preserving the file's exact formatting
  // (indentation, key order, trailing newline) so the diff stays a one-liner.
  const updated = raw.replace(
    /("version"\s*:\s*")[^"]*(")/,
    (_, pre, post) => `${pre}${coreVersion}${post}`,
  )

  if (updated === raw || !updated.includes(`"version": "${coreVersion}"`)) {
    throw new Error('sync-electron-version: failed to rewrite version field')
  }

  writeFileSync(electronPath, updated)
  writeChangelogEntry(root, coreVersion)
  log(
    `sync-electron-version: ${pkg.version} -> ${coreVersion} (following @xnetjs/core)`,
  )
  return { changed: true, version: coreVersion }
}

function writeChangelogEntry(root, version) {
  const changelogPath = join(root, 'apps/electron/CHANGELOG.md')
  const existing = existsSync(changelogPath)
    ? readFileSync(changelogPath, 'utf8')
    : `${CHANGELOG_TITLE}\n`

  if (existing.includes(`## ${version}\n`)) return

  const entry =
    `## ${version}\n\n` +
    `Desktop shell release riding the @xnetjs/core ${version} train. ` +
    `Desktop-specific changes are not tracked here; see the core packages' ` +
    `changelogs for what shipped.\n`

  // Prepend the new entry right after the title, keeping older entries below.
  const [title, ...entries] = existing.split(/\n(?=## )/)
  const parts = [title.trimEnd(), entry.trimEnd(), ...entries.map((e) => e.trimEnd())]
  writeFileSync(changelogPath, parts.join('\n\n') + '\n')
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (invokedDirectly) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  try {
    syncElectronVersion(root)
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }
}
