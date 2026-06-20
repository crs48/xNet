#!/usr/bin/env node
/**
 * xNet Cloud — compute one week of run-in-public business metrics from live Stripe
 * (exploration 0201, Phase D). It reads the committed snapshot as its base, appends
 * (or replaces) the current ISO-week row with the real paying-customer count + MRR
 * pulled from Stripe, carries forward the latest cost structure (tune per week),
 * and writes a `CompanyMetrics` JSON ready for the publish gate:
 *
 *   STRIPE_SECRET_KEY=sk_… node scripts/cloud-company-metrics.mjs > company-metrics.json
 *   node scripts/cloud-metrics-rollup.mjs company-metrics.json   # re-applies k-anon, writes the site
 *
 * Without STRIPE_SECRET_KEY it is a **clean no-op** (exit 0) — so a scheduled job
 * stays green until billing is live and the snapshot keeps its committed values.
 * MRR is read straight from active subscriptions (monthly-normalized); AI/infra
 * COGS still come from the metered ledger and are carried forward here until that
 * read is wired (see the checklist in exploration 0201).
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = resolve(__dirname, '../site/src/data/metrics.json')
const outArg = process.argv[2]

const key = process.env.STRIPE_SECRET_KEY
if (!key) {
  console.error('skipped: set STRIPE_SECRET_KEY to generate real metrics (snapshot unchanged).')
  process.exit(0)
}

/** Monday (UTC) of the current ISO week, as YYYY-MM-DD — the row key the page uses. */
function currentWeekMonday() {
  const d = new Date()
  const day = (d.getUTCDay() + 6) % 7 // 0 = Monday
  d.setUTCDate(d.getUTCDate() - day)
  return d.toISOString().slice(0, 10)
}

/** Page through Stripe active subscriptions (REST, no SDK dependency). */
async function fetchActiveSubscriptions() {
  const subs = []
  let startingAfter
  for (;;) {
    const params = new URLSearchParams({ status: 'active', limit: '100' })
    if (startingAfter) params.set('starting_after', startingAfter)
    const res = await fetch(`https://api.stripe.com/v1/subscriptions?${params}`, {
      headers: { authorization: `Bearer ${key}` }
    })
    if (!res.ok) throw new Error(`Stripe ${res.status}: ${await res.text()}`)
    const page = await res.json()
    subs.push(...page.data)
    if (!page.has_more || page.data.length === 0) break
    startingAfter = page.data[page.data.length - 1].id
  }
  return subs
}

/** Monthly-normalized USD for one subscription item (cents → dollars). */
function itemMonthlyUsd(item) {
  const price = item.price ?? {}
  const cents = (price.unit_amount ?? 0) * (item.quantity ?? 1)
  const rec = price.recurring ?? { interval: 'month', interval_count: 1 }
  const count = rec.interval_count || 1
  const perMonthCents = rec.interval === 'year' ? cents / (12 * count) : cents / count
  return perMonthCents / 100
}

/**
 * Live fleet usage totals (exploration 0207) from the control plane's internal
 * endpoint, when pointed at one. Aggregate-only by construction; the publish gate
 * re-applies the cohort floor. Returns undefined (carry the committed block forward)
 * when not configured or unreachable, so the job stays green pre-launch.
 */
async function fetchUsage() {
  const url = process.env.XNET_CLOUD_USAGE_URL
  if (!url) return undefined
  const secret = process.env.XNET_CLOUD_INTERNAL_SECRET
  try {
    const res = await fetch(url, { headers: secret ? { 'x-internal-secret': secret } : {} })
    if (!res.ok) {
      console.error(`usage fetch ${res.status}: carrying the committed usage block forward.`)
      return undefined
    }
    return await res.json()
  } catch (err) {
    console.error(`usage fetch failed (${err.message}): carrying the committed usage block forward.`)
    return undefined
  }
}

const subs = await fetchActiveSubscriptions()
const customers = new Set(subs.map((s) => s.customer)).size
const mrrUsd = Math.round(
  subs.reduce((sum, s) => sum + (s.items?.data ?? []).reduce((a, i) => a + itemMonthlyUsd(i), 0), 0)
)

const base = JSON.parse(readFileSync(BASE, 'utf8'))
const prior = base.weeks ?? []
const carry = prior[prior.length - 1]?.costs ?? {
  infraUsd: 0,
  payrollUsd: 0,
  saasUsd: 0,
  otherUsd: 0
}
const week = currentWeekMonday()
const priorCustomers = prior[prior.length - 1]?.customers ?? 0
const row = {
  week,
  customers,
  newCustomers: Math.max(0, customers - priorCustomers),
  churnedCustomers: 0, // requires period-over-period subscription history — a follow-up
  mrrUsd,
  costs: { ...carry } // carry forward last week's costs; tune infra/AI COGS per week
}

// Replace the row for this week if it already exists, else append.
const weeks = [...prior.filter((w) => w.week !== week), row].sort((a, b) =>
  a.week < b.week ? -1 : 1
)
// Live usage when the control plane is reachable, else carry the committed block.
const usage = (await fetchUsage()) ?? base.usage
const snapshot = {
  updated: new Date().toISOString().slice(0, 10),
  cohortFloor: base.cohortFloor ?? 5,
  // NOTE: once these are real, drop `sample: true` from site/src/data/metrics.json.
  ...(base.sample ? { sample: true } : {}),
  weeks,
  breakEven: base.breakEven ?? { reached: false },
  ...(usage ? { usage } : {})
}

const json = `${JSON.stringify(snapshot, null, 2)}\n`
if (outArg) {
  writeFileSync(resolve(outArg), json)
  console.error(
    `Wrote ${outArg} — week ${week}: ${customers} customers, $${mrrUsd} MRR${usage ? `, ${usage.hubsHosted} hubs` : ''}.`
  )
} else {
  process.stdout.write(json)
}
