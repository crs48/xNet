import type { CandidateProfile } from './matchmaker'
import { describe, expect, it } from 'vitest'
import { buildAdjacency, encodeVector } from './matching'
import { localCandidatesFromGraph, rankMatches } from './matchmaker'

const me = {
  did: 'me',
  affinityVector: encodeVector([1, 0, 0]),
  interests: ['rust', 'jazz'],
  geohashCell: '9q8yy'
}

describe('rankMatches', () => {
  it('ranks a similar, well-connected candidate above a dissimilar stranger', () => {
    const adjacency = buildAdjacency([
      ['me', 'carol'],
      ['near', 'carol']
    ])
    const candidates: CandidateProfile[] = [
      {
        did: 'near',
        affinityVector: encodeVector([0.9, 0.1, 0]),
        interests: ['rust', 'climbing'],
        reach: 'friends-of-friends',
        source: 'local'
      },
      {
        did: 'far',
        affinityVector: encodeVector([0, 0, 1]),
        interests: ['knitting'],
        reach: 'public',
        source: 'hub'
      }
    ]
    const ranked = rankMatches({ me, candidates, adjacency, intent: 'friends' })
    expect(ranked[0].did).toBe('near')
    expect(ranked.find((r) => r.did === 'near')!.why.sharedInterests).toEqual(['rust'])
    expect(ranked.find((r) => r.did === 'near')!.why.graphPath).toEqual(['me', 'carol', 'near'])
  })

  it('excludes self and de-dupes across sources preferring local', () => {
    const candidates: CandidateProfile[] = [
      { did: 'me', reach: 'public', source: 'hub' },
      { did: 'dup', reach: 'hub', source: 'hub' },
      { did: 'dup', reach: 'friends-of-friends', source: 'local' }
    ]
    const ranked = rankMatches({ me, candidates, intent: 'collab' })
    expect(ranked.map((r) => r.did)).toEqual(['dup'])
    expect(ranked[0].source).toBe('local')
  })

  it('reach scoping drops candidates beyond the requested reach', () => {
    const candidates: CandidateProfile[] = [
      { did: 'fof', reach: 'friends-of-friends', source: 'local' },
      { did: 'pub', reach: 'public', source: 'hub' }
    ]
    const ranked = rankMatches({ me, candidates, intent: 'friends', reach: 'friends-of-friends' })
    expect(ranked.map((r) => r.did)).toEqual(['fof'])
  })

  it('UCB1 exploration lifts an under-observed candidate above an identical, well-observed one', () => {
    // Identical affinity (so content/reciprocal tie); they differ only in how
    // much they've been observed → the fresh one gets the UCB optimism bonus.
    const candidates: CandidateProfile[] = [
      {
        did: 'seen',
        affinityVector: encodeVector([1, 0, 0]),
        reach: 'public',
        source: 'hub',
        observations: 50
      },
      {
        did: 'fresh',
        affinityVector: encodeVector([1, 0, 0]),
        reach: 'public',
        source: 'hub',
        observations: 0
      }
    ]
    const ranked = rankMatches({ me, candidates, intent: 'friends' })
    expect(ranked[0].did).toBe('fresh')
  })

  it('the bandit feedback path favors an unproven candidate over a saturated one', () => {
    const candidates: CandidateProfile[] = [
      {
        did: 'proven',
        affinityVector: encodeVector([1, 0, 0]),
        reach: 'public',
        source: 'hub',
        outcomes: { successes: 100, failures: 100 }
      },
      {
        did: 'unproven',
        affinityVector: encodeVector([1, 0, 0]),
        reach: 'public',
        source: 'hub',
        outcomes: { successes: 0, failures: 0 }
      }
    ]
    const ranked = rankMatches({ me, candidates, intent: 'friends' })
    expect(ranked[0].did).toBe('unproven')
  })

  it('in-person intents require geohash proximity', () => {
    const candidates: CandidateProfile[] = [
      { did: 'nearby', reach: 'public', source: 'hub', geohashCell: '9q8yy' },
      { did: 'faraway', reach: 'public', source: 'hub', geohashCell: 'drt2z' },
      { did: 'nocell', reach: 'public', source: 'hub' }
    ]
    const ranked = rankMatches({ me, candidates, intent: 'local', inPerson: true })
    expect(ranked.map((r) => r.did)).toEqual(['nearby'])
    expect(ranked[0].why.proximity).toBeGreaterThan(0.6)
  })
})

describe('localCandidatesFromGraph', () => {
  it('returns friends-of-friends DIDs', () => {
    const adjacency = buildAdjacency([
      ['me', 'carol'],
      ['bob', 'carol']
    ])
    expect(localCandidatesFromGraph(adjacency, 'me')).toEqual(['bob'])
  })
})
