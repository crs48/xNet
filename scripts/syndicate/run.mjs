#!/usr/bin/env node
/**
 * Announce new xNet work on Bluesky (exploration 0432).
 *
 * POSSE: xnet.fyi is where things are published; this posts a copy that links
 * home. It reads the DEPLOYED feeds rather than the workspace, so it can only
 * announce something that is genuinely live.
 *
 * Usage:
 *   node scripts/syndicate/run.mjs --dry-run     # plan only, no network writes
 *   node scripts/syndicate/run.mjs               # post (needs BLUESKY_APP_PASSWORD)
 *
 * Flags:
 *   --dry-run        plan and print; never sign in, never post
 *   --base <url>     feed origin (default https://xnet.fyi)
 *   --max <n>        safety cap on posts per run (default 3)
 *   --ledger <path>  override docs/syndication/log.json
 *
 * Exit codes: 0 all planned work done, 1 at least one post failed.
 *
 * X is not automated on purpose — it charges $0.20 per post containing a link.
 * The X text is printed here and to the job summary for a manual paste.
 */

import { appendFileSync } from 'node:fs'
import {
  handledKeys,
  LEDGER_PATH,
  readLedger,
  recordFailure,
  recordPosted,
  seed,
  writeLedger
} from './ledger.mjs'
import { flaggedEntries, parseBlogFeed, select, SITE_URL } from './select.mjs'
import { createPost, createSession } from './bluesky.mjs'

function parseArgs(argv) {
  const out = { dryRun: false, base: SITE_URL, max: 3, ledger: LEDGER_PATH }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--base') out.base = argv[++i]
    else if (a === '--max') out.max = Number(argv[++i])
    else if (a === '--ledger') out.ledger = argv[++i]
    else {
      console.error(`unknown argument: ${a}`)
      process.exit(2)
    }
  }
  return out
}

async function fetchText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`)
  return res.text()
}

/** Both feeds. A fetch failure throws — a stale plan is worse than no plan. */
async function loadFeeds(base) {
  const [blogXml, changelogJson] = await Promise.all([
    fetchText(`${base}/blog/rss.xml`),
    fetchText(`${base}/changelog.json`)
  ])
  return {
    posts: parseBlogFeed(blogXml),
    entries: flaggedEntries(JSON.parse(changelogJson))
  }
}

function summarize(lines) {
  const path = process.env.GITHUB_STEP_SUMMARY
  if (!path) return
  appendFileSync(path, lines.join('\n') + '\n')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const now = new Date().toISOString()

  const handle = process.env.BLUESKY_HANDLE
  const appPassword = process.env.BLUESKY_APP_PASSWORD
  const did = process.env.BLUESKY_DID
  // Defaults to bsky.social; overridable for a self-hosted PDS (0372/0420) and
  // for exercising the failure path against a stub.
  const pds = process.env.BLUESKY_PDS || undefined
  // No credentials is a normal, supported state (an unconfigured repo), so it
  // degrades to a plan rather than failing the job.
  const canPost = Boolean(handle && appPassword) && !args.dryRun
  if (!canPost && !args.dryRun) {
    console.log('BLUESKY_HANDLE/BLUESKY_APP_PASSWORD not set — planning only.\n')
  }

  const ledger = readLedger(args.ledger)
  const feeds = await loadFeeds(args.base)
  const candidates = select(feeds, handledKeys(ledger))

  // First ever run: adopt the existing backlog silently. Without this the run
  // would announce all 24 published essays at once.
  if (!ledger.seededAt) {
    seed(ledger, candidates, now)
    writeLedger(ledger, args.ledger)
    console.log(
      `Seeded the ledger with ${candidates.length} already-published item(s). ` +
        `Nothing was posted — only work published from now on is announced.`
    )
    summarize(['## Syndication', '', `Seeded ${candidates.length} existing items. No posts.`])
    return 0
  }

  if (!candidates.length) {
    console.log('Nothing new to announce.')
    return 0
  }

  const planned = candidates.slice(0, args.max)
  if (candidates.length > planned.length) {
    // Never silently truncate — a capped run must say what it dropped.
    console.log(
      `NOTE: ${candidates.length} candidates, capped at ${args.max} this run. ` +
        `Deferred: ${candidates.slice(args.max).map((c) => c.key).join(', ')}`
    )
  }

  let session
  if (canPost) {
    session = await createSession({ pds, handle, appPassword, did })
  }

  const failures = []
  const summary = ['## Syndication', '']

  for (const item of planned) {
    console.log(`\n--- ${item.key} (${item.kind})`)
    console.log(item.text)

    if (!canPost) {
      console.log('[dry run] not posted')
      continue
    }
    try {
      const bluesky = await createPost({ pds, session, text: item.text, now })
      recordPosted(ledger, { ...item, bluesky }, now)
      console.log(`posted → ${bluesky.url}`)
      summary.push(`- ✅ [${item.headline}](${bluesky.url})`)
    } catch (error) {
      recordFailure(ledger, item, error, now)
      failures.push({ item, error })
      console.error(`FAILED: ${error.message}`)
      summary.push(`- ❌ ${item.headline} — ${error.message}`)
    }
    writeLedger(ledger, args.ledger)
  }

  // X is manual by design; make the paste trivial.
  summary.push('', '### Paste to X', '')
  for (const item of planned) {
    summary.push('```', item.text, '```', '')
  }
  summarize(summary)

  if (failures.length) {
    console.error(`\n${failures.length} of ${planned.length} failed.`)
    return 1
  }
  console.log(`\n${canPost ? 'Posted' : 'Planned'} ${planned.length} item(s).`)
  return 0
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error.message)
    process.exit(1)
  }
)
