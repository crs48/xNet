import { describe, expect, it } from 'vitest'
import { buildStaticSite, type SiteInput } from './site'

const input: SiteInput = {
  meta: {
    siteUrl: 'https://xnet.fyi',
    basePath: '/blog',
    title: 'xNet Blog',
    description: 'Essays on local-first software.',
    language: 'en-gb'
  },
  posts: [
    {
      slug: 'palimpsest',
      title: 'Palimpsest',
      description: 'Keeping everything.',
      publishedAt: '2026-07-01T00:00:00Z',
      authors: ['crs48'],
      html: '<p>Body text</p>'
    },
    {
      slug: 'draft-post',
      title: 'Draft',
      description: 'Not ready.',
      html: '<p>Secret</p>'
    }
  ]
}

describe('buildStaticSite', () => {
  const site = buildStaticSite(input)

  it('emits an index, one page per published post, and the feeds', () => {
    expect([...site.keys()].sort()).toEqual([
      'index.html',
      'palimpsest/index.html',
      'robots.txt',
      'rss.xml',
      'sitemap.xml'
    ])
  })

  it('never writes a draft to disk', () => {
    expect(site.has('draft-post/index.html')).toBe(false)
    const all = [...site.values()].join('\n')
    expect(all).not.toContain('Secret')
    expect(all).not.toContain('Draft')
  })

  it('produces a complete standalone document with no external requests', () => {
    const html = site.get('palimpsest/index.html') as string
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<html lang="en-gb">')
    expect(html).toContain('<meta name="viewport"')
    // The BATNA proof: no script tags, and styles are inline — the page needs
    // no xNet infrastructure and no network beyond its own images.
    expect(html).not.toMatch(/<script(?![^>]*application\/ld\+json)/)
    expect(html).not.toContain('<link rel="stylesheet"')
    expect(html).toContain('<style>')
  })

  it('includes the post body, byline and structured data', () => {
    const html = site.get('palimpsest/index.html') as string
    expect(html).toContain('<p>Body text</p>')
    expect(html).toContain('crs48')
    expect(html).toContain('<time datetime="2026-07-01">')
    expect(html).toContain('"@type": "BlogPosting"')
    expect(html).toContain('rel="canonical"')
  })

  it('links the index to published posts only', () => {
    const html = site.get('index.html') as string
    expect(html).toContain('href="https://xnet.fyi/blog/palimpsest"')
    expect(html).not.toContain('draft-post')
  })

  it('points robots.txt at the sitemap', () => {
    expect(site.get('robots.txt')).toContain('Sitemap: https://xnet.fyi/blog/sitemap.xml')
  })

  it('is deterministic — identical output across builds', () => {
    const again = buildStaticSite(input)
    expect([...again.entries()]).toEqual([...site.entries()])
  })

  it('renders an empty publication without crashing', () => {
    const empty = buildStaticSite({ ...input, posts: [] })
    expect(empty.get('index.html')).toContain('No posts yet.')
    expect(empty.has('rss.xml')).toBe(true)
  })

  it('escapes hostile titles in the index and post pages', () => {
    const nasty = buildStaticSite({
      ...input,
      posts: [
        {
          slug: 'x',
          title: '<img src=x onerror=alert(1)>',
          description: '',
          publishedAt: '2026-01-01',
          html: '<p>ok</p>'
        }
      ]
    })
    for (const page of ['index.html', 'x/index.html']) {
      expect(nasty.get(page)).not.toContain('<img src=x onerror')
    }
  })
})
