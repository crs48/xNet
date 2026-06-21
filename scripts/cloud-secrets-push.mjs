#!/usr/bin/env node
/**
 * xNet Cloud — push a control-plane .env file into GCP Secret Manager
 * (exploration 0205). The deploy (`deploy-cloud.yml` / SETUP Part 5) resolves
 * secrets with `--set-secrets name=<secret>:latest`, so those secret *resources*
 * must exist in the project first. `cloud-init-env.mjs` builds the .env, the
 * doctor checks it, the GCP bootstrap makes the project — this is the missing
 * step that lands the secret values where the deployed service reads them.
 *
 *   node scripts/cloud-secrets-push.mjs apps/cloud/.env.staging xnet-cloud-staging-0
 *   node scripts/cloud-secrets-push.mjs apps/cloud/.env.staging xnet-cloud-staging-0 --dry-run
 *
 * Idempotent: each secret is created if missing, then a new version is added
 * (so re-running rotates the value). Values still set to CHANGEME_* / empty are
 * skipped with a warning. Reads a sibling `<file>.local` overlay if present (same
 * convention as the doctor), so a `stripe listen` whsec or localhost redirect can
 * ride along when you mean it to.
 *
 * Only secret-bearing vars are pushed — non-secret config (URLs, region, bucket
 * name) is passed inline via `--set-env-vars` at deploy time, never as a secret.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const [fileArg, projectArg, ...rest] = process.argv.slice(2)
const dryRun = rest.includes('--dry-run')
if (!fileArg || !projectArg) {
  console.error('Usage: node scripts/cloud-secrets-push.mjs <path-to-.env> <gcp-project> [--dry-run]')
  process.exit(2)
}
const path = resolve(fileArg)
if (!existsSync(path)) {
  console.error(`No such file: ${path}`)
  process.exit(2)
}

/**
 * ENV_VAR → Secret Manager secret id. Keep in lockstep with the `--set-secrets`
 * list in `.github/workflows/deploy-cloud.yml` and `docs/cloud/SETUP.md`.
 */
const SECRET_NAMES = {
  XNET_PLAN_SECRET: 'xnet-plan-secret',
  XNET_CLOUD_SESSION_SECRET: 'session-secret',
  XNET_CLOUD_INTERNAL_SECRET: 'internal-secret',
  WORKOS_CLIENT_ID: 'workos-client-id',
  WORKOS_API_KEY: 'workos-api-key',
  WORKOS_REDIRECT_URI: 'workos-redirect-uri',
  STRIPE_SECRET_KEY: 'stripe-secret',
  STRIPE_WEBHOOK_SECRET: 'stripe-webhook',
  STRIPE_PRICE_PERSONAL: 'stripe-price-personal',
  STRIPE_PRICE_FAMILY: 'stripe-price-family',
  STRIPE_PRICE_TEAM: 'stripe-price-team',
  R2_ACCOUNT_ID: 'r2-account-id',
  R2_ENDPOINT: 'r2-endpoint',
  R2_ACCESS_KEY_ID: 'r2-key-id',
  R2_SECRET_ACCESS_KEY: 'r2-secret',
  GCP_ARTIFACT_REGISTRY: 'gcp-artifact-registry'
  // Note: SENTRY_DSN is NOT a Secret Manager secret — a Sentry DSN is a
  // write-only ingestion key (public in client builds), so it rides as a plain
  // env var from the `CLOUD_SENTRY_DSN` repo variable in deploy-cloud.yml. That
  // also avoids a missing-secret deploy failure when Sentry is left unconfigured.
}

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

const env = parseEnv(readFileSync(path, 'utf8'))
const localPath = `${path}.local`
if (existsSync(localPath)) Object.assign(env, parseEnv(readFileSync(localPath, 'utf8')))

const isFilled = (v) => Boolean(v) && !v.startsWith('CHANGEME') && !v.startsWith('__')

const gcloud = (args, input) =>
  execFileSync('gcloud', [...args, '--project', projectArg], {
    input,
    stdio: input === undefined ? ['ignore', 'ignore', 'ignore'] : ['pipe', 'ignore', 'inherit']
  })

let pushed = 0
let skipped = 0
for (const [key, secret] of Object.entries(SECRET_NAMES)) {
  const value = env[key]
  if (!isFilled(value)) {
    console.warn(`– skip ${secret} (no usable ${key})`)
    skipped++
    continue
  }
  if (dryRun) {
    console.log(`would push ${secret}  ← ${key}`)
    pushed++
    continue
  }
  let exists = true
  try {
    gcloud(['secrets', 'describe', secret])
  } catch {
    exists = false
  }
  if (!exists) gcloud(['secrets', 'create', secret, '--replication-policy=automatic'])
  gcloud(['secrets', 'versions', 'add', secret, '--data-file=-'], value)
  console.log(`✓ ${secret}${exists ? ' (new version)' : ' (created)'}`)
  pushed++
}

console.log(`\n${dryRun ? '[dry-run] ' : ''}${pushed} secret(s) ${dryRun ? 'pending' : 'pushed'}, ${skipped} skipped.`)
if (!dryRun && pushed > 0) {
  console.log(`Verify: gcloud secrets list --project ${projectArg}`)
}
