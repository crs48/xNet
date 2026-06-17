import type { APIRoute } from 'astro'
import { entries } from '../data/changelog'
import { buildRssXml } from '../lib/changelog-feed'

// RSS 2.0 feed of the changelog, subscribable in any feed reader.
export const GET: APIRoute = () =>
  new Response(buildRssXml(entries), {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    }
  })
