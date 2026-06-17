import type { APIRoute } from 'astro'
import { entries } from '../data/changelog'
import { buildJsonFeed } from '../lib/changelog-feed'

// JSON Feed 1.1 of the changelog. Consumed by the in-app "What's New" surfaces
// (web PWA + Electron) at https://xnet.fyi/changelog.json.
export const GET: APIRoute = () =>
  new Response(JSON.stringify(buildJsonFeed(entries), null, 2), {
    headers: {
      'Content-Type': 'application/feed+json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    }
  })
