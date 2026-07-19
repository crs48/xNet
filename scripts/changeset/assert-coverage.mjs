#!/usr/bin/env node
/**
 * Stop / SubagentStop hook — exploration 0220, Decision E (agent-native path).
 *
 * Blocks the agent from ending a turn until every PUBLISHABLE `packages/*` whose
 * source it changed is covered by a `.changeset/*.md`. This makes "always add a
 * changeset" deterministic rather than a probabilistic CLAUDE.md nicety.
 *
 * Wired via .claude/settings.json as a Stop hook. Exit 2 blocks turn-end and
 * feeds stderr back to the agent; any other failure exits 0 so the hook can
 * never wedge the session. Opt out with CHANGESET_SKIP_HOOK=1.
 *
 * "Affected" = a non-test source file (or package.json) under a publishable
 * package changed vs. the merge-base with main, OR is uncommitted. Docs, tests,
 * stories, and private/ignored packages never require a changeset.
 *
 * KNOWN GAP (exploration 0370): `@xnetjs/hub` and `@xnetjs/editor` are
 * `private: true`, so they are outside this hook entirely — and both own
 * wire-visible constants (`EDITOR_DOCUMENT_SCHEMA_VERSION`, the `content-v4`
 * Y.Doc fragment name, the hub handshake version). They are deliberately not in
 * PROTOCOL_SENTINELS below: neither is published to npm, so there is no semver
 * bump to demand. The hub ships as a Docker image tagged from the desktop
 * release; the editor ships inside the apps. Their compatibility is governed by
 * the app/image release, not by package semver — which means a breaking change
 * to a stored document format there is currently caught by review alone.
 * Removing them from `.changeset/config.json` `ignore` would NOT close this;
 * `private: true` already excludes them.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

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
  if (process.env.CHANGESET_SKIP_HOOK === '1') return 0

  // Avoid re-entrancy: if this hook already fired for this stop, don't loop.
  try {
    const input = JSON.parse((await readStdin()) || '{}')
    if (input.stop_hook_active) return 0
  } catch {
    /* no/!json stdin — fine */
  }

  // Publishable package map: dir -> name, for private:false && !ignore.
  const ignore = new Set(
    JSON.parse(readFileSync(join(ROOT, '.changeset/config.json'), 'utf8')).ignore ?? [],
  )
  const dirToName = {}
  for (const d of readdirSync(join(ROOT, 'packages'))) {
    const f = join(ROOT, 'packages', d, 'package.json')
    if (!existsSync(f)) continue
    const p = JSON.parse(readFileSync(f, 'utf8'))
    if (p.name && p.private !== true && !ignore.has(p.name)) dirToName[d] = p.name
  }

  // Changed files: committed since merge-base with the base ref + uncommitted.
  // CHANGESET_BASE lets CI point at origin/<base> (no local `main` ref there).
  const baseRef = process.env.CHANGESET_BASE || 'main'
  const base = sh(`git merge-base HEAD ${baseRef}`).trim() || baseRef
  const files = new Set(
    [
      ...sh(`git diff --name-only ${base}...HEAD`).split('\n'),
      ...sh('git status --porcelain').split('\n').map((l) => l.slice(3)),
    ]
      .map((s) => s.trim())
      .filter(Boolean),
  )

  const isSource = (f) =>
    /^packages\/[^/]+\/(src\/|package\.json)/.test(f) &&
    !/\.(test|spec|stories)\./.test(f) &&
    !/\/__(tests|mocks|fixtures)__\//.test(f)

  const affected = new Set()
  for (const f of files) {
    if (!isSource(f)) continue
    const dir = f.split('/')[1]
    if (dirToName[dir]) affected.add(dirToName[dir])
  }
  if (affected.size === 0) return 0

  // Packages named by any changeset, mapped to their highest declared bump.
  const csDir = join(ROOT, '.changeset')
  const covered = new Map()
  if (existsSync(csDir)) {
    for (const file of readdirSync(csDir)) {
      if (!file.endsWith('.md') || file.toLowerCase() === 'readme.md') continue
      const raw = readFileSync(join(csDir, file), 'utf8')
      const m = raw.match(/^---\n([\s\S]*?)\n---/)
      if (!m) continue
      for (const line of m[1].split('\n')) {
        const r = line.match(/^["']?(@?[^"':]+)["']?\s*:\s*(patch|minor|major)/)
        if (!r) continue
        const name = r[1].trim()
        if (RANK[r[2]] > (RANK[covered.get(name)] ?? -1)) covered.set(name, r[2])
      }
    }
  }

  const missing = [...affected].filter((n) => !covered.has(n))
  if (missing.length > 0) {
    process.stderr.write(
      `Missing changeset for changed publishable package(s): ${missing.join(', ')}.\n` +
        `Run /changeset (reads the diff, picks the bump, writes .changeset/*.md), or ` +
        `\`pnpm changeset\` manually. Use \`pnpm changeset --empty\` only if the change is ` +
        `genuinely not consumer-visible.\n`,
    )
    return 2
  }

  // Protocol/wire-format changes must be `major`, whatever the commit said.
  // We cannot verify a bump is *correct* — no JS tool can (exploration 0370) —
  // but we can catch the one class of error a script reliably can: a
  // wire-visible constant moving under a patch/minor.
  const underBumped = protocolBumpTooLow(files, base, dirToName, covered)
  if (underBumped.length > 0) {
    process.stderr.write(
      `Protocol/wire-format constant changed, but the changeset is not \`major\`:\n` +
        underBumped.map((u) => `  - ${u.pkg} (${u.bump}) — ${u.file}: ${u.what}\n`).join('') +
        `\nThese constants are wire-visible: a peer, hub or stored bundle written by ` +
        `one version must be readable by another. Bump to \`major\`, or if the constant ` +
        `genuinely did not change meaning, revert the edit.\n` +
        `See STABILITY.md and CONTRIBUTING.md#versioning.\n`,
    )
    return 2
  }

  return 0
}

/**
 * Wire-visible constants. A changed line matching one of these means the change
 * record, sync envelope, stored schema or export bundle can differ between two
 * builds — which is a breaking change regardless of the commit prefix.
 */
const PROTOCOL_SENTINELS = [
  ['packages/sync/src/change.ts', /CURRENT_PROTOCOL_VERSION\s*=/, 'change record version'],
  ['packages/core/src/lww.ts', /LWW_TIEBREAK_KEY_VERSION\s*=/, 'LWW tiebreak activation'],
  [
    'packages/runtime/src/protocol.ts',
    /XNET_(SYNC_ENVELOPE|DATA_MODEL|AWARENESS|SCHEMA)_VERSION\s*=|XNET_PROTOCOL_VERSION\s*[:=]/,
    'protocol bundle',
  ],
  ['packages/sqlite/src/schema.ts', /SCHEMA_VERSION\s*=/, 'sqlite schema version'],
  [
    'packages/data/src/portability/types.ts',
    /XNETPACK_FORMAT_VERSION\s*=/,
    '.xnetpack format version',
  ],
]

const RANK = { patch: 0, minor: 1, major: 2 }

function protocolBumpTooLow(files, base, dirToName, covered) {
  const hits = []
  for (const [file, re, what] of PROTOCOL_SENTINELS) {
    if (!files.has(file)) continue

    // Only care if an ADDED or REMOVED line matches the sentinel — an unrelated
    // edit elsewhere in the same file is not a protocol change.
    const diff =
      sh(`git diff ${base}...HEAD -- ${file}`) + '\n' + sh(`git diff HEAD -- ${file}`)
    const touched = diff
      .split('\n')
      .filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l))
      .some((l) => re.test(l))
    if (!touched) continue

    const pkg = dirToName[file.split('/')[1]]
    if (!pkg) continue // private or ignored package — nothing to bump
    const bump = covered.get(pkg)
    if (bump && RANK[bump] < RANK.major) hits.push({ pkg, bump, file, what })
  }
  return hits
}

main()
  .then((code) => process.exit(code))
  .catch(() => process.exit(0)) // never wedge the session
