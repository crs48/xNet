/**
 * The syndication ledger — what has been announced, and what failed
 * (exploration 0432).
 *
 * Lives at docs/syndication/log.json. It MUST stay outside `site/`:
 * deploy-site.yml triggers on `site/**`, so a ledger there would make every
 * syndication run retrigger the deploy, which retriggers syndication.
 *
 * Receipts in git, in the same spirit as the Charter claims ledger — the
 * record of what was posted is the auditable part.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export const LEDGER_PATH = 'docs/syndication/log.json'

/** Give up on an item after this many failed attempts. */
export const MAX_ATTEMPTS = 3

const EMPTY = { version: 1, seededAt: null, posted: [], failed: [] }

export function readLedger(path = LEDGER_PATH) {
  if (!existsSync(path)) return { ...EMPTY, posted: [], failed: [] }
  // A corrupt ledger must NOT read as "nothing posted yet" — that would
  // re-announce the entire backlog. Fail loudly instead.
  let raw
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch (cause) {
    throw new Error(`${path} is not valid JSON — refusing to run (would re-post everything)`, {
      cause
    })
  }
  if (!Array.isArray(raw.posted) || !Array.isArray(raw.failed)) {
    throw new Error(`${path} is missing posted/failed arrays — refusing to run`)
  }
  return raw
}

export function writeLedger(ledger, path = LEDGER_PATH) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(ledger, null, 2) + '\n')
}

/**
 * Keys already handled — posted, or failed too many times to keep retrying.
 *
 * Abandoned keys stay in `failed` with their reason rather than being dropped:
 * "absent" and "gave up" must be different states.
 */
export function handledKeys(ledger) {
  return new Set([
    ...ledger.posted.map((p) => p.key),
    ...ledger.failed.filter((f) => f.attempts >= MAX_ATTEMPTS).map((f) => f.key)
  ])
}

export function recordPosted(ledger, { key, kind, url, text, bluesky }, now) {
  ledger.posted.push({ key, kind, url, postedAt: now, bluesky, text })
  ledger.failed = ledger.failed.filter((f) => f.key !== key)
  return ledger
}

export function recordFailure(ledger, { key, url }, error, now) {
  const existing = ledger.failed.find((f) => f.key === key)
  if (existing) {
    existing.attempts += 1
    existing.lastError = String(error?.message ?? error)
    existing.lastAttemptAt = now
  } else {
    ledger.failed.push({
      key,
      url,
      attempts: 1,
      lastError: String(error?.message ?? error),
      lastAttemptAt: now
    })
  }
  return ledger
}

/**
 * First run: adopt everything already published without announcing it.
 *
 * Without this the first run would post all 24 existing essays at once. The
 * ledger starts from "now", and only things published after it get announced.
 */
export function seed(ledger, candidates, now) {
  ledger.seededAt = now
  for (const c of candidates) {
    ledger.posted.push({
      key: c.key,
      kind: c.kind,
      url: c.url,
      postedAt: now,
      seeded: true,
      note: 'published before syndication was switched on; not announced'
    })
  }
  return ledger
}
