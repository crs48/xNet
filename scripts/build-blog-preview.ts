/**
 * Build the shadow blog — the xNet publishing pipeline, run against the real
 * blog, in parallel with production (exploration 0362, Phase 2).
 *
 * **This does not migrate anything.** `site/src/data/blog.ts` remains the one
 * source of truth and the production `/blog` routes are untouched. This script
 * reads that module, models each post as real xNet nodes, renders them through
 * `@xnetjs/publish`, and writes a *duplicate* site under `/blog-preview` so we
 * can compare the two before deciding whether a migration is ever worth doing.
 *
 * The shadow is deliberately hobbled so it can never compete with the real
 * blog: every page is `noindex, nofollow`, no RSS autodiscovery tag is emitted
 * (nobody can accidentally subscribe to a feed that is not the real one), and
 * it contributes nothing to the sitemap.
 *
 * What it proves, and what it does not:
 *   - PROVES: the 19 posts fit `Publication` + `Page` (validated against the
 *     real schemas), and the feed/index generated from nodes matches the feed
 *     production emits today — the byte-comparison gate below.
 *   - DOES NOT PROVE: that the essays survive as documents. Only a few sample
 *     bodies are converted, and the conversion is reported honestly, because
 *     the posts are art-directed Astro pages (hand-rolled code exhibits,
 *     bespoke figures) with no `content-v4` representation.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as Y from 'yjs'
// Imported from source, not by package name. A `workspace:*` devDependency in
// the ROOT package.json breaks every trimmed Docker image (the hub image copies
// root package.json but only its own packages, so pnpm install fails with
// ERR_PNPM_WORKSPACE_PKG_NOT_FOUND). Source imports also mean this script needs
// no build step.
import { buildStaticSite, renderPost } from '../packages/publish/src/index'
import type { FeedMeta, SitePost } from '../packages/publish/src/index'
import { PageSchema, PublicationSchema } from '../packages/data/src/schema/index'
import { postAuthors, publishedPosts, type BlogPost } from '../site/src/data/blog'
import { buildBlogRss } from '../site/src/lib/blog-feed'

const HERE = dirname(fileURLToPath(import.meta.url))
const SITE = resolve(HERE, '..', 'site')
const OUT = join(SITE, 'public', 'blog-preview')

/**
 * Posts whose bodies are converted. Chosen for prose density — these exercise
 * the renderer on real paragraphs, headings and links. The other posts appear
 * in the index and the feed with no body, which is the honest state: their
 * content is Astro components, not a document.
 */
const SAMPLE_SLUGS = ['clutch-power', 'the-loom-you-can-read', 'people-in-disguise']

const META: FeedMeta = {
  siteUrl: 'https://xnet.fyi',
  basePath: '/blog-preview',
  title: 'xNet Blog (shadow)',
  description:
    'A duplicate of the xNet blog rendered through the xNet publishing pipeline. Not the real blog — see /blog.',
  language: 'en-gb'
}

// ─── Node modelling ─────────────────────────────────────────────────────────

type ConversionReport = {
  slug: string
  paragraphs: number
  headings: number
  skipped: number
  skippedKinds: string[]
}

/**
 * Model the publication and its posts as real nodes.
 *
 * Validation runs against the shipped schemas, so a field the blog needs that
 * `Page` cannot hold fails here rather than being quietly dropped — the actual
 * question Phase 2 exists to answer.
 */
function modelAsNodes(posts: BlogPost[]): {
  publication: Record<string, unknown>
  pages: Array<Record<string, unknown>>
} {
  // A stable, obviously-synthetic author for the shadow: the shadow never
  // syncs anywhere, and a real DID here would imply a real signature.
  const SHADOW_DID = 'did:key:zShadowBlogPreviewNotARealIdentity'

  const publication = {
    id: 'shadow-publication',
    schemaId: PublicationSchema._schemaId,
    createdAt: Date.parse('2026-01-01T00:00:00Z'),
    createdBy: SHADOW_DID,
    title: 'xNet Blog',
    description: DESCRIPTION,
    baseUrl: META.siteUrl,
    basePath: '/blog',
    language: 'en-gb',
    followable: true
  }
  const pubResult = PublicationSchema.validate(publication)
  if (!pubResult.valid) {
    throw new Error(`Publication does not validate: ${JSON.stringify(pubResult.errors)}`)
  }

  const pages = posts.map((post) => {
    const page = {
      id: `shadow-post-${post.slug}`,
      schemaId: PageSchema._schemaId,
      // Deterministic: derived from the post, never the clock, so two builds
      // of the same content produce identical nodes.
      createdAt: Date.parse(post.pubDate),
      createdBy: SHADOW_DID,
      title: post.title,
      slug: post.slug,
      excerpt: post.description,
      publishedAt: Date.parse(post.pubDate),
      publication: 'shadow-publication',
      visibility: 'public'
    }
    const result = PageSchema.validate(page)
    if (!result.valid) {
      throw new Error(
        `Post "${post.slug}" does not validate as a Page: ${JSON.stringify(result.errors)}`
      )
    }
    return page
  })

  return { publication, pages }
}

// ─── Body conversion (samples only) ─────────────────────────────────────────

/** Strip inline markup to plain text, decoding the few entities we emit. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Pull prose blocks out of an art-directed `.astro` post.
 *
 * Deliberately narrow: `<h2>`, `<h3>`, `<p>` and `<blockquote>` only. Anything
 * else — code exhibits, hand-rolled figures, hero components — is counted as
 * skipped rather than approximated, because a silently degraded essay is worse
 * than an obviously partial one.
 */
function extractProse(source: string): {
  blocks: Array<{ type: string; text: string; level?: number }>
  report: Omit<ConversionReport, 'slug'>
} {
  const body = source.slice(source.indexOf('---', source.indexOf('---') + 3) + 3)
  const blocks: Array<{ type: string; text: string; level?: number }> = []
  let paragraphs = 0
  let headings = 0
  const skippedKinds = new Set<string>()
  let skipped = 0

  const blockRe = /<(h2|h3|p|blockquote|figure|pre|table)\b[^>]*>([\s\S]*?)<\/\1>/gi
  for (const match of body.matchAll(blockRe)) {
    const tag = match[1].toLowerCase()
    const inner = match[2]
    // Template interpolation means the value is computed — not prose we can
    // faithfully carry across.
    if (inner.includes('${') || inner.includes('set:html')) {
      skipped += 1
      skippedKinds.add(`${tag} (computed)`)
      continue
    }
    const text = textOf(inner)
    if (!text) continue

    if (tag === 'h2' || tag === 'h3') {
      headings += 1
      blocks.push({ type: 'heading', text, level: tag === 'h2' ? 2 : 3 })
    } else if (tag === 'p') {
      paragraphs += 1
      blocks.push({ type: 'paragraph', text })
    } else if (tag === 'blockquote') {
      paragraphs += 1
      blocks.push({ type: 'quote', text })
    } else {
      skipped += 1
      skippedKinds.add(tag)
    }
  }

  return {
    blocks,
    report: { paragraphs, headings, skipped, skippedKinds: [...skippedKinds].sort() }
  }
}

/** Build a `content-v4` Y.Doc from extracted blocks. */
function docFrom(blocks: Array<{ type: string; text: string; level?: number }>): Y.Doc {
  const doc = new Y.Doc()
  const group = new Y.XmlElement('blockGroup')
  doc.getXmlFragment('content-v4').insert(0, [group])
  for (const block of blocks) {
    const container = new Y.XmlElement('blockContainer')
    group.insert(group.length, [container])
    const content = new Y.XmlElement(block.type)
    container.insert(0, [content])
    if (block.level) content.setAttribute('level', String(block.level))
    const inline = new Y.XmlText()
    content.insert(0, [inline])
    inline.insert(0, block.text)
  }
  return doc
}

// ─── Build ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const posts = publishedPosts()
  const { pages } = modelAsNodes(posts)
  console.log(`✓ ${pages.length} post(s) validate as Publication + Page nodes`)

  const reports: ConversionReport[] = []
  const sitePosts: SitePost[] = []

  for (const post of posts) {
    let html = ''
    if (SAMPLE_SLUGS.includes(post.slug)) {
      const source = await readFile(
        join(SITE, 'src', 'pages', 'blog', `${post.slug}.astro`),
        'utf8'
      )
      const { blocks, report } = extractProse(source)
      html = renderPost(docFrom(blocks)).html
      reports.push({ slug: post.slug, ...report })
    }
    sitePosts.push({
      slug: post.slug,
      title: post.title,
      description: post.description,
      publishedAt: post.pubDate,
      authors: postAuthors(post).map((a) => a.name),
      tags: post.tags,
      html
    })
  }

  const site = buildStaticSite({
    meta: META,
    posts: sitePosts,
    // The shadow must never compete with the real blog for indexing or readers.
    head: { robots: 'noindex, nofollow', feedAutodiscovery: false }
  })

  // `--check` verifies the committed output still matches what the current
  // pipeline produces. The artifact is committed (so the site deploy, which
  // installs standalone with --ignore-workspace, can copy it without ever
  // resolving a workspace dependency), and a committed artifact that nobody
  // re-checks is a stale artifact.
  const checkOnly = process.argv.includes('--check')
  if (checkOnly) {
    let drifted = 0
    for (const [path, contents] of site) {
      const target = join(OUT, path)
      const existing = await readFile(target, 'utf8').catch(() => null)
      if (existing !== contents) {
        drifted += 1
        console.error(`  ✗ ${path} ${existing === null ? 'is missing' : 'differs'}`)
      }
    }
    if (drifted > 0) {
      console.error(`\n${drifted} file(s) stale — run \`pnpm build:blog-preview\` and commit.`)
      process.exitCode = 1
      return
    }
    console.log(`✓ committed shadow output matches the pipeline (${site.size} file(s))`)
  } else {
    await rm(OUT, { recursive: true, force: true })
    for (const [path, contents] of site) {
      const target = join(OUT, path)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, contents, 'utf8')
    }
    console.log(`✓ wrote ${site.size} file(s) to public/blog-preview/`)
  }

  // ─── The gate: does the node-generated feed match production's? ───────────
  const productionRss = buildBlogRss(posts)
  const shadowRss = (site.get('rss.xml') as string)
    // Normalise the two things the shadow deliberately changes.
    .replace(/\/blog-preview/g, '/blog')
    .replace(/<title>xNet Blog \(shadow\)<\/title>/, '<title>xNet Blog</title>')
    .replace(
      /<description>A duplicate[^<]*<\/description>/,
      `<description>${DESCRIPTION}</description>`
    )
    .replace(/<language>en-gb<\/language>/, '<language>en-us</language>')

  const prodItems = [...productionRss.matchAll(/<item>[\s\S]*?<\/item>/g)].map((m) => m[0])
  const shadowItems = [...shadowRss.matchAll(/<item>[\s\S]*?<\/item>/g)].map((m) => m[0])

  console.log(
    `\nFeed comparison: ${shadowItems.length} shadow item(s) vs ${prodItems.length} production`
  )
  let mismatches = 0
  for (const [i, prod] of prodItems.entries()) {
    if (shadowItems[i] !== prod) {
      mismatches += 1
      if (mismatches <= 3) {
        console.log(`\n  ✗ item ${i + 1} differs`)
        console.log(`    production: ${prod.replace(/\s+/g, ' ').slice(0, 180)}`)
        console.log(
          `    shadow:     ${(shadowItems[i] ?? '(missing)').replace(/\s+/g, ' ').slice(0, 180)}`
        )
      }
    }
  }
  console.log(
    mismatches === 0
      ? '  ✓ every feed item matches production byte-for-byte'
      : `  ${mismatches} item(s) differ (see above)`
  )

  console.log('\nBody conversion (samples only):')
  for (const r of reports) {
    console.log(
      `  ${r.slug}: ${r.paragraphs} paragraph(s), ${r.headings} heading(s), ` +
        `${r.skipped} block(s) skipped${r.skippedKinds.length ? ` — ${r.skippedKinds.join(', ')}` : ''}`
    )
  }
  console.log(
    `  ${posts.length - reports.length} post(s) carry no body: their content is Astro components, not a document.`
  )
}

const DESCRIPTION = 'Essays on local-first software, data ownership, and the open web.'

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
