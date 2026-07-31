#!/usr/bin/env node
/**
 * Prune desktop profiles whose reason to exist is gone (0413).
 *
 * Two kinds accumulate and nothing collects them:
 *
 *   - `xnet-desktop-wt-<slug>` — a worktree profile whose worktree has since
 *     been deleted. `git worktree list` is the authority.
 *   - `xnet-desktop-e2e-*` with a millisecond timestamp — created per test run
 *     by `tests/e2e`, never removed.
 *
 * At the time this was written there were 18 of them, including five from
 * Codex sessions that ended months earlier. Small in bytes, large in confusion:
 * it makes "which profile is real?" a research task.
 *
 * Refuses to touch `xnet-desktop` (the default profile), any live worktree's
 * profile, and any directory currently holding a `SingletonLock` — a running
 * app is never garbage, whatever the naming says.
 *
 * Run: `pnpm --filter xnet-desktop dev:clean [--dry-run]`
 */
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, readlinkSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DRY_RUN = process.argv.includes('--dry-run')
const E2E_AGE_MS = 24 * 60 * 60 * 1000

/** Where Electron puts userData for this platform. */
function userDataRoot() {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support')
  if (process.platform === 'win32') {
    return process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
  }
  return process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
}

/** Basenames of every live worktree, as `wt-<slug>` profile names. */
function liveWorktreeProfiles() {
  try {
    const out = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: APP_DIR,
      encoding: 'utf8'
    })
    return new Set(
      out
        .split('\n')
        .filter((line) => line.startsWith('worktree '))
        .map((line) => `wt-${basename(line.slice('worktree '.length).trim())}`)
    )
  } catch (err) {
    // Without the authority we cannot tell orphan from live. Deleting on a
    // guess is the one outcome worse than leaving litter.
    console.error(`[dev-clean] cannot list worktrees (${err.message}) — refusing to guess.`)
    process.exit(1)
  }
}

function isRunning(dir) {
  const lock = join(dir, 'SingletonLock')
  try {
    lstatSync(lock)
    return true
  } catch {
    return false
  }
}

function classify(name, live) {
  if (name === 'xnet-desktop') return null // the default profile
  const profile = name.slice('xnet-desktop-'.length)

  if (profile.startsWith('wt-')) {
    return live.has(profile) ? null : 'worktree deleted'
  }

  // `…-e2e-<13-digit epoch>` and friends: per-run, and only once they are old.
  const stamp = profile.match(/(\d{13})$/)
  if (stamp && Date.now() - Number(stamp[1]) > E2E_AGE_MS) return 'stale e2e run'

  return null
}

const root = userDataRoot()
if (!existsSync(root)) {
  console.error(`[dev-clean] no userData root at ${root}`)
  process.exit(1)
}

const live = liveWorktreeProfiles()
const candidates = readdirSync(root)
  .filter((name) => name.startsWith('xnet-desktop-'))
  .map((name) => ({ name, dir: join(root, name) }))
  .filter(({ dir }) => {
    try {
      return statSync(dir).isDirectory()
    } catch {
      return false
    }
  })

let removed = 0
let kept = 0

for (const { name, dir } of candidates) {
  const reason = classify(name, live)
  if (!reason) {
    kept += 1
    continue
  }
  if (isRunning(dir)) {
    const holder = (() => {
      try {
        return readlinkSync(join(dir, 'SingletonLock'))
      } catch {
        return 'unknown'
      }
    })()
    console.log(`[dev-clean] keep   ${name} — running (lock held by ${holder})`)
    kept += 1
    continue
  }

  if (DRY_RUN) {
    console.log(`[dev-clean] would remove ${name} — ${reason}`)
  } else {
    rmSync(dir, { recursive: true, force: true })
    console.log(`[dev-clean] removed ${name} — ${reason}`)
  }
  removed += 1
}

console.log(
  `[dev-clean] ${DRY_RUN ? 'would remove' : 'removed'} ${removed}, kept ${kept} ` +
    `(of ${candidates.length} non-default profiles in ${root})`
)
