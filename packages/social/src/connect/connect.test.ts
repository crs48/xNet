import { describe, expect, it } from 'vitest'
import {
  adamicAdar,
  buildAdjacency,
  buildIntroCard,
  commonNeighbors,
  cosineSimilarity,
  decodeVector,
  deriveAffinity,
  encodeVector,
  friendsOfFriends,
  graphProximity,
  isMutualPair,
  mmrRerank,
  rankInterestTags,
  reciprocalScore,
  scoreCandidate,
  shortestSocialPath,
  synthesizeInterestText,
  waveCommitment
} from './index'

describe('matching math', () => {
  it('cosine similarity is 1 for identical and 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1)
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0)
    expect(cosineSimilarity([1, 2], [])).toBe(0)
  })

  it('round-trips an affinity vector through base64 with float precision', () => {
    const vec = [0.1, -0.5, 0.9, 0.0, 0.333]
    const decoded = decodeVector(encodeVector(vec))
    expect(decoded).toHaveLength(vec.length)
    decoded.forEach((value, i) => expect(value).toBeCloseTo(vec[i], 5))
    expect(decodeVector('')).toEqual([])
  })

  it('reciprocal score penalizes asymmetry via the harmonic mean', () => {
    expect(reciprocalScore(0.5, 0.5)).toBeCloseTo(0.5)
    expect(reciprocalScore(0.9, 0.1)).toBeLessThan(reciprocalScore(0.5, 0.5))
    expect(reciprocalScore(0, 0.9)).toBe(0)
  })

  it('blends candidate signals within [0, 1]', () => {
    const score = scoreCandidate({ content: 1, reciprocal: 1, graph: 1, exploration: 1 })
    expect(score).toBeCloseTo(1)
    expect(scoreCandidate({ content: 0, reciprocal: 0, graph: 0 })).toBe(0)
  })

  it('mmr re-rank injects diversity over pure relevance ordering', () => {
    // Three candidates: a and b are near-identical; c is different.
    const items = [
      { item: 'a', score: 0.9 },
      { item: 'b', score: 0.85 },
      { item: 'c', score: 0.6 }
    ]
    const sim = (x: string, y: string) => (x === y ? 1 : x !== 'c' && y !== 'c' ? 0.95 : 0.1)
    const ranked = mmrRerank(items, sim, 0.5).map((r) => r.item)
    // c (diverse) should be promoted above b (a near-duplicate of a)
    expect(ranked[0]).toBe('a')
    expect(ranked.indexOf('c')).toBeLessThan(ranked.indexOf('b'))
  })
})

describe('graph proximity', () => {
  // carol bridges alice↔bob; dave is a popular hub
  const adjacency = buildAdjacency([
    ['alice', 'carol'],
    ['bob', 'carol'],
    ['alice', 'dave'],
    ['bob', 'dave'],
    ['eve', 'dave'],
    ['frank', 'dave']
  ])

  it('finds common neighbors and weights niche ones higher (adamic-adar)', () => {
    expect(commonNeighbors(adjacency, 'alice', 'bob').sort()).toEqual(['carol', 'dave'])
    // carol (degree 2) should contribute more than dave (degree 4)
    const onlyCarol = adamicAdar(
      buildAdjacency([
        ['alice', 'carol'],
        ['bob', 'carol']
      ]),
      'alice',
      'bob'
    )
    const onlyDave = adamicAdar(
      buildAdjacency([
        ['alice', 'dave'],
        ['bob', 'dave'],
        ['eve', 'dave'],
        ['frank', 'dave']
      ]),
      'alice',
      'bob'
    )
    expect(onlyCarol).toBeGreaterThan(onlyDave)
    expect(graphProximity(adjacency, 'alice', 'bob')).toBeGreaterThan(0)
  })

  it('surfaces friends-of-friends with the bridging connections', () => {
    const fof = friendsOfFriends(adjacency, 'alice')
    const bob = fof.find((person) => person.did === 'bob')
    expect(bob).toBeDefined()
    expect(bob!.via).toContain('carol')
    expect(fof.every((person) => person.did !== 'alice' && person.did !== 'carol')).toBe(true)
  })

  it('computes the shortest social path for the why-card', () => {
    expect(shortestSocialPath(adjacency, 'alice', 'bob')).toEqual(['alice', 'carol', 'bob'])
    expect(shortestSocialPath(adjacency, 'alice', 'alice')).toEqual(['alice'])
    expect(shortestSocialPath(adjacency, 'alice', 'nobody')).toBeNull()
  })
})

describe('affinity derivation', () => {
  it('ranks interest tags by frequency', () => {
    const ranked = rankInterestTags([
      { id: 't1', name: 'rust' },
      { id: 't1', name: 'rust' },
      { id: 't2', name: 'jazz' }
    ])
    expect(ranked[0].id).toBe('t1')
    expect(ranked[0].weight).toBe(1)
    expect(ranked[1].weight).toBeLessThan(1)
  })

  it('synthesizes interest text and derives a draft (no embedder → empty vector)', async () => {
    const input = {
      tags: [{ id: 't1', name: 'rust', weight: 1 }],
      savedTitles: ['Worker runtimes deep dive'],
      projectBriefs: ['  ']
    }
    expect(synthesizeInterestText(input)).toBe('rust\nWorker runtimes deep dive')
    const draft = await deriveAffinity(input)
    expect(draft.headline).toBe('')
    expect(draft.affinityVector).toBe('')
    expect(draft.derivedFrom).toEqual({ tags: 1, saved: 1, projects: 1 })
  })

  it('embeds when an embedder is injected', async () => {
    const draft = await deriveAffinity({ tags: [{ id: 't1', name: 'rust', weight: 1 }] }, () => [
      0.2, 0.4
    ])
    expect(decodeVector(draft.affinityVector)).toHaveLength(2)
  })
})

describe('double-opt-in waves', () => {
  it('produces a deterministic commitment that hides identities', () => {
    const a = waveCommitment({ fromDid: 'did:a', toDid: 'did:b', intentKind: 'friends', salt: 's' })
    const again = waveCommitment({
      fromDid: 'did:a',
      toDid: 'did:b',
      intentKind: 'friends',
      salt: 's'
    })
    const other = waveCommitment({
      fromDid: 'did:a',
      toDid: 'did:b',
      intentKind: 'romance',
      salt: 's'
    })
    expect(a).toBe(again)
    expect(a).not.toBe(other)
    expect(a).toMatch(/^[0-9a-f]+$/)
  })

  it('detects mutual pairs only when both addressed each other in the same intent', () => {
    const aToB = { fromDid: 'did:a', toDid: 'did:b', intentKind: 'collab' as const }
    const bToA = { fromDid: 'did:b', toDid: 'did:a', intentKind: 'collab' as const }
    const bToAWrongIntent = { fromDid: 'did:b', toDid: 'did:a', intentKind: 'romance' as const }
    expect(isMutualPair(aToB, bToA)).toBe(true)
    expect(isMutualPair(aToB, bToAWrongIntent)).toBe(false)
    expect(isMutualPair(aToB, aToB)).toBe(false)
  })

  it('builds an intro card with shared interests and a path', () => {
    const card = buildIntroCard({
      intent: 'collab',
      sharedInterests: ['rust', 'worker-runtimes'],
      graphPath: ['did:a', 'did:carol', 'did:b']
    })
    expect(card.opener).toContain('rust')
    expect(card.graphPath).toHaveLength(3)
  })
})
