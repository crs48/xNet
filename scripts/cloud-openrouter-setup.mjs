#!/usr/bin/env node
/**
 * Managed-AI (OpenRouter) setup + preflight — exploration 0208.
 *
 * One command to verify your OpenRouter account is ready for xNet Cloud managed
 * AI and to emit the exact control-plane env. It is READ-ONLY by default:
 *
 *   1. validates the Provisioning API key (lists provisioned keys),
 *   2. checks the credit balance (best-effort),
 *   3. fetches the live model catalog (the picker's data source),
 *   4. with --probe-mint, mints a $0.01 test key and immediately deletes it —
 *      exercising the exact path the control plane uses per tenant,
 *   5. prints the env block (and writes it with --write <env>).
 *
 * The per-hub forwarder env (XNET_CLOUD_URL / XNET_CLOUD_INTERNAL_SECRET /
 * XNET_TENANT_ID) is injected automatically by the control plane at provision
 * time — you do NOT set it on hubs. See docs/cloud/MANAGED_AI_SETUP.md.
 *
 * Usage:
 *   OPENROUTER_MANAGEMENT_KEY=sk-or-... node scripts/cloud-openrouter-setup.mjs
 *   node scripts/cloud-openrouter-setup.mjs --key sk-or-... --probe-mint
 *   node scripts/cloud-openrouter-setup.mjs --key sk-or-... --write staging
 */

import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = 'https://openrouter.ai/api/v1'
const c = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  bold: '\x1b[1m'
}
const ok = (m) => console.log(`${c.green}✓${c.reset} ${m}`)
const warn = (m) => console.log(`${c.yellow}!${c.reset} ${m}`)
const fail = (m) => console.log(`${c.red}✗${c.reset} ${m}`)
const head = (m) => console.log(`\n${c.bold}${m}${c.reset}`)

function parseArgs(argv) {
  const out = { probeMint: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--probe-mint') out.probeMint = true
    else if (a === '--key') out.key = argv[++i]
    else if (a === '--base-url') out.baseUrl = argv[++i]
    else if (a === '--write') out.write = argv[++i]
    else if (a === '--markup') out.markup = argv[++i]
    else if (a === '--help' || a === '-h') out.help = true
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  console.log(
    readFileSync(new URL(import.meta.url))
      .toString()
      .split('\n')
      .slice(1, 33)
      .join('\n')
  )
  process.exit(0)
}

const base = (args.baseUrl ?? BASE).replace(/\/+$/, '')
const key = args.key ?? process.env.OPENROUTER_MANAGEMENT_KEY
if (!key) {
  fail('No management key. Pass --key sk-or-... or set OPENROUTER_MANAGEMENT_KEY.')
  console.log(
    `${c.dim}Create one at https://openrouter.ai/settings/provisioning-api-keys${c.reset}`
  )
  process.exit(1)
}

const auth = { authorization: `Bearer ${key}`, 'content-type': 'application/json' }
const call = async (method, path, body) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: auth,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = { raw: text }
  }
  return { res, json }
}

let failures = 0

// 1) Provisioning key valid? (lists provisioned keys — the admin scope)
head('1. Provisioning API key')
{
  const { res, json } = await call('GET', '/keys')
  if (res.ok) {
    const n = Array.isArray(json.data) ? json.data.length : 0
    ok(`Key is a valid Provisioning key (sees ${n} provisioned key${n === 1 ? '' : 's'}).`)
  } else if (res.status === 401 || res.status === 403) {
    failures++
    fail(
      `Key rejected by GET /keys (${res.status}). This must be a *Provisioning* API key, ` +
        `not a normal inference key. Create one: Settings → Provisioning API Keys.`
    )
  } else {
    failures++
    fail(`GET /keys → ${res.status}. ${JSON.stringify(json).slice(0, 200)}`)
  }
}

// 2) Credit balance (best-effort: provisioning keys may not expose it)
head('2. Credit balance')
{
  const { res, json } = await call('GET', '/credits')
  if (res.ok && json.data) {
    const total = Number(json.data.total_credits ?? 0)
    const used = Number(json.data.total_usage ?? 0)
    const left = total - used
    if (left > 0) ok(`~$${left.toFixed(2)} of credit available ($${total.toFixed(2)} purchased).`)
    else warn(`Credit balance looks empty ($${left.toFixed(2)}). Add credits before launch.`)
  } else {
    warn(
      `Could not read /credits (${res.status}) — provisioning keys often can't; ` +
        `confirm your balance at https://openrouter.ai/credits.`
    )
  }
}

// 3) Model catalog — the picker's data source
head('3. Model catalog (GET /models)')
{
  const res = await fetch(`${base}/models`)
  if (res.ok) {
    const { data } = await res.json()
    const models = Array.isArray(data) ? data : []
    ok(`Catalog reachable — ${models.length} models.`)
    const wanted = [
      'anthropic/claude-sonnet-4-6',
      'anthropic/claude-haiku-4-5',
      'openai/gpt-4o-mini',
      'google/gemini-2.5-flash'
    ]
    const ids = new Set(models.map((m) => m.id))
    for (const id of wanted) {
      if (ids.has(id)) ok(`  ${id} present`)
      else warn(`  ${id} NOT in catalog — update the plan model lists in packages/entitlements.`)
    }
  } else {
    failures++
    fail(`GET /models → ${res.status}.`)
  }
}

// 4) Optional: mint + delete a test key (exercises the control plane's exact path)
head(`4. Provisioning round-trip ${args.probeMint ? '' : '(skipped — pass --probe-mint)'}`)
if (args.probeMint) {
  const created = await call('POST', '/keys', { name: 'xnet-setup-probe (delete me)', limit: 0.01 })
  if (!created.res.ok || !created.json.key || !created.json.data?.hash) {
    failures++
    fail(`POST /keys → ${created.res.status}. ${JSON.stringify(created.json).slice(0, 200)}`)
  } else {
    ok(`Minted a $0.01 test key (hash ${String(created.json.data.hash).slice(0, 12)}…).`)
    const del = await call('DELETE', `/keys/${encodeURIComponent(created.json.data.hash)}`)
    if (del.res.ok) ok('Deleted the test key — Provisioning API works end-to-end.')
    else {
      failures++
      fail(`DELETE /keys → ${del.res.status}. Delete it manually in the dashboard.`)
    }
  }
}

// 5) The control-plane env block
head('5. Control-plane env (apps/cloud)')
const markup = args.markup ?? '1.3'
const block = [
  'AI_GATEWAY_PROVIDER=openrouter',
  'AI_GATEWAY_BASE_URL=https://openrouter.ai/api/v1',
  `OPENROUTER_MANAGEMENT_KEY=${key}`,
  `AI_MARKUP=${markup}`,
  '# Optional global cap (per-plan gating lives in entitlements aiModels):',
  '# AI_ALLOWED_MODELS=anthropic/claude-sonnet-4-6,openai/gpt-4o-mini'
].join('\n')
console.log(`${c.dim}${block}${c.reset}`)
console.log(
  `${c.dim}\nAlso required (you already set these for the control plane):${c.reset}\n` +
    `${c.dim}  XNET_CLOUD_BASE_URL   — the control plane's public URL${c.reset}\n` +
    `${c.dim}  XNET_CLOUD_INTERNAL_SECRET — shared hub↔control-plane secret${c.reset}\n` +
    `${c.dim}  STRIPE_SECRET_KEY     — for real metering (else a no-op fake)${c.reset}`
)
console.log(
  `\n${c.bold}Hubs need no AI config.${c.reset} The control plane injects ` +
    `XNET_CLOUD_URL / XNET_CLOUD_INTERNAL_SECRET / XNET_TENANT_ID into every AI-enabled hub at provision time.`
)

if (args.write) {
  const file = join('apps/cloud', `.env.${args.write}`)
  if (!existsSync(file)) {
    warn(`${file} does not exist — create it first (see scripts/cloud-init-env.mjs). Not written.`)
  } else {
    appendFileSync(
      file,
      `\n# Managed AI (OpenRouter) — added by cloud-openrouter-setup.mjs\n${block}\n`
    )
    ok(`Appended the env block to ${file}. Review it, then push secrets to your secret store.`)
  }
}

head(
  failures === 0 ? `${c.green}Ready.${c.reset}` : `${c.red}${failures} blocking issue(s).${c.reset}`
)
console.log(`${c.dim}Full walkthrough: docs/cloud/MANAGED_AI_SETUP.md${c.reset}`)
process.exit(failures === 0 ? 0 : 1)
