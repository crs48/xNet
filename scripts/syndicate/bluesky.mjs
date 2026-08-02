/**
 * Bluesky sink — the only automated one (exploration 0432).
 *
 * X is deliberately NOT here: since 2026-02-06 it charges $0.20 per post
 * containing a link, and every POSSE post carries a link home by definition.
 * The runner prints paste-ready text for X instead. Do not add X credentials
 * to this repo.
 *
 * Zero-dep, mirroring scripts/atproto/publish-lexicons.mjs.
 */

import { graphemes, linkFacets, MAX_GRAPHEMES, verifyFacets } from './facets.mjs'

export const DEFAULT_PDS = 'https://bsky.social'

/**
 * Per-request timeout. Without it an unresponsive PDS hangs the job for the
 * runner's full default, and `concurrency: syndicate` means the next run
 * queues behind it rather than recovering.
 */
export const REQUEST_TIMEOUT_MS = 15_000

/**
 * Sign in with an app password (revocable, scoped — never the account
 * password) and assert we are who we think we are.
 *
 * The handle is a rented name that changes if the account moves to a custom
 * domain; the DID does not. Posting as an unexpected repo is a hard error, not
 * a warning.
 */
export async function createSession({ pds = DEFAULT_PDS, handle, appPassword, did }) {
  const res = await fetch(`${pds}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: handle, password: appPassword }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  if (!res.ok) {
    throw new Error(`Bluesky createSession ${res.status}: ${await res.text()}`)
  }
  const session = await res.json()
  if (did && session.did !== did) {
    throw new Error(`Bluesky: signed in as ${session.did}, expected ${did}`)
  }
  return session
}

/**
 * Post one record.
 *
 * Both guards below fail loudly rather than posting something broken: an
 * over-budget post would be rejected by the server anyway, and a bad facet
 * would ship a post whose "link" highlights a slice of prose.
 */
export async function createPost({ pds = DEFAULT_PDS, session, text, now }) {
  const count = graphemes(text)
  if (count > MAX_GRAPHEMES) {
    throw new Error(`Bluesky: ${count} graphemes exceeds the ${MAX_GRAPHEMES} limit`)
  }
  const facets = linkFacets(text)
  const problems = verifyFacets(text, facets)
  if (problems.length) {
    throw new Error(`Bluesky: bad link facets — ${problems.join('; ')}`)
  }

  const res = await fetch(`${pds}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${session.accessJwt}`
    },
    body: JSON.stringify({
      repo: session.did,
      collection: 'app.bsky.feed.post',
      record: {
        $type: 'app.bsky.feed.post',
        text,
        createdAt: now ?? new Date().toISOString(),
        facets
      }
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  if (!res.ok) {
    throw new Error(`Bluesky createRecord ${res.status}: ${await res.text()}`)
  }
  const { uri, cid } = await res.json()
  return { uri, cid, url: postUrl(session.handle ?? session.did, uri) }
}

/** Web URL for an at:// post uri. */
export function postUrl(handleOrDid, uri) {
  return `https://bsky.app/profile/${handleOrDid}/post/${uri.split('/').pop()}`
}

/**
 * Canonical URLs already present in our recent posts.
 *
 * The ledger alone cannot make this idempotent: if `createRecord` succeeds and
 * the process dies — or the ledger commit to `main` is rejected — the next run
 * would announce the same item again. A deterministic rkey would be the usual
 * fix, but `app.bsky.feed.post` declares `key: "tid"`, so the record key is not
 * ours to choose (exploration 0420). Reconciling against what is actually on
 * the repo is the approach that survives that.
 *
 * Reads are free and unmetered on Bluesky, so this costs nothing per run.
 */
export async function recentlyPostedUrls({ pds = DEFAULT_PDS, session, limit = 100 }) {
  const params = new URLSearchParams({
    repo: session.did,
    collection: 'app.bsky.feed.post',
    limit: String(limit)
  })
  const res = await fetch(`${pds}/xrpc/com.atproto.repo.listRecords?${params}`, {
    headers: { authorization: `Bearer ${session.accessJwt}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  if (!res.ok) {
    // Don't silently fall back to "nothing posted" — that is exactly the state
    // that causes a duplicate. Let the caller decide, loudly.
    throw new Error(`Bluesky listRecords ${res.status}: ${await res.text()}`)
  }
  const { records = [] } = await res.json()
  const urls = new Set()
  for (const r of records) {
    for (const m of String(r.value?.text ?? '').matchAll(/https?:\/\/[^\s<>()]+[^\s<>().,;:!?]/g)) {
      urls.add(m[0])
    }
  }
  return urls
}
