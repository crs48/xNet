#!/usr/bin/env node
/**
 * Create the xNet plan Products + recurring Prices in Stripe and wire the Price IDs
 * into the control plane (exploration 0205).
 *
 *   node scripts/cloud-staging-stripe-prices.mjs            # create/find, print the price_… IDs
 *   node scripts/cloud-staging-stripe-prices.mjs --push     # also push IDs into Secret Manager
 *
 * Why: the checkout passes `STRIPE_PRICE_<PLAN>` straight to Stripe as the line-item
 * `price`. Stripe needs a *Price object ID* (`price_…`), not a literal amount — a
 * dollar figure there yields a 500 ("price parameter should be the ID of a price
 * object"). This is idempotent (Stripe `lookup_key`), so re-running reuses prices.
 *
 * Amounts come from your existing `STRIPE_PRICE_<PLAN>` if it's a number (e.g. 4.99);
 * if it's already a `price_…` ID it's reused as-is. Reads STRIPE_SECRET_KEY from the
 * env or apps/cloud/.env.staging.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const push = process.argv.includes('--push')
const PROJECT = process.env.PROJECT ?? 'xnet-cloud-staging-0'

const PLANS = [
  { plan: 'personal', envKey: 'STRIPE_PRICE_PERSONAL', secret: 'stripe-price-personal', name: 'xNet Personal', fallback: 4.99 },
  { plan: 'family', envKey: 'STRIPE_PRICE_FAMILY', secret: 'stripe-price-family', name: 'xNet Family', fallback: 14.99 },
  { plan: 'team', envKey: 'STRIPE_PRICE_TEAM', secret: 'stripe-price-team', name: 'xNet Team (per seat)', fallback: 11.99 }
]

function parseEnvFile() {
  const path = resolve('apps/cloud/.env.staging')
  const out = {}
  if (!existsSync(path)) return out
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const t = raw.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return out
}

const fileEnv = parseEnvFile()
const key = process.env.STRIPE_SECRET_KEY || fileEnv.STRIPE_SECRET_KEY
if (!key || key.startsWith('CHANGEME')) {
  console.error('✗ No STRIPE_SECRET_KEY (env or apps/cloud/.env.staging).')
  process.exit(2)
}
if (key.startsWith('sk_live')) {
  console.error('✗ That is a LIVE key — use the test-mode sk_test_… key for staging.')
  process.exit(2)
}

const api = async (method, path, params) => {
  const body = params ? new URLSearchParams(params) : undefined
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
    },
    ...(body ? { body } : {})
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
  return json
}

const results = []
for (const p of PLANS) {
  const current = process.env[p.envKey] || fileEnv[p.envKey] || ''
  if (current.startsWith('price_')) {
    console.log(`• ${p.plan}: already a price ID (${current}) — reusing`)
    results.push({ ...p, priceId: current })
    continue
  }
  const lookup = `xnet_staging_${p.plan}`
  // Idempotent: reuse an existing price with this lookup_key.
  const found = await api('GET', `prices?lookup_keys[]=${lookup}&active=true&limit=1`)
  if (found.data?.length) {
    console.log(`• ${p.plan}: found existing price ${found.data[0].id}`)
    results.push({ ...p, priceId: found.data[0].id })
    continue
  }
  const amount = Number(current) || p.fallback
  const cents = Math.round(amount * 100)
  const product = await api('POST', 'products', { name: p.name })
  const price = await api('POST', 'prices', {
    product: product.id,
    currency: 'usd',
    unit_amount: String(cents),
    'recurring[interval]': 'month',
    lookup_key: lookup
  })
  console.log(`• ${p.plan}: created ${price.id}  ($${amount}/mo, product ${product.id})`)
  results.push({ ...p, priceId: price.id })
}

console.log('\nPrice IDs:')
for (const r of results) console.log(`  ${r.envKey}=${r.priceId}`)

if (push) {
  console.log('\nPushing to Secret Manager…')
  for (const r of results) {
    execFileSync('gcloud', ['secrets', 'versions', 'add', r.secret, '--data-file=-', '--project', PROJECT], {
      input: r.priceId,
      stdio: ['pipe', 'ignore', 'inherit']
    })
    console.log(`  ✓ ${r.secret}`)
  }
  console.log('\nNow roll a new revision so the service reads the new versions:')
  console.log(`  gcloud run services update xnet-cloud-staging --project ${PROJECT} --region us-central1 \\`)
  console.log('    --update-secrets ' + results.map((r) => `${r.envKey}=${r.secret}:latest`).join(','))
} else {
  console.log('\nRe-run with --push to store these in Secret Manager, or paste them into apps/cloud/.env.staging.')
}
