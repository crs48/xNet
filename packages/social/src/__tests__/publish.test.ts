/**
 * Publishing affinity edges to the ATmosphere (exploration 0420).
 *
 * The properties under test are the ones whose failure is public and
 * irreversible:
 *
 * 1. **Idempotence** — a second publish run writes nothing.
 * 2. **Non-destructive writes** — another app's fields survive our `putRecord`.
 * 3. **The picker cannot offer third-party data**, through any code path.
 * 4. **A truncated run reports itself truncated**, never "done".
 * 5. **No platform content is projected** — no titles, no thumbnails.
 */

import { assertRoundTrip, projectRecord } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import {
  AFFINITY_NSID,
  BOOKMARK_NSID,
  affinityRkey,
  backoffMs,
  buildAiPreferenceRecords,
  buildPublishPreview,
  DEFAULT_AI_PREFERENCES,
  exclusionFor,
  indexByNodeId,
  interactionToAffinity,
  interactionToBookmark,
  pickSamples,
  reconcile,
  runPublish,
  runWithdraw,
  selectBucket,
  selectableInteractionKinds,
  toAtmosphereState,
  toNodeProperties,
  type PublishableEdge,
  type PublishedEdge,
  type RepoWriter
} from '../publish'
import { createSocialNodeId } from '../import/ids'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const DEFAULT_URL = 'https://www.youtube.com/watch?v=abc123'

/** Node ids are derived from the archive data, exactly as the importers do. */
const edgeId = (url: string) => createSocialNodeId('interaction', ['youtube', 'like', url])

const edge = (over: Partial<PublishableEdge> = {}): PublishableEdge => {
  const targetUrl = 'targetUrl' in over ? over.targetUrl : DEFAULT_URL
  return {
    nodeId: edgeId(targetUrl ?? ''),
    platform: 'youtube',
    interactionKind: 'like',
    privacyClass: 'public',
    targetUrl,
    platformContentId: 'abc123',
    occurredAt: '2026-03-04T10:00:00.000Z',
    ...over
  }
}

/** A PDS that records what it was asked to do. */
function fakeWriter(over: Partial<RepoWriter> = {}): RepoWriter & {
  created: Array<{ collection: string; record: Record<string, unknown> }>
  put: Array<{ collection: string; rkey: string; record: Record<string, unknown> }>
  deleted: Array<{ collection: string; rkey: string }>
} {
  const created: Array<{ collection: string; record: Record<string, unknown> }> = []
  const put: Array<{ collection: string; rkey: string; record: Record<string, unknown> }> = []
  const deleted: Array<{ collection: string; rkey: string }> = []
  let n = 0
  return {
    did: 'did:plc:test',
    created,
    put,
    deleted,
    async createRecord(input) {
      created.push(input)
      n++
      return { uri: `at://did:plc:test/${input.collection}/tid${n}`, cid: `bafy${n}` }
    },
    async putRecord(input) {
      put.push(input)
      return { uri: `at://did:plc:test/${input.collection}/${input.rkey}`, cid: 'bafyput' }
    },
    async deleteRecord(input) {
      deleted.push(input)
    },
    async listRecords() {
      return []
    },
    ...over
  }
}

const noWait = { sleep: async () => {}, jitter: () => 0, baseDelayMs: 0, now: () => 'T' }

// ─── The picker ──────────────────────────────────────────────────────────────

describe('the publication picker', () => {
  it('never offers interaction kinds that describe other people', () => {
    const offered = selectableInteractionKinds()
    for (const forbidden of ['follow', 'message', 'comment', 'search', 'mention'] as const) {
      expect(offered).not.toContain(forbidden)
    }
  })

  it('refuses third-party rows regardless of what the caller selected', () => {
    const dm = edge({ interactionKind: 'message', privacyClass: 'third-party-private' })
    // Even asking for it explicitly cannot get it through.
    const result = selectBucket([dm], { interactionKinds: ['message' as never] })
    expect(result.included).toHaveLength(0)
    expect(result.excludedByReason['third-party']).toBe(1)
  })

  it('reports the structural reason ahead of the user selection', () => {
    // A follow is never publishable; the user must not learn that ticking a
    // box would have included it.
    expect(exclusionFor(edge({ interactionKind: 'follow' }), { interactionKinds: [] })).toBe(
      'interaction-kind-never-publishable'
    )
  })

  it('excludes edges whose origin cannot be named honestly', () => {
    expect(exclusionFor(edge({ platform: 'generic' }))).toBe('unknown-platform')
    expect(exclusionFor(edge({ targetUrl: undefined }))).toBe('no-url')
  })

  it('sorts the included set so a preview matches the write order', () => {
    const result = selectBucket([
      edge({ targetUrl: 'https://www.youtube.com/watch?v=z' }),
      edge({ targetUrl: 'https://www.youtube.com/watch?v=a' })
    ])
    expect(result.included).toHaveLength(2)
    const ids = result.included.map((e) => e.nodeId)
    expect([...ids].sort()).toEqual(ids)
  })
})

// ─── The lenses ──────────────────────────────────────────────────────────────

describe('the record lenses', () => {
  it('projects the act and never the platform content', () => {
    const record = projectRecord(
      interactionToBookmark,
      toNodeProperties(edge({ tags: ['fermentation'] }))
    )
    expect(record).toMatchObject({
      $type: BOOKMARK_NSID,
      subject: 'https://www.youtube.com/watch?v=abc123',
      createdAt: '2026-03-04T10:00:00.000Z'
    })
    expect(record.tags).toEqual(['fermentation', 'xnet:youtube.com', 'xnet:like'])
    // The three fields that would be someone else's content.
    for (const forbidden of ['title', 'description', 'thumbnail', '$enriched']) {
      expect(record).not.toHaveProperty(forbidden)
    }
  })

  it('never stamps a record with "now" when the timestamp is unknown', () => {
    const record = projectRecord(interactionToBookmark, toNodeProperties(edge({ occurredAt: undefined })))
    // Empty, not fabricated: a record claiming the user saved this at publish
    // time would be a permanent falsehood.
    expect(record.createdAt).toBe('')
  })

  it('carries platform and interaction kind as real fields on the extension', () => {
    const record = projectRecord(interactionToAffinity, toNodeProperties(edge()))
    expect(record).toMatchObject({
      $type: AFFINITY_NSID,
      platform: 'youtube.com',
      interactionKind: 'like',
      subjectRef: { ref: 'youtube:video', value: 'abc123' }
    })
  })

  it('preserves another app’s unmodelled fields through a round trip', () => {
    // The failure this guards is severe: putRecord is a whole-object replace,
    // so a lens that drops what it does not understand deletes another app's
    // data from the user's repo.
    const foreign = {
      $type: BOOKMARK_NSID,
      subject: 'https://www.youtube.com/watch?v=abc123',
      createdAt: '2026-03-04T10:00:00.000Z',
      tags: ['keep-me'],
      someOtherAppField: { nested: true }
    }
    expect(assertRoundTrip(interactionToBookmark, foreign)).toEqual({ ok: true, lost: [] })
  })
})

// ─── Keys and reconciliation ─────────────────────────────────────────────────

describe('record keys', () => {
  it('derives a stable, atproto-legal rkey from the node id', () => {
    const id = createSocialNodeId('interaction', ['youtube', 'like', 'abc'])
    expect(affinityRkey(id)).toBe(affinityRkey(id))
    expect(affinityRkey(id)).toMatch(/^[A-Za-z0-9.\-_~]{1,512}$/)
  })

  it('reconciles a lost local map against the repo instead of duplicating', () => {
    const e = edge()
    const result = reconcile(
      [], // the map was lost with a device
      [{ uri: 'at://did:plc:test/bookmark/tid1', cid: 'bafy1', subject: e.targetUrl! }],
      (subject) => (subject === e.targetUrl ? e.nodeId : undefined)
    )
    expect(result.adopted).toBe(1)
    expect(result.map[0]).toMatchObject({ nodeId: e.nodeId, uri: 'at://did:plc:test/bookmark/tid1' })
  })

  it('leaves records it cannot match to a local node completely alone', () => {
    const result = reconcile(
      [],
      [{ uri: 'at://did:plc:test/bookmark/other', cid: 'x', subject: 'https://someone-elses.example' }],
      () => undefined
    )
    expect(result.adopted).toBe(0)
    expect(result.map).toHaveLength(0)
  })

  it('drops map entries whose record is gone rather than resurrecting them', () => {
    const result = reconcile(
      [{ nodeId: 'n1', uri: 'at://did:plc:test/bookmark/gone', cid: 'c', publishedAt: 'T' }],
      [],
      () => undefined
    )
    expect(result.dropped).toBe(1)
    expect(result.map).toHaveLength(0)
  })
})

// ─── The run ─────────────────────────────────────────────────────────────────

describe('a publish run', () => {
  it('writes one bookmark per edge and reports itself complete', async () => {
    const writer = fakeWriter()
    const edges = [edge({ targetUrl: 'https://www.youtube.com/watch?v=a' }), edge({ targetUrl: 'https://www.youtube.com/watch?v=b' })]
    const result = await runPublish(edges, new Map(), writer, noWait)
    expect(result.published).toBe(2)
    expect(result.complete).toBe(true)
    expect(writer.created).toHaveLength(2)
    expect(writer.put).toHaveLength(0)
  })

  it('is idempotent: a second run over the same selection writes nothing', async () => {
    const writer = fakeWriter()
    const edges = [edge()]
    const first = await runPublish(edges, new Map(), writer, noWait)
    expect(writer.created).toHaveLength(1)

    const map = indexByNodeId(first.written)
    const second = await runPublish(edges, map, writer, noWait)
    expect(writer.created).toHaveLength(1) // unchanged
    expect(second.published).toBe(1)
    expect(second.complete).toBe(true)
  })

  it('writes the affinity record with a deterministic rkey when enabled', async () => {
    const writer = fakeWriter()
    const e = edge()
    await runPublish([e], new Map(), writer, { ...noWait, includeAffinity: true })
    expect(writer.put).toHaveLength(1)
    expect(writer.put[0]).toMatchObject({
      collection: AFFINITY_NSID,
      rkey: affinityRkey(e.nodeId)
    })
    // The extension points back at the bookmark it extends.
    expect(writer.put[0].record.bookmark).toBe(writer.created[0] && `at://did:plc:test/${BOOKMARK_NSID}/tid1`)
  })

  it('reports a truncated run as truncated, never as done', async () => {
    const writer = fakeWriter()
    const edges = Array.from({ length: 50 }, (_, i) =>
      edge({ targetUrl: `https://www.youtube.com/watch?v=v${i}` })
    )
    const result = await runPublish(edges, new Map(), writer, { ...noWait, limit: 30 })
    expect(result.published).toBe(30)
    expect(result.staged).toBe(20)
    expect(result.complete).toBe(false)
    expect(result.stoppedBecause).toBe('limit')
  })

  it('stops hammering a PDS that keeps refusing, and says why', async () => {
    const writer = fakeWriter({
      async createRecord() {
        throw new Error('RateLimitExceeded')
      }
    })
    const edges = Array.from({ length: 20 }, (_, i) =>
      edge({ targetUrl: `https://www.youtube.com/watch?v=f${i}` })
    )
    const result = await runPublish(edges, new Map(), writer, {
      ...noWait,
      maxConsecutiveFailures: 3
    })
    expect(result.failed).toBe(3)
    expect(result.stoppedBecause).toBe('consecutive-failures')
    expect(result.complete).toBe(false)
    expect([...result.errors.values()][0]).toContain('RateLimitExceeded')
  })

  it('backs off exponentially and caps', () => {
    expect(backoffMs(250, 1, 0.5)).toBeLessThan(backoffMs(250, 3, 0.5))
    expect(backoffMs(250, 99, 1)).toBeLessThanOrEqual(60_000)
  })

  it('withdraws both records and does not claim retraction', async () => {
    const writer = fakeWriter()
    const e = edge()
    const run = await runPublish([e], new Map(), writer, { ...noWait, includeAffinity: true })
    const result = await runWithdraw(run.written, writer)
    expect(result.withdrawn).toEqual([e.nodeId])
    expect(writer.deleted).toHaveLength(2)
    // The door state machine has no way back to `unpublished`.
    expect(toAtmosphereState('withdrawn')).toBe('withdrawn')
  })

  it('maps every non-published run state onto `unpublished` at the door', () => {
    expect(toAtmosphereState('staged')).toBe('unpublished')
    expect(toAtmosphereState('failed')).toBe('unpublished')
    expect(toAtmosphereState('local')).toBe('unpublished')
  })
})

// ─── The ceremony ────────────────────────────────────────────────────────────

describe('the ceremony preview', () => {
  it('shows real records, the count, and what is excluded', () => {
    const bucket = selectBucket([
      edge({ targetUrl: 'https://www.youtube.com/watch?v=a' }),
      edge({ targetUrl: 'https://www.youtube.com/watch?v=b' }),
      edge({ interactionKind: 'follow', targetUrl: 'https://www.youtube.com/@someone' })
    ])
    const preview = buildPublishPreview(bucket, { includeAffinity: true })
    expect(preview.count).toBe(4) // 2 edges x 2 records
    expect(preview.recordsPerEdge).toBe(2)
    expect(preview.excludedByReason['interaction-kind-never-publishable']).toBe(1)
    expect(preview.samples[0].bookmark.$type).toBe(BOOKMARK_NSID)
    expect(preview.samples[0].affinity?.$type).toBe(AFFINITY_NSID)
  })

  it('estimates the run against the PDS write budget', () => {
    const bucket = selectBucket(
      Array.from({ length: 11_700 }, (_, i) =>
        edge({ targetUrl: `https://www.youtube.com/watch?v=n${i}` })
      )
    )
    expect(buildPublishPreview(bucket).estimatedDays).toBeCloseTo(1, 5)
  })

  it('spreads samples across the selection rather than taking the head', () => {
    expect(pickSamples([1, 2, 3, 4, 5, 6], 3)).toEqual([1, 3, 5])
    expect(pickSamples([1, 2], 3)).toEqual([1, 2])
  })
})

describe('the AI-use declaration', () => {
  it('scopes to the published collections, not the whole account', () => {
    const records = buildAiPreferenceRecords({ createdAt: 'T' })
    expect(records.map((r) => r.rkey)).toEqual([BOOKMARK_NSID, AFFINITY_NSID])
    expect(records[0].record.scope).toMatchObject({ collection: BOOKMARK_NSID })
  })

  it('denies training and synthesis while allowing retrieval by default', () => {
    expect(DEFAULT_AI_PREFERENCES).toEqual({
      training: false,
      syntheticContent: false,
      inference: true,
      embedding: true
    })
  })

  it('does not let an explicit undefined turn a deny into an undeclared', () => {
    const [{ record }] = buildAiPreferenceRecords({
      createdAt: 'T',
      preferences: { training: undefined },
      collections: [BOOKMARK_NSID]
    })
    // A plain spread would overwrite the default `false` with `undefined`, and
    // a downstream consumer is free to read undeclared as permission.
    expect(record.preferences.training).toBe(false)
  })

  it('still lets a caller allow training deliberately', () => {
    const [{ record }] = buildAiPreferenceRecords({
      createdAt: 'T',
      preferences: { training: true },
      collections: [BOOKMARK_NSID]
    })
    expect(record.preferences.training).toBe(true)
  })

  it('re-running the ceremony updates the declaration in place', () => {
    const a = buildAiPreferenceRecords({ createdAt: 'T1' })
    const b = buildAiPreferenceRecords({ createdAt: 'T2' })
    expect(a.map((r) => r.rkey)).toEqual(b.map((r) => r.rkey))
  })
})

describe('published edges carry a map entry', () => {
  it('indexes by node id so a re-import on a fresh device still matches', async () => {
    const writer = fakeWriter()
    const e = edge()
    const run = await runPublish([e], new Map(), writer, noWait)
    const map = indexByNodeId(run.written)
    // Re-deriving the node id from the same archive data yields the same key.
    const reimported: PublishedEdge | undefined = map.get(edgeId(e.targetUrl!))
    expect(reimported?.uri).toBe(run.written[0].uri)
  })
})
