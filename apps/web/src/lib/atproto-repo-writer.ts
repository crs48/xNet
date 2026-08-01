/**
 * apps/web — a `RepoWriter` over a real DPoP-bound OAuth session (0420).
 *
 * `@xnetjs/social/publish` takes the PDS as an injected interface so its logic
 * is testable on fakes. This is the one real implementation: four XRPC calls
 * against the user's own repo, through the session the login-door ceremony
 * established.
 *
 * The scopes these calls need are declared in
 * `site/public/oauth/atproto-client.json`. Until 0372's D1 fix, that document
 * requested identity-only `atproto` and every write here would have failed with
 * an authorisation error — which is why zero `fyi.xnet.*` records existed
 * network-wide.
 */

import type { RemoteBookmark, RepoWriter } from '@xnetjs/social/publish'
import { BOOKMARK_NSID } from '@xnetjs/social/publish'

/** The slice of `@atproto/oauth-client-browser`'s session this needs. */
export interface AtprotoSessionLike {
  did: string
  fetchHandler(path: string, init?: RequestInit): Promise<Response>
}

/**
 * Turn an XRPC failure into something a user can act on.
 *
 * A bare "400" is useless; the PDS's own `error`/`message` names the real
 * problem (`RateLimitExceeded`, an unauthorised scope, an invalid record), and
 * the queue surfaces it per-edge rather than swallowing it into a count.
 */
async function xrpcError(res: Response, what: string): Promise<Error> {
  let detail = ''
  try {
    const body = (await res.json()) as { error?: string; message?: string }
    detail = [body.error, body.message].filter(Boolean).join(': ')
  } catch {
    detail = await res.text().catch(() => '')
  }
  return new Error(`${what} failed (${res.status})${detail ? `: ${detail}` : ''}`)
}

export function createAtprotoRepoWriter(session: AtprotoSessionLike): RepoWriter {
  const post = async (method: string, body: unknown) => {
    const res = await session.fetchHandler(`/xrpc/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) throw await xrpcError(res, method)
    return res
  }

  return {
    did: session.did,

    async createRecord({ collection, record }) {
      const res = await post('com.atproto.repo.createRecord', {
        repo: session.did,
        collection,
        record
      })
      return (await res.json()) as { uri: string; cid: string }
    },

    async putRecord({ collection, rkey, record }) {
      const res = await post('com.atproto.repo.putRecord', {
        repo: session.did,
        collection,
        rkey,
        record
      })
      return (await res.json()) as { uri: string; cid: string }
    },

    async deleteRecord({ collection, rkey }) {
      await post('com.atproto.repo.deleteRecord', { repo: session.did, collection, rkey })
    },

    /**
     * Every record in a collection, paginated to exhaustion.
     *
     * Exhaustive on purpose: `reconcile()` uses this to decide what NOT to
     * re-create, so a truncated read would look like "these were never
     * published" and duplicate the missing tail. A page-cap masquerading as a
     * complete answer is exactly the failure 0527 recorded on the hub.
     */
    async listRecords(collection) {
      const out: RemoteBookmark[] = []
      let cursor: string | undefined
      do {
        const params = new URLSearchParams({ repo: session.did, collection, limit: '100' })
        if (cursor) params.set('cursor', cursor)
        const res = await session.fetchHandler(
          `/xrpc/com.atproto.repo.listRecords?${params.toString()}`
        )
        if (!res.ok) throw await xrpcError(res, 'com.atproto.repo.listRecords')
        const body = (await res.json()) as {
          records: Array<{ uri: string; cid: string; value: Record<string, unknown> }>
          cursor?: string
        }
        for (const record of body.records) {
          const subject = record.value.subject
          if (typeof subject !== 'string') continue
          out.push({ uri: record.uri, cid: record.cid, subject })
        }
        cursor = body.cursor
      } while (cursor)
      return out
    }
  }
}

/** The collection `reconcile()` reads to rebuild a lost publish map. */
export const RECONCILE_COLLECTION = BOOKMARK_NSID
