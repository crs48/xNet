import type { APIRoute } from 'astro'
import { publishedPosts } from '../../data/blog'
import { buildBlogRss } from '../../lib/blog-feed'

// RSS 2.0 feed of the blog, subscribable in any feed reader.
export const GET: APIRoute = () =>
  new Response(buildBlogRss(publishedPosts()), {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    }
  })
