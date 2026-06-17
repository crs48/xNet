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
