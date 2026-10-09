/** Resize each generated cover into a prerendered social-card PNG. */
import type { APIRoute, GetStaticPaths } from 'astro'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { allPosts } from '../../../data/blog'
import { blogArt } from '../../../data/blog-art'

export const OG_WIDTH = 1200
export const OG_HEIGHT = 630

export const getStaticPaths: GetStaticPaths = () =>
  allPosts().map((post) => {
    // Include drafts so their preview links also have the correct cover.
    blogArt(post.slug)
    return { params: { slug: post.slug } }
  })

export const GET: APIRoute = async ({ params }) => {
  const art = blogArt(params.slug!)
  const source = resolve('public', `.${art.src}`)
  const png = await sharp(source)
    .resize(OG_WIDTH, OG_HEIGHT, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toBuffer()

  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png' }
  })
}
