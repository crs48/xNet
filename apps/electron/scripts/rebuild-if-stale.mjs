#!/usr/bin/env node
/**
 * Rebuild native modules for Electron's ABI only when something changed
 * (exploration 0404).
 *
 * `deps:electron` runs `@electron/rebuild -f`, which force-rebuilds
 * better-sqlite3, usearch and sharp. It was the first half of `dev:electron`,
 * so every single dev start paid a full native rebuild whether or not anything
 * had changed — the largest fixed cost in the idea→prototype loop.
 *
 * The result is a pure function of three inputs: Electron's version, the target
 * modules' versions, and the installed dependency tree. Hash them, stamp the
 * hash next to the build output, and skip when it matches.
 *
 * CI keeps the unconditional rebuild (`deps:electron`), because a stale stamp
 * there would be far more expensive than a rebuild. This is the dev path only.
 *
 * Escape hatches, in order of bluntness:
 *   pnpm --filter xnet-desktop run deps:electron   # always rebuilds
 *   XNET_FORCE_ELECTRON_REBUILD=1 pnpm dev         # force through this script
 *
 * Run: `node scripts/rebuild-if-stale.mjs` from apps/electron.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(here, '..')
const repoRoot = resolve(appDir, '../..')

/** Kept in sync with `deps:electron` / `deps:node` in package.json. */
const MODULES = ['better-sqlite3', 'usearch', 'sharp']
const STAMP = join(appDir, 'node_modules/.xnet-electron-rebuild-stamp')

/** Version of a package as resolved from apps/electron, or null if absent. */
function versionOf(name) {
  try {
    const pkg = join(appDir, 'node_modules', name, 'package.json')
    if (existsSync(pkg)) return JSON.parse(readFileSync(pkg, 'utf8')).version
    // Hoisted to the workspace root by pnpm.
    return JSON.parse(readFileSync(join(repoRoot, 'node_modules', name, 'package.json'), 'utf8'))
      .version
  } catch {
    return null
  }
}

function stampKey() {
  const hash = createHash('sha256')
  hash.update(`electron:${versionOf('electron') ?? 'unknown'}`)
  for (const name of MODULES) hash.update(`${name}:${versionOf(name) ?? 'missing'}`)
  // The lockfile catches a transitive change that does not move any of the
  // versions above — a rebuilt binary for the same version, say.
  try {
    hash.update(readFileSync(join(repoRoot, 'pnpm-lock.yaml')))
  } catch {
    hash.update('no-lockfile')
  }

  return hash.digest('hex')
}

function rebuild(reason) {
  console.log(`[electron] rebuilding native modules — ${reason}`)
  execFileSync('pnpm', ['dlx', '@electron/rebuild', '-f', '-w', MODULES.join(',')], {
    cwd: appDir,
    stdio: 'inherit'
  })
}

const key = stampKey()

if (process.env.XNET_FORCE_ELECTRON_REBUILD === '1') {
  rebuild('XNET_FORCE_ELECTRON_REBUILD=1')
} else if (!existsSync(STAMP)) {
  rebuild('no stamp yet')
} else if (readFileSync(STAMP, 'utf8').trim() !== key) {
  rebuild('electron, module versions or lockfile changed')
} else {
  // Say what was skipped and how to force it. A silent skip is how an ABI
  // mismatch turns into a confusing native-module load error at boot.
  console.log(
    `[electron] native modules current (${MODULES.join(', ')}) — skipping rebuild. ` +
      'Force with XNET_FORCE_ELECTRON_REBUILD=1, or run deps:electron.'
  )
  process.exit(0)
}

mkdirSync(dirname(STAMP), { recursive: true })
writeFileSync(STAMP, `${key}\n`)
