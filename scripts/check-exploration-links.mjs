#!/usr/bin/env node
/**
 * Guard references to exploration documents (exploration 0421).
 *
 * Exploration status lives in the *filename* — `NNNN_[_]_TITLE.md` becomes
 * `NNNN_[x]_TITLE.md` when `/implement` checks it off. Every such transition
 * renames the file, and every reference that spelled the old name silently
 * breaks. Measured before this check existed: 31 stale references across 28
 * files (25 distinct names), including four public `site/` legal pages, three
 * package READMEs and `docs/specs/protocol/README.md`. Nothing detected them.
 *
 * Bare paths count, not just markdown links. Only 5 of those 25 names appeared
 * as `](…)` links; the rest were paths in prose or comments. In a repo this
 * agent-heavy a bare path is *more* load-bearing than a link — an agent reads
 * the path and opens it, so a stale one costs a failed tool call and a wrong
 * conclusion.
 *
 * What counts as a reference: a path containing the `explorations/` segment —
 * both `docs/explorations/NNNN_[x]_TITLE.md` and the `../`-relative form match.
 * A bare `NNNN_[x]_TITLE.md` with no directory does not; that is a filename
 * being discussed, not a path being followed.
 *
 * Escape hatch: `<!-- exploration-link-ignore -->` on the same or previous line,
 * for the rare document that quotes a broken name deliberately (0421 does, in
 * its table of rot examples). Fenced code blocks in markdown are skipped for the
 * same reason.
 *
 * Named consumer: the `lint` job in ci.yml. Pass condition: zero broken
 * references — an absolute, not a ratchet, because the fixed state is reachable
 * today and every new break is a fresh mistake rather than inherited debt.
 *
 * Run: `node scripts/check-exploration-links.mjs` (or
 * `pnpm check:exploration-links`).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(process.cwd())
const EXPLORATIONS = join(root, 'docs/explorations')

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'graphify-out',
  'dist',
  'build',
  'coverage',
  '.turbo',
  '.next',
  'out',
  '.astro',
  'playwright-report',
  'test-results'
])

const SCAN_EXT = /\.(?:md|mdx|astro|ts|tsx|js|jsx|mjs|cjs|json|ya?ml|txt|html|svelte|vue)$/i

/** A path — not a bare filename — pointing at an exploration document. */
const REF = /(?<![\w/-])(?:[\w./-]*\/)?explorations\/(\d{4})_\[(.)\]_([A-Z0-9_]+)\.md/g

const IGNORE = 'exploration-link-ignore'

/** Every exploration on disk, indexed by its 4-digit number. */
function loadExplorations() {
  if (!existsSync(EXPLORATIONS)) return new Map()
  const byNumber = new Map()
  for (const f of readdirSync(EXPLORATIONS)) {
    const m = /^(\d{4})_\[.\]_.*\.md$/.exec(f)
    if (!m) continue
    // Numbers collide (79 of them); keep every candidate so the hint is honest.
    const list = byNumber.get(m[1]) ?? []
    list.push(f)
    byNumber.set(m[1], list)
  }
  return byNumber
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      yield* walk(join(dir, entry.name))
    } else if (entry.isFile() && SCAN_EXT.test(entry.name)) {
      yield join(dir, entry.name)
    }
  }
}

/**
 * Lines that must not be inspected: fenced code blocks (markdown only) and
 * anything carrying the ignore marker. Returns a Set of 0-based line indices.
 */
function maskedLines(lines, isMarkdown) {
  const masked = new Set()
  let inFence = false
  lines.forEach((line, i) => {
    if (isMarkdown && /^\s*(?:```|~~~)/.test(line)) {
      inFence = !inFence
      masked.add(i)
      return
    }
    if (inFence) masked.add(i)
    if (line.includes(IGNORE)) {
      masked.add(i)
      masked.add(i + 1)
    }
  })
  return masked
}

const byNumber = loadExplorations()
const broken = []
let refsChecked = 0

for (const file of walk(root)) {
  const text = readFileSync(file, 'utf8')
  if (!text.includes('explorations/')) continue // cheap reject

  const lines = text.split('\n')
  const isMarkdown = /\.mdx?$/i.test(file)
  const masked = maskedLines(lines, isMarkdown)

  lines.forEach((line, i) => {
    if (masked.has(i)) return
    for (const m of line.matchAll(REF)) {
      refsChecked++
      const [, number, , title] = m
      const name = `${number}_[${m[2]}]_${title}.md`
      if (existsSync(join(EXPLORATIONS, name))) continue
      broken.push({
        file,
        line: i + 1,
        ref: name,
        candidates: byNumber.get(number) ?? []
      })
    }
  })
}

if (broken.length > 0) {
  console.error(`✗ ${broken.length} broken exploration reference(s):\n`)
  for (const b of broken) {
    console.error(`  ${relative(root, b.file)}:${b.line}`)
    console.error(`    ${b.ref}`)
    if (b.candidates.length === 1) {
      console.error(`    → ${b.candidates[0]}`)
    } else if (b.candidates.length > 1) {
      console.error(`    → one of: ${b.candidates.join(', ')}`)
    } else {
      console.error(`    → no exploration numbered ${b.ref.slice(0, 4)} exists`)
    }
    console.error('')
  }
  console.error(
    'Exploration status lives in the filename, so checking a doc off renames it\n' +
      'and breaks references spelling the old name. Update the reference above.\n' +
      `If the stale name is quoted deliberately, add <!-- ${IGNORE} --> nearby.`
  )
  process.exit(1)
}

console.log(`✓ exploration references OK (${refsChecked} checked)`)
process.exit(0)
