#!/usr/bin/env node
/**
 * Publish the public business-metrics snapshot for the /open dashboard.
 *
 * The control plane computes the privacy-safe rollup (apps/cloud
 * `buildCompanyMetrics`) and exports a CompanyMetrics JSON. This script writes it
 * to site/src/data/metrics.json — the file the static site renders — and is meant
 * to run from a scheduled job that then opens a PR (the git history is the
 * transparency log; exploration 0200, slice C).
 *
 * Defense in depth: it RE-APPLIES the k-anonymity floor at write time, so a week
 * with fewer paying customers than `cohortFloor` can never be published even if
 * the upstream rollup is misconfigured. It also refuses any per-customer field.
 *
 * Usage:
 *   node scripts/cloud-metrics-rollup.mjs <company-metrics.json>
 *   cat company-metrics.json | node scripts/cloud-metrics-rollup.mjs -
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '../site/src/data/metrics.json')

const src = process.argv[2]
if (!src) {
  console.error('usage: cloud-metrics-rollup.mjs <company-metrics.json | ->')
  process.exit(2)
}

const rawText = src === '-' ? readFileSync(0, 'utf8') : readFileSync(resolve(src), 'utf8')
let input
try {
  input = JSON.parse(rawText)
} catch (err) {
  console.error(`Could not parse metrics JSON: ${err.message}`)
  process.exit(1)
}

if (!Array.isArray(input.weeks) || typeof input.cohortFloor !== 'number') {
  console.error('Input must be a CompanyMetrics object with { weeks[], cohortFloor }.')
  process.exit(1)
}

// Forbidden keys: nothing per-customer may ever be published.
const BANNED = ['customerId', 'did', 'email', 'name', 'revenuePerCustomer']
for (const w of input.weeks) {
  for (const k of BANNED) {
    if (k in w) {
      console.error(`Refusing to publish: week ${w.week} contains a per-customer field "${k}".`)
      process.exit(1)
    }
  }
}

// Publish gate: suppress any week below the cohort floor (k-anonymity), re-sort.
const before = input.weeks.length
const weeks = input.weeks
  .filter((w) => Number(w.customers) >= input.cohortFloor)
  .sort((a, b) => (a.week < b.week ? -1 : 1))
const dropped = before - weeks.length

const snapshot = {
  updated: input.updated ?? new Date().toISOString().slice(0, 10),
  cohortFloor: input.cohortFloor,
  ...(input.sample ? { sample: true } : {}),
  weeks,
  breakEven: input.breakEven ?? { reached: false }
}

writeFileSync(OUT, `${JSON.stringify(snapshot, null, 2)}\n`)
console.log(
  `Wrote ${weeks.length} week(s) to ${OUT}${dropped ? ` (suppressed ${dropped} below the ${input.cohortFloor}-customer floor)` : ''}.`
)
console.log('Next: commit the change and open a PR — the data lands publicly only after review.')
