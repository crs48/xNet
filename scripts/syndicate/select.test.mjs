import { describe, expect, it } from 'vitest'
import { flaggedEntries, parseBlogFeed, render, select } from './select.mjs'
import { graphemes, MAX_GRAPHEMES } from './facets.mjs'

const feedXml = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>The Harvest You Can Count</title>
    <link>https://xnet.fyi/blog/the-harvest-you-can-count</link>
    <description>Why layered food systems lost &amp; what the ledger missed.</description>
  </item>
  <item>
    <title>Tree Rings</title>
    <link>https://xnet.fyi/blog/tree-rings</link>
    <description>On growth you can read.</description>
  </item>
</channel></rss>`

describe('parseBlogFeed', () => {
  it('extracts slug, title, description and url', () => {
    const [first] = parseBlogFeed(feedXml)
    expect(first).toEqual({
      slug: 'the-harvest-you-can-count',
      title: 'The Harvest You Can Count',
      description: 'Why layered food systems lost & what the ledger missed.',
      url: 'https://xnet.fyi/blog/the-harvest-you-can-count'
    })
  })

  it('returns an empty list for a feed with no items', () => {
    expect(parseBlogFeed('<rss><channel></channel></rss>')).toEqual([])
  })

  it('throws rather than silently under-parsing a changed feed', () => {
    // An <item> with no <link> must NOT read as "no new posts".
    const broken = `<rss><channel><item><title>Orphan</title></item></channel></rss>`
    expect(() => parseBlogFeed(broken)).toThrow(/missing a title or link/)
  })
})

describe('flaggedEntries', () => {
  const feed = {
    items: [
      { id: 'a', title: 'A', _xnet: { syndicate: true, summary: 'yes' } },
      { id: 'b', title: 'B', _xnet: { summary: 'no flag' } },
      { id: 'c', title: 'C', _xnet: { syndicate: false, summary: 'explicit false' } },
      { id: 'd', title: 'D' }
    ]
  }

  it('keeps only entries an author flagged', () => {
    expect(flaggedEntries(feed).map((e) => e.id)).toEqual(['a'])
  })

  it('ignores a missing items array', () => {
    expect(flaggedEntries({})).toEqual([])
  })
})

describe('render', () => {
  it('uses headline plus the first sentence when it fits', () => {
    expect(
      render({
        headline: 'The Harvest You Can Count',
        detail: 'Why layered systems lost. And a second sentence that is dropped.',
        url: 'https://xnet.fyi/blog/the-harvest-you-can-count'
      })
    ).toBe(
      'The Harvest You Can Count — Why layered systems lost.\n\nhttps://xnet.fyi/blog/the-harvest-you-can-count'
    )
  })

  it('falls back to the headline alone when the detail would overflow', () => {
    const out = render({
      headline: 'A short headline',
      detail: 'x'.repeat(400) + '.',
      url: 'https://xnet.fyi/changelog#some-quite-long-anchor-value-here'
    })
    expect(out).toBe('A short headline\n\nhttps://xnet.fyi/changelog#some-quite-long-anchor-value-here')
    expect(graphemes(out)).toBeLessThanOrEqual(MAX_GRAPHEMES)
  })

  it('always stays inside the budget, counting the full url', () => {
    const out = render({
      headline: 'H'.repeat(200),
      detail: 'D'.repeat(200) + '.',
      url: `https://xnet.fyi/changelog#${'a'.repeat(60)}`
    })
    expect(graphemes(out)).toBeLessThanOrEqual(MAX_GRAPHEMES)
  })

  it('truncates a headline that overflows on its own', () => {
    // Dropping `detail` is not enough here — the headline alone busts the
    // budget, and an un-truncated post would be rejected by the server and
    // retried forever.
    const out = render({
      headline: 'H'.repeat(400),
      detail: '',
      url: 'https://xnet.fyi/blog/a'
    })
    expect(graphemes(out)).toBeLessThanOrEqual(MAX_GRAPHEMES)
    expect(out).toContain('…')
    expect(out).toContain('https://xnet.fyi/blog/a')
  })

  it('never splits an emoji when truncating', () => {
    const out = render({ headline: '🌾'.repeat(400), detail: '', url: 'https://xnet.fyi/b' })
    expect(graphemes(out)).toBeLessThanOrEqual(MAX_GRAPHEMES)
    // A code-unit slice would leave a lone surrogate here.
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(out)).toBe(false)
  })

  it('throws when the url alone leaves no room', () => {
    expect(() =>
      render({ headline: 'x', detail: '', url: `https://xnet.fyi/${'a'.repeat(320)}` })
    ).toThrow(/no room for any text/)
  })

  it('handles a missing detail', () => {
    expect(render({ headline: 'Just this', detail: '', url: 'https://xnet.fyi/x' })).toBe(
      'Just this\n\nhttps://xnet.fyi/x'
    )
  })
})

describe('select', () => {
  const feeds = {
    posts: parseBlogFeed(feedXml),
    entries: [
      {
        id: '2026-08-01-hub-address',
        title: 'Your hub keeps its address',
        url: 'https://xnet.fyi/changelog#2026-08-01-hub-address',
        _xnet: { syndicate: true, summary: 'It moves without breaking links.' }
      }
    ]
  }

  it('offers blog posts and flagged entries', () => {
    expect(select(feeds, new Set()).map((c) => c.key)).toEqual([
      'blog:the-harvest-you-can-count',
      'blog:tree-rings',
      'log:2026-08-01-hub-address'
    ])
  })

  it('skips anything already in the ledger', () => {
    const posted = new Set(['blog:tree-rings', 'log:2026-08-01-hub-address'])
    expect(select(feeds, posted).map((c) => c.key)).toEqual(['blog:the-harvest-you-can-count'])
  })

  it('plans nothing when everything is handled', () => {
    const all = new Set(select(feeds, new Set()).map((c) => c.key))
    expect(select(feeds, all)).toEqual([])
  })

  it('renders text for every candidate', () => {
    for (const c of select(feeds, new Set())) {
      expect(c.text).toContain(c.url)
      expect(graphemes(c.text)).toBeLessThanOrEqual(MAX_GRAPHEMES)
    }
  })
})
