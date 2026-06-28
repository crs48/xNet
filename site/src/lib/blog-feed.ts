/**
 * Pure RSS builder for the blog (exploration 0239). Mirrors the changelog feed
 * pattern in `changelog-feed.ts`: a side-effect-free function the Astro endpoint
 * wraps in a Response, so the feed and the page render from the same data module.
 */

import type { BlogPost } from '../data/blog'

export const SITE_URL = 'https://xnet.fyi'
export const BLOG_URL = `${SITE_URL}/blog`

/** Absolute URL for a post. */
export function postUrl(post: BlogPost): string {
  return `${BLOG_URL}/${post.slug}`
}

/** Minimal XML escaping for text nodes and attributes. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** RSS 2.0 feed of published blog posts (already sorted newest-first by caller). */
export function buildBlogRss(posts: BlogPost[]): string {
  const items = posts
    .map((post) => {
      const url = postUrl(post)
      const pubDate = new Date(post.pubDate).toUTCString()
      const categories = post.tags
        .map((t) => `      <category>${escapeXml(t)}</category>`)
        .join('\n')
      return [
        '    <item>',
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        `      <description>${escapeXml(post.description)}</description>`,
        `      <author>${escapeXml(post.author)}</author>`,
        `      <pubDate>${pubDate}</pubDate>`,
        categories,
        '    </item>'
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')

  const lastBuild =
    posts.length > 0 ? new Date(posts[0].pubDate).toUTCString() : new Date(0).toUTCString()

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>xNet Blog</title>
    <link>${BLOG_URL}</link>
    <atom:link href="${BLOG_URL}/rss.xml" rel="self" type="application/rss+xml" />
    <description>Essays on local-first software, data ownership, and the open web.</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
${items}
  </channel>
</rss>
`
}
