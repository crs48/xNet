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
    body: JSON.stringify({ identifier: handle, password: appPassword })
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
    })
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
