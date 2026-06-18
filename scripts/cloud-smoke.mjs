#!/usr/bin/env node
/**
 * xNet Cloud — post-deploy smoke test (exploration 0201).
 *
 * Hits the *public* surface of a running control plane and asserts the contract,
 * so a deploy can be gated on it (it exits non-zero on any failure):
 *
 *   node scripts/cloud-smoke.mjs https://cloud-staging.xnet.fyi
 *   node scripts/cloud-smoke.mjs http://localhost:4455
 *
 * It only touches unauthenticated routes (no secrets needed), which is what makes
 * it safe to run from CI against staging. The authenticated paths (checkout,
 * /ai/chat, webhooks) are exercised separately — see docs/cloud/SETUP.md.
 */

const base = (process.argv[2] ?? '').replace(/\/$/, '')
if (!base) {
  console.error('usage: node scripts/cloud-smoke.mjs <baseUrl>')
  process.exit(2)
}

let failures = 0
const pass = (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`)
const fail = (msg) => {
  failures++
  console.error(`  \x1b[31m✗\x1b[0m ${msg}`)
}

async function check(name, fn) {
  try {
    await fn()
  } catch (err) {
    fail(`${name}: ${err.message}`)
  }
}

console.log(`\nxNet Cloud smoke test — ${base}\n`)

await check('GET /health', async () => {
  const res = await fetch(`${base}/health`)
  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`)
  const body = await res.json()
  if (body.status !== 'ok' || body.service !== 'xnet-cloud') {
    throw new Error(`unexpected body ${JSON.stringify(body)}`)
  }
  pass(`/health ok (substrate: ${body.substrate})`)
})

await check('GET /status.json', async () => {
  const res = await fetch(`${base}/status.json`)
  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`)
  const body = await res.json()
  if (!Array.isArray(body.components) || typeof body.overall !== 'string') {
    throw new Error(`unexpected shape ${JSON.stringify(body)}`)
  }
  const text = JSON.stringify(body)
  for (const banned of ['tenantId', 'hubUrl', 'billingUserId', 'email']) {
    if (text.includes(banned)) throw new Error(`leaked field "${banned}"`)
  }
  pass(`/status.json ok (overall: ${body.overall}, ${body.components.length} components)`)
})

await check('GET /auth/start', async () => {
  const res = await fetch(`${base}/auth/start`, { redirect: 'manual' })
  // 302 → WorkOS when configured; 200/redirect to a dev provider otherwise.
  if (res.status !== 302 && res.status !== 0 && res.status !== 200) {
    throw new Error(`expected a redirect, got ${res.status}`)
  }
  const loc = res.headers.get('location')
  pass(`/auth/start redirects${loc ? ` → ${new URL(loc, base).host}` : ''}`)
})

console.log('')
if (failures > 0) {
  console.error(`\x1b[31m${failures} check(s) failed\x1b[0m`)
  process.exit(1)
}
console.log('\x1b[32mAll smoke checks passed.\x1b[0m')
