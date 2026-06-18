/**
 * Build-time validation for the plugins marketplace index (registry/registry.json,
 * surfaced via src/data/plugins.ts).
 *
 * Runs as part of `pnpm build` (before astro build) so CI fails on a malformed
 * registry: bad reverse-domain ids, duplicates, missing required fields,
 * community entries without an https manifestUrl, or paid plugins without a
 * declared source repo. On success it also publishes the validated index to
 * `public/registry.json` so the in-app marketplace can fetch it from the
 * deployed site (https://xnet.fyi/registry.json).
 *
 * See exploration 0201.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { plugins, type PluginListing } from '../src/data/plugins'

const ID = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/i
const TIERS = ['bundled', 'marketplace']
const PRICING_MODES = ['free', 'one-time', 'subscription']

const errors: string[] = []
const seen = new Set<string>()

function err(id: string, msg: string): void {
  errors.push(`${id}: ${msg}`)
}

function checkEntry(p: PluginListing): void {
  const id = p.id || '(missing id)'
  if (!ID.test(p.id ?? '')) err(id, 'id must be reverse-domain (e.g. com.acme.kanban)')
  if (seen.has(p.id)) err(id, 'duplicate id')
  seen.add(p.id)

  if (!p.name) err(id, 'name is required')
  if (!p.description) err(id, 'description is required')
  if (!p.version) err(id, 'version is required')
  if (!p.author) err(id, 'author is required')
  if (!p.category) err(id, 'category is required')
  if (!TIERS.includes(p.tier)) err(id, `tier must be one of: ${TIERS.join(', ')}`)

  if (p.homepage && !p.homepage.startsWith('https://')) err(id, 'homepage must be https')

  if (p.tier === 'marketplace') {
    if (!p.manifestUrl?.startsWith('https://'))
      err(id, 'community plugins need an https manifestUrl')
    if (!p.provenance?.sourceRepo) err(id, 'community plugins should declare provenance.sourceRepo')
  }

  if (p.pricing) {
    if (!PRICING_MODES.includes(p.pricing.mode))
      err(id, `pricing.mode must be one of: ${PRICING_MODES.join(', ')}`)
    if (p.pricing.mode !== 'free') {
      if (!p.provenance?.sourceRepo) err(id, 'paid plugins must declare a source repo')
      if (p.pricing.amountMinor != null && !p.pricing.currency)
        err(id, 'pricing.currency is required when amountMinor is set')
    }
  }
}

for (const p of plugins) checkEntry(p)

if (errors.length > 0) {
  console.error(`registry.json validation failed with ${errors.length} error(s):`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

// Publish the validated index as a static asset for the in-app marketplace.
const publicDir = join(dirname(fileURLToPath(import.meta.url)), '../public')
mkdirSync(publicDir, { recursive: true })
writeFileSync(join(publicDir, 'registry.json'), JSON.stringify(plugins, null, 2) + '\n')

const bundled = plugins.filter((p) => p.tier === 'bundled').length
const community = plugins.length - bundled
console.log(
  `registry.json OK: ${plugins.length} plugins (${bundled} built-in, ${community} community) → public/registry.json`
)
