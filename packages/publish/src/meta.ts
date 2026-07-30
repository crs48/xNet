/**
 * Document head: canonical URLs, Open Graph, Twitter cards, JSON-LD
 * (exploration 0362).
 *
 * The marketing site's `Base.astro` has no `og:*` at all (exploration 0316),
 * so published posts would inherit that gap. Emitting the head here keeps SEO
 * a property of the publishing pipeline rather than of one Astro layout.
 */
import { postUrl, type FeedMeta, type PublishedPost } from './feed'
import { escapeAttr, escapeHtml } from './html'

export type HeadOptions = {
  /** Absolute URL of the social preview image. */
  imageUrl?: string
  /** `@handle` for `twitter:site`. */
  twitterSite?: string
  /**
   * `<meta name="robots">` content. Set `'noindex, nofollow'` for a shadow or
   * staging copy so a duplicate of a live publication cannot be indexed.
   */
  robots?: string
  /**
   * Emit the `<link rel="alternate" type="application/rss+xml">` autodiscovery
   * tag. Defaults to true; set false on a shadow copy so a reader cannot
   * subscribe to a feed that is not the real one.
   */
  feedAutodiscovery?: boolean
}

function tag(attrs: Record<string, string | undefined>): string {
  const parts = Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}="${escapeAttr(v as string)}"`)
    .join(' ')
  return `<meta ${parts} />`
}

/**
 * Head tags for a single post.
 *
 * `canonicalUrl` wins over the generated URL when set: a syndicated post must
 * point search engines at the original, not at our copy.
 */
export function buildPostHead(
  meta: FeedMeta,
  post: PublishedPost,
  options: HeadOptions = {}
): string {
  const url = post.canonicalUrl ?? postUrl(meta, post)
  const lines = [
    `<title>${escapeHtml(post.title)}</title>`,
    tag({ name: 'description', content: post.description }),
    options.robots ? tag({ name: 'robots', content: options.robots }) : '',
    `<link rel="canonical" href="${escapeAttr(url)}" />`,
    tag({ property: 'og:type', content: 'article' }),
    tag({ property: 'og:title', content: post.title }),
    tag({ property: 'og:description', content: post.description }),
    tag({ property: 'og:url', content: url }),
    tag({ property: 'og:site_name', content: meta.title }),
    options.imageUrl ? tag({ property: 'og:image', content: options.imageUrl }) : '',
    post.publishedAt
      ? tag({
          property: 'article:published_time',
          content: new Date(post.publishedAt).toISOString()
        })
      : '',
    ...(post.authors ?? []).map((a) => tag({ property: 'article:author', content: a })),
    ...(post.tags ?? []).map((t) => tag({ property: 'article:tag', content: t })),
    tag({
      name: 'twitter:card',
      content: options.imageUrl ? 'summary_large_image' : 'summary'
    }),
    options.twitterSite ? tag({ name: 'twitter:site', content: options.twitterSite }) : '',
    tag({ name: 'twitter:title', content: post.title }),
    tag({ name: 'twitter:description', content: post.description }),
    options.imageUrl ? tag({ name: 'twitter:image', content: options.imageUrl }) : '',
    options.feedAutodiscovery === false
      ? ''
      : `<link rel="alternate" type="application/rss+xml" title="${escapeAttr(meta.title)}" href="${escapeAttr(
          `${meta.siteUrl.replace(/\/+$/, '')}${(meta.basePath ?? '').replace(/\/+$/, '')}/rss.xml`
        )}" />`
  ]
  return lines.filter(Boolean).join('\n')
}

/**
 * schema.org `BlogPosting` as JSON-LD.
 *
 * Serialised with a fixed key order (not `JSON.stringify` over a mutated
 * object) so the output is byte-stable across runs.
 */
export function buildJsonLd(meta: FeedMeta, post: PublishedPost): string {
  const url = post.canonicalUrl ?? postUrl(meta, post)
  const payload: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    url,
    mainEntityOfPage: url
  }
  if (post.publishedAt) payload.datePublished = new Date(post.publishedAt).toISOString()
  if (post.updatedAt) payload.dateModified = new Date(post.updatedAt).toISOString()
  if (post.authors?.length) {
    payload.author = post.authors.map((name) => ({ '@type': 'Person', name }))
  }
  if (post.tags?.length) payload.keywords = post.tags.join(', ')

  // `</script>` inside JSON would close the tag early.
  const json = JSON.stringify(payload, null, 2).replace(/</g, '\\u003c')
  return `<script type="application/ld+json">\n${json}\n</script>`
}
