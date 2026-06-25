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

  // Packages named by any changeset.
  const csDir = join(ROOT, '.changeset')
  const covered = new Set()
  if (existsSync(csDir)) {
    for (const file of readdirSync(csDir)) {
      if (!file.endsWith('.md') || file.toLowerCase() === 'readme.md') continue
      const raw = readFileSync(join(csDir, file), 'utf8')
      const m = raw.match(/^---\n([\s\S]*?)\n---/)
      if (!m) continue
      for (const line of m[1].split('\n')) {
        const r = line.match(/^["']?(@?[^"':]+)["']?\s*:\s*(patch|minor|major)/)
        if (r) covered.add(r[1].trim())
      }
    }
  }

  const missing = [...affected].filter((n) => !covered.has(n))
  if (missing.length === 0) return 0

  process.stderr.write(
    `Missing changeset for changed publishable package(s): ${missing.join(', ')}.\n` +
      `Run /changeset (reads the diff, picks the bump, writes .changeset/*.md), or ` +
      `\`pnpm changeset\` manually. Use \`pnpm changeset --empty\` only if the change is ` +
      `genuinely not consumer-visible.\n`,
  )
  return 2
}

main()
  .then((code) => process.exit(code))
  .catch(() => process.exit(0)) // never wedge the session
