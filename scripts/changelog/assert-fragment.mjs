#!/usr/bin/env node
/**
 * Stop hook — exploration 0283 (mirrors scripts/changeset/assert-coverage.mjs,
 * exploration 0220).
 *
 * Nudges the agent before turn-end when the branch changed app/package source
 * but added no changelog fragment: the `changelog-section` required check
 * rejects such PRs, and that feedback otherwise arrives only at PR time
 * (13% of recent Changelog Check runs failed this way).
 *
 * Deliberately a NUDGE, not a gate: fragment-worthiness is a judgment call and
 * `skip-changelog` is a legitimate answer (refactors, CI, docs). Exit 2 blocks
 * exactly once — on the next Stop, `stop_hook_active` is set and we pass — so
 * the agent can either write a fragment (scripts/changelog/new.mjs) or
 * consciously proceed and label the PR. Opt out with CHANGELOG_SKIP_HOOK=1.
 */
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FRAGMENT_DIR = 'site/src/data/changelog/'

function sh(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return ''
  }
}

function readStdin() {
  return new Promise((resolve) => {
    let d = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => (d += c))
    process.stdin.on('end', () => resolve(d))
    if (process.stdin.isTTY) resolve('')
  })
}

async function main() {
  if (process.env.CHANGELOG_SKIP_HOOK === '1') return 0

  // One nudge per turn: when a Stop hook already fired, let the turn end.
  try {
    const input = JSON.parse((await readStdin()) || '{}')
    if (input.stop_hook_active) return 0
  } catch {
    /* no/!json stdin — fine */
  }

  const baseRef = process.env.CHANGESET_BASE || 'main'
  const base = sh(`git merge-base HEAD ${baseRef}`).trim() || baseRef
  const files = [
    ...sh(`git diff --name-only ${base}...HEAD`).split('\n'),
    ...sh('git status --porcelain')
      .split('\n')
      .map((l) => l.slice(3)),
  ]
    .map((s) => s.trim())
    .filter(Boolean)

  const isUserFacing = (f) =>
    /^(apps|packages)\/[^/]+\/src\//.test(f) &&
    !/\.(test|spec|stories)\./.test(f) &&
    !/\/__(tests|mocks|fixtures)__\//.test(f)

  if (!files.some(isUserFacing)) return 0
  if (files.some((f) => f.startsWith(FRAGMENT_DIR))) return 0

  process.stderr.write(
    `This branch changes app/package source but has no changelog fragment — the ` +
      `required changelog-section check will reject the PR unless it gets the ` +
      `skip-changelog label.\n` +
      `If the change is user-visible, add a fragment:\n` +
      `  node scripts/changelog/new.mjs --title "..." --summary "..." --tags <tag>\n` +
      `If not (refactor/CI/tooling), end the turn again and apply the ` +
      `skip-changelog label when opening the PR. (One-time nudge; ` +
      `CHANGELOG_SKIP_HOOK=1 silences it.)\n`,
  )
  return 2
}

main()
  .then((code) => process.exit(code))
  .catch(() => process.exit(0)) // never wedge the session
