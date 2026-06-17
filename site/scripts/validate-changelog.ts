/**
 * Build-time validation for site/src/data/changelog.ts.
 *
 * Runs as part of `pnpm build` (before astro build) so CI fails on malformed
 * changelog data: bad ids/dates, out-of-order or duplicate entries, empty
 * required fields, or hero images that are neither absolute site paths nor
 * https URLs. Keeps the JSON/RSS feeds and the in-app "What's New" honest.
 */

import { entries } from '../src/data/changelog'
import type { ChangelogEntry } from '../src/data/changelog'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const errors: string[] = []

function err(id: string, msg: string): void {
  errors.push(`[${id}] ${msg}`)
}

function checkRequired(e: ChangelogEntry): void {
  const id = e.id || '(missing id)'
  if (!ISO_DATE.test(e.id)) err(id, `id must be an ISO date YYYY-MM-DD`)
  if (!e.date) err(id, 'missing date label')
  if (!e.title) err(id, 'missing title')
  if (!e.summary) err(id, 'missing summary')
  if (!e.highlights?.length) err(id, 'must have at least one highlight')
  if (!e.tags?.length) err(id, 'must have at least one tag')
  if (e.hero) {
    const ok = e.hero.src.startsWith('/') || e.hero.src.startsWith('https://')
    if (!ok) err(id, `hero.src must be an absolute path or https URL (${e.hero.src})`)
    if (!e.hero.alt) err(id, 'hero is missing alt text')
  }
}

function checkUniqueIds(): void {
  const ids = entries.map((e) => e.id)
  const dupes = ids.filter((x, i) => ids.indexOf(x) !== i)
  for (const d of new Set(dupes)) err(d, `duplicate entry id "${d}"`)
}

function checkDescending(): void {
  for (let i = 1; i < entries.length; i++) {
    if (entries[i - 1].id < entries[i].id) {
      err(entries[i].id, `entries must be newest-first (after ${entries[i - 1].id})`)
    }
  }
}

function report(): void {
  if (errors.length === 0) return
  console.error(`changelog.ts validation failed with ${errors.length} error(s):`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

for (const e of entries) checkRequired(e)
checkUniqueIds()
checkDescending()
report()

console.log(`changelog.ts OK: ${entries.length} entries (latest ${entries[0]?.id})`)
