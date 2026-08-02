/**
 * What gets announced, and what it says (exploration 0432).
 *
 * Two rules, deliberately:
 *   - every published blog essay (the blog feed already excludes drafts);
 *   - every changelog entry whose author set `"syndicate": true`.
 *
 * Nothing else. No digest, no tag allowlist, no significance scorer — there is
 * no signal in this repo that means "major" (155 fragments in one month, 23
 * `v*` tags in 15 days, and tags describe area rather than importance), so the
 * judgement is a human boolean on the fragment.
 */

import { graphemes, MAX_GRAPHEMES, truncateGraphemes } from './facets.mjs'

export const SITE_URL = 'https://xnet.fyi'

/** Decode the five XML entities our own feed builders emit. */
function unescapeXml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function tagText(item, tag) {
  const m = item.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  return m ? unescapeXml(m[1].trim()) : undefined
}

/**
 * Parse the blog RSS into `{ slug, title, description, url }`.
 *
 * The feed is hand-rolled by site/src/lib/blog-feed.ts, so its shape is ours to
 * rely on — but a silent format change must not look like "no new posts". If
 * the document contains <item> elements and any of them fails to yield a title
 * and link, this throws rather than returning a short list.
 */
export function parseBlogFeed(xml) {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? []
  const posts = []
  for (const item of items) {
    const title = tagText(item, 'title')
    const url = tagText(item, 'link')
    if (!title || !url) {
      throw new Error(`blog feed: <item> is missing a title or link — feed format changed?`)
    }
    posts.push({
      slug: url.replace(/\/$/, '').split('/').pop(),
      title,
      description: tagText(item, 'description') ?? '',
      url
    })
  }
  if (items.length !== posts.length) {
    throw new Error(`blog feed: parsed ${posts.length} of ${items.length} items`)
  }
  return posts
}

/** Candidates from the changelog JSON Feed — only entries flagged by an author. */
export function flaggedEntries(feed) {
  return (feed.items ?? []).filter((i) => i._xnet?.syndicate === true)
}

/**
 * Fit to Bluesky's budget, counting the FULL url — Bluesky does not shorten
 * links the way t.co does, so a long changelog anchor eats ~74 of the 300.
 */
export function render({ headline, detail, url }) {
  const room = MAX_GRAPHEMES - graphemes(url) - 2 // the two newlines before the link
  if (room < 1) {
    // A canonical URL this long is pathological. Fail loudly rather than emit a
    // post the server will reject and the ledger will retry forever.
    throw new Error(`url is ${graphemes(url)} graphemes — no room for any text`)
  }
  const first = (detail ?? '').split(/(?<=\.)\s/)[0].trim()
  const full = first ? `${headline} — ${first}` : headline
  // Dropping `detail` is the first fallback, but a long headline alone can
  // still overflow — truncate so the post is always postable.
  const body = graphemes(full) <= room ? full : truncateGraphemes(headline, room)
  return `${body}\n\n${url}`
}

/**
 * Everything postable that isn't already in the ledger, oldest first so a
 * backlog drains in publication order.
 *
 * `posted` is a Set of ledger keys.
 */
export function select({ posts = [], entries = [] }, posted) {
  const candidates = [
    ...posts.map((p) => ({
      key: `blog:${p.slug}`,
      kind: 'blog',
      headline: p.title,
      detail: p.description,
      url: p.url
    })),
    ...entries.map((e) => ({
      key: `log:${e.id}`,
      kind: 'changelog',
      headline: e.title,
      detail: e._xnet?.summary ?? '',
      url: e.url
    }))
  ].filter((c) => !posted.has(c.key))

  return candidates.map((c) => ({ ...c, text: render(c) }))
}
