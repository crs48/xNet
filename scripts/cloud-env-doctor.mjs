#!/usr/bin/env node
/**
 * xNet Cloud — tell me what's still missing from a control-plane .env file.
 *
 *   node scripts/cloud-env-doctor.mjs apps/cloud/.env.staging
 *
 * Reports each variable as ✓ filled / ✗ missing / – not needed here, grouped,
 * and a per-milestone readiness verdict (M1 = dogfood hub, M2 = money path).
 * Exits non-zero if a value required for this environment is missing — so you
 * can gate a deploy on it. Development is informational only (it runs on fakes).
 */

import { existsSync, readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { ENVIRONMENTS, MILESTONE_ORDER, VARS, rawValue } from './cloud-env-schema.mjs'

const file = process.argv[2]
if (!file) {
  console.error('Usage: node scripts/cloud-env-doctor.mjs <path-to-.env>')
  process.exit(2)
}
const path = resolve(file)
if (!existsSync(path)) {
  console.error(`No such file: ${path}`)
  process.exit(2)
}

// Derive the environment from the filename (.env.staging → staging), else NODE_ENV.
// A sibling `<file>.local` overlays the shared env file (git-ignored, never
// committed) — used for local-dev-against-staging overrides like a localhost
// WorkOS redirect or a `stripe listen` webhook secret (exploration 0201). The
// doctor reports the *effective* env so the verdict matches what the dev server sees.
const parsed = parseEnv(readFileSync(path, 'utf8'))
const localPath = `${path}.local`
if (existsSync(localPath)) Object.assign(parsed, parseEnv(readFileSync(localPath, 'utf8')))
const fromName = ENVIRONMENTS.find((e) => basename(path).includes(e))
const env = fromName ?? (parsed.NODE_ENV === 'development' ? 'development' : 'production')

function parseEnv(text) {
  const out = {}
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 0) continue
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim()
  }
  return out
}

const isFilled = (v) => Boolean(v) && !v.startsWith('CHANGEME') && !v.startsWith('__')

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'

console.log(`\n${BOLD}xNet Cloud env doctor${RESET}  ${DIM}${path}${RESET}`)
console.log(`Environment: ${BOLD}${env}${RESET}\n`)

const dev = env === 'development'
const missingByMilestone = { M1: [], M2: [] }
let lastGroup = null

for (const spec of VARS) {
  const required = rawValue(spec, env) !== '' // schema expects a value for this env
  const value = parsed[spec.key]
  const filled = isFilled(value)
  if (spec.group !== lastGroup) {
    console.log(`${DIM}${spec.group}${RESET}`)
    lastGroup = spec.group
  }
  let mark
  if (!required) {
    mark = `${DIM}–${RESET}`
  } else if (filled) {
    mark = `${GREEN}✓${RESET}`
  } else {
    mark = `${RED}✗${RESET}`
    if (!dev && spec.milestone !== 'optional') {
      const bucket = MILESTONE_ORDER[spec.milestone] <= MILESTONE_ORDER.M1 ? 'M1' : 'M2'
      missingByMilestone[bucket].push(spec.key)
    }
  }
  const note = required && !filled ? `  ${DIM}← ${spec.where}${RESET}` : ''
  console.log(`  ${mark} ${spec.key}${note}`)
}

console.log('')
if (dev) {
  console.log(`${DIM}Development runs on in-memory fakes — no external keys required.${RESET}`)
  process.exit(0)
}

const m1Ok = missingByMilestone.M1.length === 0
const m2Ok = m1Ok && missingByMilestone.M2.length === 0
console.log(`${m1Ok ? GREEN + '✓' : RED + '✗'} M1 (dogfood hub: R2 + GCP + secrets)${RESET}`)
if (!m1Ok) console.log(`    missing: ${missingByMilestone.M1.join(', ')}`)
console.log(`${m2Ok ? GREEN + '✓' : RED + '✗'} M2 (money path: + WorkOS + Stripe)${RESET}`)
if (!m2Ok && missingByMilestone.M2.length)
  console.log(`    missing: ${missingByMilestone.M2.join(', ')}`)

process.exit(m1Ok ? 0 : 1)
