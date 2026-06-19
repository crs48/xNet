#!/usr/bin/env node
/**
 * Ensure the Stripe (test-mode) webhook endpoint for staging exists (exploration 0205).
 *
 *   node scripts/cloud-staging-stripe-webhook.mjs                 # CHECK only (safe, read-only)
 *   node scripts/cloud-staging-stripe-webhook.mjs --create        # create it if missing
 *
 * Reads STRIPE_SECRET_KEY from the environment, or from apps/cloud/.env.staging
 * (+ .env.staging.local). The control plane handles `checkout.session.completed`
 * (provision) and `customer.subscription.deleted` (suspend) at /webhooks/stripe.
 *
 * Stripe only reveals a webhook's signing secret when it is CREATED, so on --create
 * this prints the `whsec_…` and the two commands to land it (Secret Manager + your
 * env file). Default is check-only so you never make a duplicate endpoint by accident.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const create = process.argv.includes('--create')
const ENDPOINT = process.env.WEBHOOK_URL ?? 'https://cloud-staging.xnet.fyi/webhooks/stripe'
const PROJECT = process.env.PROJECT ?? 'xnet-cloud-staging-0'
const EVENTS = ['checkout.session.completed', 'customer.subscription.deleted']

function envFromFile() {
  const path = resolve('apps/cloud/.env.staging')
  if (!existsSync(path)) return {}
  const out = {}
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const t = raw.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  const local = `${path}.local`
  if (existsSync(local)) {
    for (const raw of readFileSync(local, 'utf8').split('\n')) {
      const t = raw.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).trim()
    }
  }
  return out
}

const key = process.env.STRIPE_SECRET_KEY || envFromFile().STRIPE_SECRET_KEY
if (!key || key.startsWith('CHANGEME')) {
  console.error('✗ No STRIPE_SECRET_KEY (env or apps/cloud/.env.staging).')
  process.exit(2)
}
if (key.startsWith('sk_live')) {
  console.error('✗ That is a LIVE key. Use the test-mode sk_test_… key for staging.')
  process.exit(2)
}

const api = async (method, path, form) => {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
    },
    ...(form ? { body: form } : {})
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
  return body
}

const list = await api('GET', 'webhook_endpoints?limit=100')
const existing = (list.data ?? []).find((e) => e.url === ENDPOINT)

if (existing) {
  const events = existing.enabled_events ?? []
  const missing = EVENTS.filter((e) => !events.includes(e) && !events.includes('*'))
  console.log(`✓ Webhook already exists: ${existing.id} (status: ${existing.status})`)
  console.log(`  url:    ${existing.url}`)
  console.log(`  events: ${events.join(', ') || '(none)'}`)
  if (missing.length) {
    console.log(`⚠ Missing required events: ${missing.join(', ')}`)
    console.log(`  Add them in the dashboard, or delete + re-run with --create.`)
  } else {
    console.log('  All required events present. Nothing to do.')
  }
  console.log(
    '\nNote: the signing secret of an existing endpoint is only visible in the dashboard'
  )
  console.log('  (Developers → Webhooks → your endpoint → Signing secret). It must match the')
  console.log('  `stripe-webhook` Secret Manager value the service reads.')
  process.exit(0)
}

if (!create) {
  console.log(`– No webhook endpoint for ${ENDPOINT} yet.`)
  console.log('  Re-run with --create to make one (prints the signing secret to land).')
  process.exit(0)
}

const form = new URLSearchParams()
form.set('url', ENDPOINT)
for (const e of EVENTS) form.append('enabled_events[]', e)
form.set('description', 'xNet Cloud staging (exploration 0205)')
const made = await api('POST', 'webhook_endpoints', form)
console.log(`✓ Created webhook ${made.id} → ${made.url}`)
console.log(`  events: ${(made.enabled_events ?? []).join(', ')}`)
console.log(`\nSigning secret (store it — shown once):\n  ${made.secret}`)
console.log('\nLand it where the deployed service + local runs read it:')
console.log(`  printf '%s' '${made.secret}' | gcloud secrets versions add stripe-webhook --data-file=- --project ${PROJECT}`)
console.log('  # and update STRIPE_WEBHOOK_SECRET in apps/cloud/.env.staging')
