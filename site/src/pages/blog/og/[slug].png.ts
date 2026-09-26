/**
 * Social-card image for each blog post: `/blog/og/<slug>.png`.
 *
 * Link unfurlers (Slack, X, iMessage, LinkedIn, Bluesky…) fetch `og:image` and
 * will not render SVG, so the essay's inline hero art is rasterised here at
 * build time. One PNG per post, prerendered into `dist/blog/og/`, referenced
 * from the post page via `postSocialImage()` in `data/blog.ts`.
 *
 * The art is drawn for a wide hero band (~3:1) while cards want ~1.9:1, so
 * rather than crop 40% of a picture whose composition is often left-vs-right,
 * the SVG is fitted to the card's full width and the rows above and below are
 * filled by extending the art's own edge pixels. Backgrounds are gradients or
 * flat colour at the edges, so this reads as more sky and more ground, not as
 * a letterbox.
 */
import type { APIRoute, GetStaticPaths } from 'astro'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import sharp from 'sharp'
import { allPosts } from '../../../data/blog'
import { heroArt } from '../../../data/blog-art'

export const OG_WIDTH = 1200
export const OG_HEIGHT = 630

export const getStaticPaths: GetStaticPaths = () => {
  // Drafts included: a draft is reachable by URL while it is being reviewed,
  // and a review link with the generic screenshot is exactly the bug.
  const missing = allPosts().filter((post) => !heroArt[post.slug])
  if (missing.length > 0) {
    throw new Error(
      `blog/og: no hero art registered in data/blog-art.ts for: ${missing.map((p) => p.slug).join(', ')}`
    )
  }
  return allPosts().map((post) => ({ params: { slug: post.slug } }))
}

const VIEWBOX_RE = /\bviewBox="\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*"/

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug!
  const Art = heroArt[slug]
  if (!Art) throw new Error(`blog/og: no hero art for "${slug}"`)

  const container = await AstroContainer.create()
  // `class: ''` drops the Tailwind positioning classes; a rasteriser has no
  // stylesheet, so the root element gets explicit pixel dimensions instead.
  // Astro emits the empty class as a bare `class` attribute — fine for HTML,
  // fatal for the XML parser — so it is removed from the root tag below.
  const rendered = await container.renderToString(Art, { props: { class: '' } })

  const start = rendered.indexOf('<svg')
  const end = rendered.lastIndexOf('</svg>')
  if (start === -1 || end === -1) {
    throw new Error(`blog/og: ${slug} hero art did not render an <svg> root`)
  }
  const svg = rendered.slice(start, end + '</svg>'.length)
  const viewBox = VIEWBOX_RE.exec(svg)
  if (!viewBox) throw new Error(`blog/og: ${slug} hero art has no viewBox`)
  const vbWidth = Number(viewBox[3])
  const vbHeight = Number(viewBox[4])

  // Fit the full artwork to the card's width; the height falls out of the
  // viewBox aspect (≈392px for the 1040×340 pieces).
  const artHeight = Math.round((OG_WIDTH * vbHeight) / vbWidth)
  if (artHeight > OG_HEIGHT) {
    throw new Error(
      `blog/og: ${slug} hero art is taller than the card (${artHeight}px > ${OG_HEIGHT}px)`
    )
  }
  const sized = svg.replace(
    /^<svg\b([^>]*)>/,
    (_match, attrs: string) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${artHeight}"${attrs
        .replace(/\s(width|height)="[^"]*"/g, '')
        .replace(/\sclass(?=\s|$)/g, '')
        .replace(/preserveAspectRatio="[^"]*"/, 'preserveAspectRatio="xMidYMid meet"')}>`
  )

  const top = Math.floor((OG_HEIGHT - artHeight) / 2)
  const bottom = OG_HEIGHT - artHeight - top
  const png = await sharp(Buffer.from(sized), { density: 144 })
    .resize(OG_WIDTH, artHeight)
    .extend({ top, bottom, left: 0, right: 0, extendWith: 'copy' })
    .png({ compressionLevel: 9 })
    .toBuffer()

  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png' }
  })
}
