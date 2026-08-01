/**
 * The affinity appview (exploration 0420).
 *
 * Four properties:
 * 1. **Overlap, never a scoreboard** — the route surface offers no ranking, no
 *    global count, no "top" anything. Asserted structurally, because this is
 *    the constraint most likely to be eroded by a reasonable-sounding feature
 *    request (0378).
 * 2. **Normalisation agrees with the publisher** — the intersection is on
 *    strings, so the two sides must run the same function.
 * 3. **Determinism survives the new collections** — two rebuilds are still
 *    byte-identical (0374's "rebuild and diff to zero").
 * 4. **A bookmark-only publisher still matches** — the extension record is an
 *    enrichment, never a requirement.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_SENSITIVITY_PREFERENCES, buildSensitivityLabel } from '@xnetjs/abuse'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import {
  AFFINITY_COLLECTION,
  BOOKMARK_COLLECTION,
  applyViewerSensitivity,
  compareActors,
  sharedSubjects,
  subjectsForActor
} from '../src/features/affinity'
import {
  AtprotoIndexService,
  DEFAULT_INDEX_COLLECTIONS,
  atprotoIndexFeature,
  type IndexEntry,
  type IndexSource
} from '../src/features/atproto-index'

const bookmark = (did: string, subject: string, rkey = subject): IndexEntry => ({
  uri: `at://${did}/${BOOKMARK_COLLECTION}/${encodeURIComponent(rkey)}`,
  cid: `bafy-${did}-${rkey}`,
  did,
  collection: BOOKMARK_COLLECTION,
  value: { subject, createdAt: '2026-03-04T10:00:00.000Z', tags: [] }
})

const affinity = (did: string, subject: string, platform: string, kind: string): IndexEntry => ({
  uri: `at://${did}/${AFFINITY_COLLECTION}/${encodeURIComponent(subject)}`,
  cid: `bafy-aff-${did}`,
  did,
  collection: AFFINITY_COLLECTION,
  value: {
    subject,
    platform,
    interactionKind: kind,
    createdAt: '2026-03-04T10:00:00.000Z'
  }
})

const VIDEO_A = 'https://www.youtube.com/watch?v=aaa'
const VIDEO_B = 'https://www.youtube.com/watch?v=bbb'
const VIDEO_C = 'https://www.youtube.com/watch?v=ccc'

describe('affinity comparison', () => {
  const entries: IndexEntry[] = [
    bookmark('did:plc:alice', VIDEO_A),
    bookmark('did:plc:alice', VIDEO_B),
    affinity('did:plc:alice', VIDEO_A, 'youtube.com', 'like'),
    bookmark('did:plc:bob', VIDEO_B),
    bookmark('did:plc:bob', VIDEO_C)
  ]

  it('returns what two actors share and each actor’s own total', () => {
    const result = compareActors(entries, 'did:plc:alice', 'did:plc:bob')
    expect(result.shared.map((s) => s.subject)).toEqual([VIDEO_B])
    expect(result.counts).toEqual({ 'did:plc:alice': 2, 'did:plc:bob': 2 })
  })

  it('collapses a bookmark and its affinity extension into one subject', () => {
    // Otherwise a user of xNet's own format would appear to have twice the
    // overlap of everyone else — a popularity signal for our format.
    const alice = subjectsForActor(entries, 'did:plc:alice')
    expect(alice).toHaveLength(2)
    expect(alice.find((s) => s.subject === VIDEO_A)).toMatchObject({
      platform: 'youtube.com',
      interactionKind: 'like'
    })
  })

  it('matches a bookmark-only publisher against an extension publisher', () => {
    const result = compareActors(entries, 'did:plc:alice', 'did:plc:bob')
    expect(result.shared).toHaveLength(1)
  })

  it('normalises both sides so the same video matches across URL forms', () => {
    expect(
      sharedSubjects(
        ['https://www.youtube.com/watch?v=aaa'],
        ['https://www.youtube.com/watch?v=aaa#t=30']
      )
    ).toEqual(['https://www.youtube.com/watch?v=aaa'])
  })

  it('ignores records from other collections and unparseable subjects', () => {
    const noisy: IndexEntry[] = [
      ...entries,
      {
        uri: 'at://did:plc:alice/site.standard.document/x',
        cid: 'c',
        did: 'did:plc:alice',
        collection: 'site.standard.document',
        value: { subject: VIDEO_C, title: 'a post' }
      },
      { ...bookmark('did:plc:alice', 'not a url at all'), cid: 'c2' }
    ]
    expect(subjectsForActor(noisy, 'did:plc:alice')).toHaveLength(2)
  })
})

describe('no scoreboard', () => {
  /**
   * The structural guard. If someone adds a ranking endpoint, this fails —
   * which is the point: the constraint outlives the person who agreed to it.
   */
  it('exposes exactly one affinity route, and it takes two named actors', () => {
    const app = new Hono()
    const feature = atprotoIndexFeature(mkdtempSync(join(tmpdir(), 'xnet-aff-')), {
      enabled: true,
      derivedOnly: false,
      rebuildOnStart: false,
      source: {
        async listRepos() {
          return []
        },
        async listRecords() {
          return []
        }
      }
    })
    feature.mount?.({ app } as never)

    const paths = app.routes.filter((r) => r.path.includes('affinity')).map((r) => r.path)
    expect(paths).toEqual(['/xrpc/fyi.xnet.affinity.compare'])
    for (const forbidden of ['top', 'rank', 'popular', 'trending', 'leaderboard', 'count']) {
      expect(app.routes.some((r) => r.path.toLowerCase().includes(forbidden))).toBe(false)
    }
  })

  it('refuses a comparison that is not between two distinct actors', async () => {
    const app = new Hono()
    atprotoIndexFeature(mkdtempSync(join(tmpdir(), 'xnet-aff2-')), {
      enabled: true,
      derivedOnly: false,
      rebuildOnStart: false,
      source: {
        async listRepos() {
          return []
        },
        async listRecords() {
          return []
        }
      }
    }).mount?.({ app } as never)

    expect((await app.request('/xrpc/fyi.xnet.affinity.compare')).status).toBe(400)
    expect((await app.request('/xrpc/fyi.xnet.affinity.compare?actors=did:plc:a')).status).toBe(400)
    expect(
      (await app.request('/xrpc/fyi.xnet.affinity.compare?actors=did:plc:a&actors=did:plc:a'))
        .status
    ).toBe(400)
  })
})

describe('the index still rebuilds deterministically with the new collections', () => {
  const source = (): IndexSource => ({
    async listRepos(collection) {
      return collection === BOOKMARK_COLLECTION
        ? ['did:plc:alice', 'did:plc:bob']
        : ['did:plc:alice']
    },
    async listRecords(did, collection) {
      if (collection !== BOOKMARK_COLLECTION && collection !== AFFINITY_COLLECTION) return []
      const record =
        collection === BOOKMARK_COLLECTION
          ? bookmark(did, VIDEO_A)
          : affinity(did, VIDEO_A, 'youtube.com', 'like')
      return [{ uri: record.uri, cid: record.cid, did, value: record.value }]
    }
  })

  it('carries the affinity collections by default', () => {
    expect(DEFAULT_INDEX_COLLECTIONS).toContain(BOOKMARK_COLLECTION)
    expect(DEFAULT_INDEX_COLLECTIONS).toContain(AFFINITY_COLLECTION)
  })

  it('produces byte-identical snapshots across two rebuilds', async () => {
    const build = async () => {
      const svc = new AtprotoIndexService(mkdtempSync(join(tmpdir(), 'xnet-idx-aff-')), {
        enabled: true,
        source: source()
      })
      await svc.rebuild()
      return JSON.stringify(svc.snapshot())
    }
    expect(await build()).toBe(await build())
  })
})

describe('the viewer’s sensitivity dial applies to linked subjects', () => {
  const shared = [{ subject: VIDEO_A }, { subject: VIDEO_B }]

  it('is the identity function when the appview has seen no labels', () => {
    // An appview that has never seen a label must not imply it vetted anything.
    expect(applyViewerSensitivity(shared, () => [])).toEqual(shared)
  })

  it('drops a subject the viewer’s dial hides, and marks one it warns on', () => {
    const labelled = applyViewerSensitivity(
      shared,
      (subject) => [
        buildSensitivityLabel({
          // Adult content is hidden by default (age-gated); graphic media warns.
          value: subject === VIDEO_A ? 'porn' : 'graphic-media',
          source: 'self',
          confidence: 1
        })
      ],
      DEFAULT_SENSITIVITY_PREFERENCES
    )
    expect(labelled.map((s) => s.subject)).toEqual([VIDEO_B])
    expect(labelled[0].sensitivity).toBe('warn')
  })

  it('respects a viewer who has turned a label back on', () => {
    const labelled = applyViewerSensitivity(
      [{ subject: VIDEO_A }],
      () => [buildSensitivityLabel({ value: 'porn', source: 'self', confidence: 1 })],
      {
        ...DEFAULT_SENSITIVITY_PREFERENCES,
        adultContentEnabled: true,
        ageConfirmed: true,
        labels: { porn: 'show' }
      }
    )
    expect(labelled).toHaveLength(1)
    expect(labelled[0].sensitivity).toBeUndefined()
  })
})
