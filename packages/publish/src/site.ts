/**
 * Static site assembly (exploration 0362).
 *
 * Returns a path → contents map rather than touching the filesystem: the
 * package stays I/O-free and testable, and the CLI is a thin writer.
 *
 * This is the **BATNA artifact**. The output must serve from any plain static
 * host with no xNet infrastructure in the read path — no hub, no runtime, no
 * JavaScript. If this ever stops being true, the Charter's BATNA test has
 * failed and the feature is wrong.
 */
import type { RenderedHeading } from './render'
import {
  buildRss,
  buildSitemap,
  postUrl,
  publishedPosts,
  type FeedMeta,
  type PublishedPost
} from './feed'
import { escapeAttr, escapeHtml } from './html'
import { buildJsonLd, buildPostHead, type HeadOptions } from './meta'

/** A post plus its rendered body. */
export type SitePost = PublishedPost & {
  /** Rendered body HTML, from `renderPost()`. */
  html: string
  headings?: RenderedHeading[]
}

export type SiteInput = {
  meta: FeedMeta
  posts: SitePost[]
  head?: HeadOptions
  /** Extra `<style>` contents. Defaults to a minimal readable baseline. */
  css?: string
}

/** Deliberately tiny: a readable default, not a theme system. */
const DEFAULT_CSS = `:root{color-scheme:light dark;--fg:#1a1a1a;--bg:#fff;--muted:#666;--rule:#e5e5e5;--link:#0b5fff}
@media(prefers-color-scheme:dark){:root{--fg:#e8e8e8;--bg:#141414;--muted:#a0a0a0;--rule:#2c2c2c;--link:#7aa7ff}}
*{box-sizing:border-box}
body{margin:0;padding:2rem 1.25rem;background:var(--bg);color:var(--fg);
font:16px/1.65 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:44rem;margin:0 auto}
h1,h2,h3{line-height:1.25;margin:2rem 0 .75rem}
a{color:var(--link)}
hr{border:0;border-top:1px solid var(--rule);margin:2rem 0}
pre{overflow-x:auto;padding:1rem;background:rgba(127,127,127,.12);border-radius:6px}
code{font:0.9em ui-monospace,SFMono-Regular,Menlo,monospace}
pre code{font-size:.85em}
img{max-width:100%;height:auto}
blockquote{margin:1.5rem 0;padding-left:1rem;border-left:3px solid var(--rule);color:var(--muted)}
.xn-table-wrap{overflow-x:auto}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid var(--rule);padding:.4rem .6rem;text-align:left}
.xn-embed{border:1px solid var(--rule);border-radius:8px;padding:1rem;margin:1.5rem 0}
.xn-embed__note{color:var(--muted);font-size:.85em;margin:.5rem 0 0}
.xn-callout{border-left:3px solid var(--link);padding:.75rem 1rem;margin:1.5rem 0;
background:rgba(127,127,127,.08)}
.xn-wikilink--unresolved{color:var(--muted)}
.post-meta{color:var(--muted);font-size:.9em}
.post-list{list-style:none;padding:0}
.post-list li{margin:0 0 1.5rem}`

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

/** ISO date for `<time datetime>`; the visible text stays the same string. */
function isoDate(value: string): string {
  return new Date(value).toISOString().slice(0, 10)
}

function layout(opts: {
  head: string
  body: string
  css: string
  language: string
}): string {
  return `<!doctype html>
<html lang="${escapeAttr(opts.language)}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${opts.head}
<style>${opts.css}</style>
</head>
<body>
<main>
${opts.body}
</main>
</body>
</html>
`
}

function byline(post: SitePost): string {
  const authors = post.authors ?? []
  const names = authors.map((a) => escapeHtml(a)).join(', ')
  const date = post.publishedAt
    ? `<time datetime="${escapeAttr(isoDate(post.publishedAt))}">${escapeHtml(
        isoDate(post.publishedAt)
      )}</time>`
    : ''
  const parts = [date, names ? `by ${names}` : ''].filter(Boolean)
  return parts.length > 0 ? `<p class="post-meta">${parts.join(' · ')}</p>` : ''
}

/** One post page. */
export function buildPostPage(input: SiteInput, post: SitePost): string {
  const head = [buildPostHead(input.meta, post, input.head), buildJsonLd(input.meta, post)].join(
    '\n'
  )
  const body = [
    `<article>`,
    `<h1>${escapeHtml(post.title)}</h1>`,
    byline(post),
    post.html,
    `</article>`,
    `<hr />`,
    `<p><a href="${escapeAttr(trimSlash(input.meta.basePath ?? '') || '/')}/">← ${escapeHtml(
      input.meta.title
    )}</a></p>`
  ].join('\n')

  return layout({
    head,
    body,
    css: input.css ?? DEFAULT_CSS,
    language: input.meta.language ?? 'en'
  })
}

/** The publication index. */
export function buildIndexPage(input: SiteInput): string {
  const ordered = publishedPosts(input.posts) as SitePost[]
  const base = `${trimSlash(input.meta.siteUrl)}${trimSlash(input.meta.basePath ?? '')}`
  const head = [
    `<title>${escapeHtml(input.meta.title)}</title>`,
    `<meta name="description" content="${escapeAttr(input.meta.description)}" />`,
    `<link rel="canonical" href="${escapeAttr(base)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escapeAttr(input.meta.title)}" />`,
    `<meta property="og:description" content="${escapeAttr(input.meta.description)}" />`,
    `<link rel="alternate" type="application/rss+xml" title="${escapeAttr(
      input.meta.title
    )}" href="${escapeAttr(`${base}/rss.xml`)}" />`
  ].join('\n')

  const items = ordered
    .map((post) => {
      const href = postUrl(input.meta, post)
      return [
        '<li>',
        `<h2><a href="${escapeAttr(href)}">${escapeHtml(post.title)}</a></h2>`,
        byline(post),
        post.description ? `<p>${escapeHtml(post.description)}</p>` : '',
        '</li>'
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')

  const body = [
    `<h1>${escapeHtml(input.meta.title)}</h1>`,
    `<p>${escapeHtml(input.meta.description)}</p>`,
    ordered.length > 0 ? `<ul class="post-list">\n${items}\n</ul>` : '<p>No posts yet.</p>',
    `<p><a href="${escapeAttr(`${base}/rss.xml`)}">RSS</a></p>`
  ].join('\n')

  return layout({
    head,
    body,
    css: input.css ?? DEFAULT_CSS,
    language: input.meta.language ?? 'en'
  })
}

/**
 * Assemble the whole site as a path → contents map.
 *
 * Paths are relative and POSIX-style. Posts render to `<slug>/index.html` so
 * URLs stay extensionless on any static host.
 *
 * Drafts are excluded by construction — `publishedPosts` filters on
 * `publishedAt` — so unpublishing removes the page, the feed entry and the
 * sitemap entry in one build.
 */
export function buildStaticSite(input: SiteInput): Map<string, string> {
  const ordered = publishedPosts(input.posts) as SitePost[]
  const out = new Map<string, string>()

  out.set('index.html', buildIndexPage(input))
  for (const post of ordered) {
    out.set(`${post.slug}/index.html`, buildPostPage(input, post))
  }
  out.set('rss.xml', buildRss(input.meta, input.posts))
  out.set('sitemap.xml', buildSitemap(input.meta, input.posts))

  const base = `${trimSlash(input.meta.siteUrl)}${trimSlash(input.meta.basePath ?? '')}`
  out.set('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`)

  return out
}
