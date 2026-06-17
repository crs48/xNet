/**
 * Build-time validation for the changelog fragment files (site/src/data/changelog/*.json,
 * loaded via src/data/changelog.ts).
 *
 * Runs as part of `pnpm build` (before astro build) so CI fails on malformed
 * changelog data: bad ids/dates, duplicate ids, empty required fields, or hero
 * images that are neither absolute site paths nor https URLs. The loader sorts
 * entries newest-first, so fragment file order is irrelevant. Keeps the
 * JSON/RSS feeds and the in-app "What's New" honest.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ChangelogEntry } from '../src/data/changelog'

// Read the fragments directly (type-only import above is erased, so `tsx` never
// evaluates the Vite `import.meta.glob` in changelog.ts).
const fragmentDir = join(dirname(fileURLToPath(import.meta.url)), '../src/data/changelog')
const entries: ChangelogEntry[] = readdirSync(fragmentDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(fragmentDir, f), 'utf8')) as ChangelogEntry)

// `YYYY-MM-DD`, optionally `-pr<N>` to disambiguate same-day merges.
const ENTRY_ID = /^\d{4}-\d{2}-\d{2}(-pr\d+)?$/

const errors: string[] = []

function err(id: string, msg: string): void {
  errors.push(`[${id}] ${msg}`)
}

function checkRequired(e: ChangelogEntry): void {
  const id = e.id || '(missing id)'
  if (!ENTRY_ID.test(e.id)) err(id, `id must be YYYY-MM-DD or YYYY-MM-DD-pr<N>`)
  if (!e.date) err(id, 'missing date label')
  if (!e.title) err(id, 'missing title')
  if (!e.summary) err(id, 'missing summary')
  if (!Array.isArray(e.highlights)) err(id, 'highlights must be an array')
  if (!e.tags?.length) err(id, 'must have at least one tag')
  if (e.hero) checkImageSrc(id, 'hero', e.hero.src, e.hero.alt)
  for (const [i, img] of (e.images ?? []).entries()) {
    checkImageSrc(id, `images[${i}]`, img.src, img.alt)
  }
  if (e.video) {
    checkImageSrc(id, 'video.poster', e.video.poster, e.video.alt)
    if (!e.video.src.startsWith('/') && !e.video.src.startsWith('https://')) {
      err(id, `video.src must be an absolute path or https URL (${e.video.src})`)
    }
  }
  if (e.author && !e.author.login) err(id, 'author is missing a login')
}

function checkImageSrc(id: string, field: string, src: string, alt: string): void {
  if (!src.startsWith('/') && !src.startsWith('https://')) {
    err(id, `${field}.src must be an absolute path or https URL (${src})`)
  }
  if (!alt) err(id, `${field} is missing alt text`)
}

function checkUniqueIds(): void {
  const ids = entries.map((e) => e.id)
  const dupes = ids.filter((x, i) => ids.indexOf(x) !== i)
  for (const d of new Set(dupes)) err(d, `duplicate entry id "${d}"`)
}

function report(): void {
  if (errors.length === 0) return
  console.error(`changelog.ts validation failed with ${errors.length} error(s):`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

for (const e of entries) checkRequired(e)
checkUniqueIds()
report()

console.log(`changelog OK: ${entries.length} fragment(s) valid`)
