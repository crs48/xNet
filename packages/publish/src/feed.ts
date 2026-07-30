/**
 * RSS and sitemap emitters (exploration 0362).
 *
 * Lifted from `site/src/lib/blog-feed.ts`, which built the same RSS 2.0 shape
 * from a hand-authored data module. Generalised here over a `PublishedPost`
 * so the feed comes from xNet nodes instead — same output contract, including
 * Dublin Core `<dc:creator>` for multi-author bylines.
 */

/** A post as the publish pipeline sees it, independent of node storage. */
export type PublishedPost = {
  slug: string
  title: string
  description: string
  /** ISO 8601 or anything `Date` parses. Absent = draft, excluded from feeds. */
  publishedAt?: string
  /** Byline, in order. Names, not emails — RSS `<author>` wants an address. */
  authors?: string[]
  tags?: string[]
  /** Set when the post was first published elsewhere. */
  canonicalUrl?: string
  /** Last substantive edit, for `<lastmod>` in the sitemap. */
  updatedAt?: string
}

export type FeedMeta = {
  /** Absolute site root, no trailing slash (e.g. `https://xnet.fyi`). */
  siteUrl: string
  /** Path the posts live under, no trailing slash (e.g. `/blog`). */
  basePath?: string
  title: string
  description: string
  language?: string
}

/** Minimal XML escaping for text nodes and attributes. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

/** Absolute URL for a post. */
export function postUrl(meta: FeedMeta, post: PublishedPost): string {
  return `${trimSlash(meta.siteUrl)}${trimSlash(meta.basePath ?? '')}/${post.slug}`
}

/** Posts that belong in public output: published only, newest first. */
export function publishedPosts(posts: PublishedPost[]): PublishedPost[] {
  return posts
    .filter((p) => Boolean(p.publishedAt))
    .sort((a, b) => {
      const delta = Date.parse(b.publishedAt as string) - Date.parse(a.publishedAt as string)
      if (delta !== 0) return delta
      // Tie-break on slug by CODE UNIT, never localeCompare: ICU collation
      // varies by platform and would make builds non-reproducible (the same
      // invariant the fractional sortKey holds).
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0
    })
}

/** RSS 2.0 feed. Filters and orders internally, so callers can pass everything. */
export function buildRss(meta: FeedMeta, posts: PublishedPost[]): string {
  const ordered = publishedPosts(posts)
  const feedUrl = `${trimSlash(meta.siteUrl)}${trimSlash(meta.basePath ?? '')}/rss.xml`

  const items = ordered
    .map((post) => {
      const url = postUrl(meta, post)
      const pubDate = new Date(post.publishedAt as string).toUTCString()
      const creators = (post.authors ?? [])
        .map((a) => `      <dc:creator>${escapeXml(a)}</dc:creator>`)
        .join('\n')
      const categories = (post.tags ?? [])
        .map((t) => `      <category>${escapeXml(t)}</category>`)
        .join('\n')
      return [
        '    <item>',
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        `      <description>${escapeXml(post.description)}</description>`,
        creators,
        `      <pubDate>${pubDate}</pubDate>`,
        categories,
        '    </item>'
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')

  const lastBuild =
    ordered.length > 0
      ? new Date(ordered[0].publishedAt as string).toUTCString()
      : new Date(0).toUTCString()

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(meta.title)}</title>
    <link>${escapeXml(`${trimSlash(meta.siteUrl)}${trimSlash(meta.basePath ?? '')}`)}</link>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
    <description>${escapeXml(meta.description)}</description>
    <language>${escapeXml(meta.language ?? 'en-us')}</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
${items}
  </channel>
</rss>
`
}

/**
 * A sitemap of published posts plus the index.
 *
 * Unpublished posts are absent by construction — `publishedPosts` filters
 * them — so unpublishing removes a URL from the sitemap on the next build.
 */
export function buildSitemap(meta: FeedMeta, posts: PublishedPost[]): string {
  const ordered = publishedPosts(posts)
  const indexUrl = `${trimSlash(meta.siteUrl)}${trimSlash(meta.basePath ?? '')}`

  const entries = [
    { loc: indexUrl, lastmod: ordered[0]?.publishedAt },
    ...ordered.map((post) => ({
      loc: postUrl(meta, post),
      lastmod: post.updatedAt ?? post.publishedAt
    }))
  ]
    .map(({ loc, lastmod }) => {
      const stamp = lastmod ? new Date(lastmod).toISOString().slice(0, 10) : undefined
      return [
        '  <url>',
        `    <loc>${escapeXml(loc)}</loc>`,
        stamp ? `    <lastmod>${stamp}</lastmod>` : '',
        '  </url>'
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`
}
