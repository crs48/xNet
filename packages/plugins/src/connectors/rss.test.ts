import { describe, expect, it } from 'vitest'
import { buildRssConnector, FEED_ITEM_SCHEMA, parseFeed } from './rss'
import { runConnectorSync } from './sync-runner'

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Example</title>
  <item>
    <title>First &amp; best</title>
    <link>https://example.com/1</link>
    <guid>https://example.com/1</guid>
    <description><![CDATA[Hello <b>world</b>]]></description>
    <pubDate>Wed, 02 Oct 2002 13:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Second</title>
    <link>https://example.com/2</link>
  </item>
</channel></rss>`

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Example</title>
  <entry>
    <title>Atom entry</title>
    <link href="https://example.com/a1"/>
    <id>urn:uuid:1</id>
    <summary>Summary text</summary>
    <updated>2003-12-13T18:30:02Z</updated>
  </entry>
</feed>`

describe('parseFeed', () => {
  it('parses RSS items, decoding entities and CDATA', () => {
    const entries = parseFeed(RSS)
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({
      title: 'First & best',
      link: 'https://example.com/1',
      guid: 'https://example.com/1',
      summary: 'Hello <b>world</b>'
    })
    expect(entries[0].publishedAt).toBe(Date.parse('Wed, 02 Oct 2002 13:00:00 GMT'))
  })

  it('parses Atom entries with href links and id/updated', () => {
    const entries = parseFeed(ATOM)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      title: 'Atom entry',
      link: 'https://example.com/a1',
      guid: 'urn:uuid:1',
      summary: 'Summary text'
    })
    expect(entries[0].publishedAt).toBe(Date.parse('2003-12-13T18:30:02Z'))
  })

  it('returns [] for non-feed markup', () => {
    expect(parseFeed('<html><body>no feed here</body></html>')).toEqual([])
  })

  it('is not fooled by a </item> inside a CDATA section', () => {
    const xml =
      '<rss><channel><item>' +
      '<description><![CDATA[a closing </item> hides here]]></description>' +
      '<title>RealTitle</title>' +
      '</item></channel></rss>'
    const entries = parseFeed(xml)
    expect(entries).toHaveLength(1)
    expect(entries[0].title).toBe('RealTitle')
  })

  it('decodes numeric (decimal/hex) and extra named entities', () => {
    const xml =
      '<rss><channel><item><title>Foo&#8217;s &amp; Bar&#x2026; &nbsp;end</title></item></channel></rss>'
    // &nbsp; → U+00A0 (a real non-breaking space, not an ASCII space)
    expect(parseFeed(xml)[0].title).toBe('Foo’s & Bar…  end')
  })

  it('preserves literal entities inside CDATA (does not double-unescape)', () => {
    const xml =
      '<rss><channel><item><title><![CDATA[Tom &amp; Jerry]]></title></item></channel></rss>'
    expect(parseFeed(xml)[0].title).toBe('Tom &amp; Jerry')
  })

  it('handles a hostile unclosed-tag body in linear time (no ReDoS)', () => {
    const hostile = '<item>'.repeat(200_000) // 1.2MB of unclosed tags
    const start = process.hrtime.bigint()
    const entries = parseFeed(hostile)
    const ms = Number(process.hrtime.bigint() - start) / 1e6
    expect(entries).toEqual([]) // no closing tags → nothing parsed
    expect(ms).toBeLessThan(1000) // the old O(n^2) regex took ~34s here
  })

  it('caps the number of entries materialized per poll', () => {
    const item = '<item><title>x</title></item>'
    expect(
      parseFeed(`<rss><channel>${item.repeat(5000)}</channel></rss>`).length
    ).toBeLessThanOrEqual(1000)
  })
})

describe('buildRssConnector', () => {
  it('locks network to the feed host', () => {
    const c = buildRssConnector({ feedUrl: 'https://blog.example.com/atom.xml' })
    expect(c.module.capabilities?.network).toEqual(['blog.example.com'])
  })

  it('materializes FeedItem nodes through runConnectorSync, space-stamped', async () => {
    const created: Array<{ schemaId: string; properties: Record<string, unknown> }> = []
    const connector = buildRssConnector({
      feedUrl: 'https://example.com/feed.xml',
      feedNodeId: 'feed-1'
    })
    const result = await runConnectorSync(connector.definition, {
      env: {},
      fetch: async () => RSS,
      store: {
        async create({ schemaId, properties }) {
          created.push({ schemaId, properties })
          return { id: `id-${created.length}`, schemaId }
        },
        async get() {
          return null
        },
        async update() {
          return undefined
        }
      },
      space: 'space-1'
    })
    expect(result.written).toBe(2)
    expect(created[0].schemaId).toBe(FEED_ITEM_SCHEMA)
    expect(created[0].properties).toMatchObject({
      title: 'First & best',
      link: 'https://example.com/1',
      feed: 'feed-1',
      space: 'space-1' // stamped by the runner
    })
  })

  it('contributes an agent tool only when a search backing is supplied', () => {
    expect(buildRssConnector({ feedUrl: 'https://x.com/f' }).agentTools).toHaveLength(0)
    expect(
      buildRssConnector({ feedUrl: 'https://x.com/f', search: () => [] }).agentTools
    ).toHaveLength(1)
  })
})
