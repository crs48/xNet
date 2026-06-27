/**
 * Build-time validation for site/src/data/surveillance.ts.
 *
 * Runs as part of `pnpm build` (before astro build) so CI fails if a claim on
 * the "/why" page loses its citation, duplicates an id, or drops the hopeful
 * counter-beats that keep the page an invitation rather than fear-mongering.
 */

import type { Claim } from '../src/data/surveillance'
import { CLAIMS } from '../src/data/surveillance'

const errors: string[] = []

function err(id: string, msg: string): void {
  errors.push(`[${id}] ${msg}`)
}

function requireField(id: string, field: keyof Claim, value: string | undefined): void {
  if (!value || !value.trim()) err(id, `missing or empty ${field}`)
}

const seen = new Set<string>()
for (const c of CLAIMS) {
  if (seen.has(c.id)) err(c.id, 'duplicate id')
  seen.add(c.id)

  requireField(c.id, 'moment', c.moment)
  requireField(c.id, 'physical', c.physical)
  requireField(c.id, 'digital', c.digital)
  requireField(c.id, 'stat', c.stat)
  requireField(c.id, 'source', c.source)
  requireField(c.id, 'sourceUrl', c.sourceUrl)

  if (!c.sourceUrl.startsWith('https://')) {
    err(c.id, `sourceUrl must be https (${c.sourceUrl})`)
  }
  if (c.tone !== 'alarm' && c.tone !== 'hope') {
    err(c.id, `tone must be "alarm" or "hope" (${String(c.tone)})`)
  }
}

// The page must stay an invitation, not a doom-scroll: keep at least one hopeful beat.
if (!CLAIMS.some((c) => c.tone === 'hope')) {
  errors.push('[page] at least one claim must have tone "hope" (see exploration 0234)')
}

if (errors.length > 0) {
  console.error(`surveillance.ts validation failed with ${errors.length} error(s):`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

const hope = CLAIMS.filter((c) => c.tone === 'hope').length
console.log(`surveillance.ts OK: ${CLAIMS.length} claims (${hope} hopeful), all cited`)
