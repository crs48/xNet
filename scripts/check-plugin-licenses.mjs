#!/usr/bin/env node
/**
 * Enforce the paid-plugin license policy (exploration 0196).
 *
 * Every marketplace listing with non-free `pricing` must declare a license the
 * marketplace pre-approves — FSL-1.1-MIT / FSL-1.1-Apache-2.0 (source-available,
 * auto-opens after 2 years) or an OSI id. This scans every `marketplace/**\/
 * registry.json` (the publish target) plus any path passed as an argument. With
 * no registry present yet it is a no-op forward guard.
 *
 * The allowed set MUST stay in sync with
 * packages/plugins/src/ecosystem/license-policy.ts (ALLOWED_PLUGIN_LICENSES).
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ALLOWED = new Set(['FSL-1.1-MIT', 'FSL-1.1-Apache-2.0', 'MIT', 'Apache-2.0', 'AGPL-3.0-only'])

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.turbo', 'coverage'])
const root = resolve(process.cwd())

/** Recursively collect `registry.json` files living under a `marketplace/` dir. */
function findRegistries(dir, underMarketplace, out) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      findRegistries(join(dir, e.name), underMarketplace || e.name === 'marketplace', out)
    } else if (e.isFile() && e.name === 'registry.json' && underMarketplace) {
      out.push(join(dir, e.name))
    }
  }
}

const files = []
findRegistries(root, false, files)
for (const arg of process.argv.slice(2)) {
  const p = resolve(arg)
  if (existsSync(p) && statSync(p).isFile() && !files.includes(p)) files.push(p)
}

if (files.length === 0) {
  console.log('✓ plugin license policy: no marketplace registry found — nothing to check')
  process.exit(0)
}

const isPaid = (pricing) => !!pricing && pricing.mode && pricing.mode !== 'free'
let fail = 0
let checked = 0

for (const file of files) {
  let entries
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    entries = Array.isArray(parsed) ? parsed : Array.isArray(parsed.plugins) ? parsed.plugins : []
  } catch (err) {
    console.error(`✗ ${file}: not valid JSON (${err.message})`)
    fail = 1
    continue
  }
  for (const entry of entries) {
    if (!isPaid(entry?.pricing)) continue
    checked++
    const id = entry.id ?? '(unknown id)'
    if (typeof entry.license !== 'string' || !entry.license) {
      console.error(`✗ ${id}: paid listing is missing a "license" field`)
      fail = 1
    } else if (!ALLOWED.has(entry.license)) {
      console.error(
        `✗ ${id}: license "${entry.license}" is not marketplace-approved (allowed: ${[...ALLOWED].join(', ')})`
      )
      fail = 1
    }
  }
}

if (fail === 0) {
  console.log(
    `✓ plugin license policy OK (${checked} paid listing(s) across ${files.length} registr(y/ies))`
  )
}
process.exit(fail)
