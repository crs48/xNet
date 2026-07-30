import { describe, expect, it } from 'vitest'
import { buildRss, buildSitemap, postUrl, publishedPosts, type FeedMeta } from './feed'
import { buildJsonLd, buildPostHead } from './meta'
import { slugify, uniqueSlug, isValidSlug } from './slug'

const meta: FeedMeta = {
  siteUrl: 'https://xnet.fyi',
  basePath: '/blog',
  title: 'xNet Blog',
  description: 'Essays on local-first software, data ownership, and the open web.'
}

const posts = [
  {
    slug: 'palimpsest',
    title: 'Palimpsest',
    description: 'The economics of keeping everything.',
    publishedAt: '2026-07-01T00:00:00Z',
    authors: ['crs48', 'Claude'],
    tags: ['storage', 'economics']
  },
  {
    slug: 'clutch-power',
    title: 'Clutch Power',
    description: 'Why bricks stick together.',
    publishedAt: '2026-06-01T00:00:00Z',
    authors: ['crs48']
  },
  {
    slug: 'unfinished',
    title: 'Unfinished',
    description: 'Not ready.'
    // No publishedAt — a draft.
  }
]

describe('publishedPosts', () => {
  it('drops drafts and orders newest first', () => {
    expect(publishedPosts(posts).map((p) => p.slug)).toEqual(['palimpsest', 'clutch-power'])
  })

  it('breaks ties by code unit, not locale collation', () => {
    const same = [
      { slug: 'b', title: 'B', description: '', publishedAt: '2026-01-01T00:00:00Z' },
      { slug: 'a', title: 'A', description: '', publishedAt: '2026-01-01T00:00:00Z' }
    ]
    expect(publishedPosts(same).map((p) => p.slug)).toEqual(['a', 'b'])
  })
})

describe('buildRss', () => {
  const xml = buildRss(meta, posts)

  it('emits one item per published post and excludes drafts', () => {
    expect(xml.match(/<item>/g)).toHaveLength(2)
    expect(xml).not.toContain('Unfinished')
  })

  it('emits one dc:creator per author, in byline order', () => {
    const item = xml.slice(xml.indexOf('<item>'), xml.indexOf('</item>'))
    expect(item.match(/<dc:creator>/g)).toHaveLength(2)
    expect(item.indexOf('crs48')).toBeLessThan(item.indexOf('Claude'))
  })

  it('declares the dc namespace so dc:creator is valid', () => {
    expect(xml).toContain('xmlns:dc="http://purl.org/dc/elements/1.1/"')
  })

  it('uses RFC-822 dates and a self atom:link', () => {
    expect(xml).toContain('<pubDate>Wed, 01 Jul 2026 00:00:00 GMT</pubDate>')
    expect(xml).toContain('href="https://xnet.fyi/blog/rss.xml"')
  })

  it('escapes XML-hostile characters in titles', () => {
    const out = buildRss(meta, [
      { slug: 'x', title: 'Tom & "Jerry" <live>', description: '', publishedAt: '2026-01-01' }
    ])
    expect(out).toContain('Tom &amp; &quot;Jerry&quot; &lt;live&gt;')
  })

  it('is deterministic across runs', () => {
    expect(buildRss(meta, posts)).toBe(buildRss(meta, [...posts].reverse()))
  })
})

describe('buildSitemap', () => {
  const xml = buildSitemap(meta, posts)

  it('lists the index plus every published post', () => {
    expect(xml.match(/<url>/g)).toHaveLength(3)
    expect(xml).toContain('<loc>https://xnet.fyi/blog</loc>')
    expect(xml).toContain('<loc>https://xnet.fyi/blog/palimpsest</loc>')
  })

  it('omits drafts, so unpublishing removes the URL on the next build', () => {
    expect(xml).not.toContain('unfinished')
  })

  it('emits lastmod as a plain date', () => {
    expect(xml).toContain('<lastmod>2026-07-01</lastmod>')
  })
})

describe('postUrl', () => {
  it('joins site, base path and slug without double slashes', () => {
    expect(postUrl({ ...meta, siteUrl: 'https://xnet.fyi/' }, posts[0])).toBe(
      'https://xnet.fyi/blog/palimpsest'
    )
  })
})

describe('slugify / uniqueSlug', () => {
  it('lowercases, strips accents and punctuation, and joins with hyphens', () => {
    expect(slugify('Café — The Owned Audience!')).toBe('cafe-the-owned-audience')
  })

  it('strips apostrophes rather than turning them into hyphens', () => {
    expect(slugify("Don't Panic")).toBe('dont-panic')
  })

  it('falls back to untitled for symbol-only titles', () => {
    expect(slugify('!!!')).toBe('untitled')
    expect(slugify('')).toBe('untitled')
  })

  it('suffixes collisions starting at 2', () => {
    const taken = new Set(['notes'])
    expect(uniqueSlug('Notes', taken)).toBe('notes-2')
    taken.add('notes-2')
    expect(uniqueSlug('Notes', taken)).toBe('notes-3')
  })

  it('validates slug shape', () => {
    expect(isValidSlug('the-owned-audience')).toBe(true)
    expect(isValidSlug('Bad Slug')).toBe(false)
    expect(isValidSlug('-leading')).toBe(false)
    expect(isValidSlug('trailing-')).toBe(false)
  })
})

describe('buildPostHead', () => {
  it('emits canonical, OG and Twitter tags', () => {
    const head = buildPostHead(meta, posts[0], { imageUrl: 'https://xnet.fyi/og/p.png' })
    expect(head).toContain('<link rel="canonical" href="https://xnet.fyi/blog/palimpsest" />')
    expect(head).toContain('property="og:title"')
    expect(head).toContain('content="summary_large_image"')
    expect(head).toContain('rel="alternate" type="application/rss+xml"')
  })

  it('prefers an explicit canonicalUrl for syndicated posts', () => {
    const head = buildPostHead(meta, { ...posts[0], canonicalUrl: 'https://elsewhere.example/p' })
    expect(head).toContain('href="https://elsewhere.example/p"')
    expect(head).not.toContain('href="https://xnet.fyi/blog/palimpsest"')
  })

  it('falls back to a summary card with no image', () => {
    expect(buildPostHead(meta, posts[1])).toContain('content="summary"')
  })

  it('escapes hostile titles in attributes', () => {
    const head = buildPostHead(meta, { ...posts[0], title: '"><script>' })
    expect(head).not.toContain('"><script>')
    expect(head).toContain('&quot;')
  })
})

describe('buildJsonLd', () => {
  it('emits a BlogPosting with authors and dates', () => {
    const ld = buildJsonLd(meta, posts[0])
    const json = JSON.parse(ld.slice(ld.indexOf('{'), ld.lastIndexOf('}') + 1))
    expect(json['@type']).toBe('BlogPosting')
    expect(json.author).toHaveLength(2)
    expect(json.datePublished).toBe('2026-07-01T00:00:00.000Z')
  })

  it('escapes < so a nested </script> cannot close the tag', () => {
    const ld = buildJsonLd(meta, { ...posts[0], title: '</script><img>' })
    expect(ld).not.toContain('</script><img>')
    expect(ld).toContain('\\u003c')
  })
})
