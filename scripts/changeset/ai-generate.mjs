#!/usr/bin/env node
/**
 * AI-assisted changeset enrichment — exploration 0220, Decision E.
 *
 *   git diff origin/main...HEAD -- $(node scripts/changeset/publishable-pathspec.mjs) \
 *     | node scripts/changeset/ai-generate.mjs
 *
 * Runs AFTER the deterministic floor (`changeset-conventional`) has written
 * `.changeset/*.md` from the conventional-commit prefixes. This step reads the
 * real diff (already scoped to publishable packages by the caller) and, per
 * affected package, asks the model to (1) suggest a semver bump that catches an
 * unflagged breaking change and (2) write a high-quality, consumer-facing
 * summary. It then enriches the floor changesets IN PLACE.
 *
 * Invariant (enforced in this code, not the model): `final = max(floor, ai)`.
 * The model may only RAISE a bump or rewrite prose — never lower a bump, never
 * invent a release. If a changeset already pins a higher floor, the AI bump is
 * ignored.
 *
 * Fail-open: with no ANTHROPIC_API_KEY, an API error, or unparseable output,
 * the floor changesets are left exactly as `changeset-conventional` wrote them
 * and the process exits 0 — the pipeline never breaks on this. The model never
 * runs in the publish job and never holds publish credentials.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const MODEL = process.env.CHANGELOG_MODEL || 'claude-haiku-4-5'
const API_URL = 'https://api.anthropic.com/v1/messages'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CHANGESET_DIR = join(ROOT, '.changeset')

const RANK = { patch: 0, minor: 1, major: 2 }
const maxBump = (a, b) => (RANK[a] >= RANK[b] ? a : b)

function readStdin() {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => (data += c))
    process.stdin.on('end', () => resolve(data))
    if (process.stdin.isTTY) resolve('')
  })
}

/** Parse the floor changesets `changeset-conventional` wrote. */
function readFloorChangesets() {
  const out = []
  if (!existsSync(CHANGESET_DIR)) return out
  for (const file of readdirSync(CHANGESET_DIR)) {
    if (!file.endsWith('.md') || file.toLowerCase() === 'readme.md') continue
    const path = join(CHANGESET_DIR, file)
    const raw = readFileSync(path, 'utf8')
    const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
    if (!m) continue
    const releases = {}
    for (const line of m[1].split('\n')) {
      const r = line.match(/^["']?(@?[^"':]+)["']?\s*:\s*(patch|minor|major)\s*$/)
      if (r) releases[r[1].trim()] = r[2]
    }
    out.push({ path, releases, summary: m[2].trim() })
  }
  return out
}

function writeChangeset({ path, releases, summary }) {
  const front = Object.entries(releases)
    .map(([name, bump]) => `'${name}': ${bump}`)
    .join('\n')
  writeFileSync(path, `---\n${front}\n---\n\n${summary}\n`)
}

async function suggest(diff, packages) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key || !diff.trim() || packages.length === 0) return null

  const system =
    'You are writing npm changesets for xNet, a local-first data platform. You are ' +
    'given a git diff (already scoped to publishable packages) and the list of ' +
    'affected packages. For EACH affected package return a semver bump and a concise, ' +
    'consumer-facing summary (what changed and why it matters to a package consumer; ' +
    'no internal jargon). Bump rules: major = a breaking change to the public API ' +
    '(removed/renamed export, changed signature, changed protocol/hash/wire contract) ' +
    'EVEN IF the commit said feat/fix; minor = backward-compatible new feature; patch = ' +
    'fix/perf/internal. ALWAYS major if the diff changes any of these wire-visible ' +
    'constants, which the Stop hook also enforces: CURRENT_PROTOCOL_VERSION ' +
    '(packages/sync/src/change.ts), LWW_TIEBREAK_KEY_VERSION (packages/core/src/lww.ts), ' +
    'XNET_SYNC_ENVELOPE_VERSION / XNET_DATA_MODEL_VERSION / XNET_AWARENESS_VERSION / ' +
    'XNET_PROTOCOL_VERSION (packages/runtime/src/protocol.ts), SCHEMA_VERSION ' +
    '(packages/sqlite/src/schema.ts), XNETPACK_FORMAT_VERSION ' +
    '(packages/data/src/portability/types.ts). Be conservative: when in doubt about ' +
    'breakage, choose the HIGHER bump. Reply with STRICT JSON only, no prose, no fences: ' +
    '{"releases":[{"name":"@xnetjs/x","bump":"patch|minor|major","summary":"..."}]}'

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      temperature: 0,
      system,
      messages: [
        {
          role: 'user',
          content: `Affected packages: ${packages.join(', ')}\n\nDiff:\n${diff.slice(0, 60_000)}`,
        },
      ],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic API ${res.status}`)
  const json = await res.json()
  const text = json?.content?.find((b) => b.type === 'text')?.text?.trim()
  if (!text) return null
  const parsed = JSON.parse(text)
  const map = {}
  for (const r of parsed.releases ?? []) {
    if (r?.name && RANK[r.bump] !== undefined) {
      map[r.name] = { bump: r.bump, summary: String(r.summary || '').trim() }
    }
  }
  return map
}

async function main() {
  const diff = await readStdin()
  const floor = readFloorChangesets()
  if (floor.length === 0) return // nothing to enrich; the floor decides everything

  const affected = [...new Set(floor.flatMap((c) => Object.keys(c.releases)))]

  let ai
  try {
    ai = await suggest(diff, affected)
  } catch (err) {
    process.stderr.write(`ai-generate: ${err.message}; keeping deterministic floor\n`)
    return // fail open
  }
  if (!ai) return

  for (const cs of floor) {
    let changed = false
    let bestSummary = null
    for (const [name, floorBump] of Object.entries(cs.releases)) {
      const s = ai[name]
      if (!s) continue
      const finalBump = maxBump(floorBump, s.bump) // NEVER below the floor
      if (finalBump !== floorBump) {
        cs.releases[name] = finalBump
        changed = true
      }
      if (s.summary) bestSummary = s.summary
    }
    if (bestSummary && bestSummary !== cs.summary) {
      cs.summary = bestSummary
      changed = true
    }
    if (changed) {
      writeChangeset(cs)
      process.stderr.write(`ai-generate: enriched ${cs.path.split('/').pop()}\n`)
    }
  }
}

await main()
