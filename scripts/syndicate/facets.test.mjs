import { describe, expect, it } from 'vitest'
import { graphemes, linkFacets, MAX_GRAPHEMES, truncateGraphemes, verifyFacets } from './facets.mjs'

// The fixture from exploration 0432: one line using the punctuation this repo
// actually writes — em dash, curly quotes, bullet, curly apostrophe, emoji —
// all of which sit BEFORE the URL and are multi-byte.
const REAL_COPY =
  'New essay — “The Harvest You Can Count” • it’s about ledgers 🌾\n\nhttps://xnet.fyi/blog/the-harvest-you-can-count'
const REAL_URL = 'https://xnet.fyi/blog/the-harvest-you-can-count'

// An unpaired surrogate — what slicing by code unit through an emoji produces.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

describe('linkFacets', () => {
  it('produces a byte range that decodes back to the URL', () => {
    const [facet] = linkFacets(REAL_COPY)
    const buf = Buffer.from(REAL_COPY, 'utf8')
    expect(buf.subarray(facet.index.byteStart, facet.index.byteEnd).toString('utf8')).toBe(REAL_URL)
  })

  it('uses byte offsets, not string indices', () => {
    const [facet] = linkFacets(REAL_COPY)
    // The naive implementation would report the string index here. The prefix
    // holds one em dash, two curly quotes, one bullet, one curly apostrophe and
    // one emoji, so the byte offset must be strictly larger.
    expect(facet.index.byteStart).toBeGreaterThan(REAL_COPY.indexOf(REAL_URL))
    expect(facet.index.byteStart).toBe(Buffer.byteLength(REAL_COPY.slice(0, REAL_COPY.indexOf(REAL_URL)), 'utf8'))
  })

  it('tags the facet as a link feature', () => {
    const [facet] = linkFacets(REAL_COPY)
    expect(facet.features).toEqual([
      { $type: 'app.bsky.richtext.facet#link', uri: REAL_URL }
    ])
  })

  it('finds every URL in the text', () => {
    const two = `a ${REAL_URL} b https://xnet.fyi/changelog c`
    expect(linkFacets(two)).toHaveLength(2)
  })

  it('leaves a trailing full stop out of the URL', () => {
    const [facet] = linkFacets(`See https://xnet.fyi/blog.`)
    expect(facet.features[0].uri).toBe('https://xnet.fyi/blog')
  })

  it('returns nothing when there is no link', () => {
    expect(linkFacets('no links here — just prose')).toEqual([])
  })
})

describe('verifyFacets', () => {
  it('passes facets built by linkFacets', () => {
    expect(verifyFacets(REAL_COPY, linkFacets(REAL_COPY))).toEqual([])
  })

  it('catches the naive string-index bug', () => {
    // Exactly what a naive implementation emits: the string index rather than
    // the byte offset.
    const start = REAL_COPY.indexOf(REAL_URL)
    const naive = [
      {
        index: { byteStart: start, byteEnd: start + REAL_URL.length },
        features: [{ $type: 'app.bsky.richtext.facet#link', uri: REAL_URL }]
      }
    ]
    const problems = verifyFacets(REAL_COPY, naive)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('decodes to')
  })
})

describe('graphemes', () => {
  it('counts an emoji as one', () => {
    expect(graphemes('🌾')).toBe(1)
    expect('🌾'.length).toBe(2) // the reason .length is wrong
  })

  it('disagrees with code-unit length on real copy', () => {
    expect(graphemes(REAL_COPY)).toBeLessThan(REAL_COPY.length)
  })

  it('agrees with length on plain ASCII', () => {
    expect(graphemes('hello')).toBe(5)
  })

  it('keeps the fixture inside the budget', () => {
    expect(graphemes(REAL_COPY)).toBeLessThanOrEqual(MAX_GRAPHEMES)
  })
})

describe('truncateGraphemes', () => {
  it('leaves a short string alone', () => {
    expect(truncateGraphemes('hello', 10)).toBe('hello')
  })

  it('cuts to the budget with an ellipsis', () => {
    const out = truncateGraphemes('x'.repeat(50), 10)
    expect(graphemes(out)).toBe(10)
    expect(out.endsWith('…')).toBe(true)
  })

  it('never splits an emoji', () => {
    const out = truncateGraphemes('🌾'.repeat(50), 10)
    expect(graphemes(out)).toBeLessThanOrEqual(10)
    // Slicing by code unit here would leave a lone surrogate.
    // The real hazard: a code-unit slice leaves an unpaired surrogate.
    expect(LONE_SURROGATE.test(out)).toBe(false)
  })

  it('degenerates safely at a budget of one', () => {
    expect(truncateGraphemes('abcdef', 1)).toBe('…')
  })
})
