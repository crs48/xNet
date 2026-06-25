/**
 * Integration seeder — Feeds → FeedItems, a few ExternalItems (connector
 * inbox), and MediaAssets. Scoped to the org space.
 */

import type { SeederModule } from '../types'
import type { DeterministicNodeImportDraft } from '@xnetjs/data'
import { ExternalItemSchema, FeedItemSchema, FeedSchema, MediaAssetSchema } from '@xnetjs/data'
import { pick, seedId } from '../seed-ids'

const DAY = 86_400_000
const BASE_TS = 1_750_000_000_000

const FEEDS = [
  { slug: 'eng-blog', title: 'Engineering Blog', url: 'https://example.com/eng/rss.xml' },
  { slug: 'changelog', title: 'Product Changelog', url: 'https://example.com/changelog/rss.xml' }
] as const

export const integrationSeeder: SeederModule = {
  domain: 'integration',
  label: 'Feeds & external items',
  schemaIds: [
    FeedSchema._schemaId,
    FeedItemSchema._schemaId,
    ExternalItemSchema._schemaId,
    MediaAssetSchema._schemaId
  ],
  seed: ({ space, scale, rng }) => {
    const drafts: DeterministicNodeImportDraft[] = []

    for (const feed of FEEDS) {
      const feedNodeId = seedId('feed', feed.slug)
      drafts.push({
        id: feedNodeId,
        schemaId: FeedSchema._schemaId,
        properties: {
          title: feed.title,
          feedUrl: feed.url,
          siteUrl: 'https://example.com',
          description: `Seeded ${feed.title}`,
          lastPolledAt: BASE_TS,
          space
        }
      })
      for (let i = 0; i < scale.feedItems; i++) {
        drafts.push({
          id: seedId('feeditem', feed.slug, i),
          schemaId: FeedItemSchema._schemaId,
          properties: {
            feed: feedNodeId,
            title: `${feed.title}: post ${i + 1}`,
            link: `https://example.com/${feed.slug}/${i + 1}`,
            summary: 'A seeded feed item summary.',
            author: pick(rng, ['Ada', 'Alan', 'Grace']),
            publishedAt: BASE_TS - i * DAY,
            space
          }
        })
      }
    }

    // External connector inbox items.
    const sources = ['github', 'linear', 'notion'] as const
    for (let i = 0; i < Math.max(3, scale.feedItems); i++) {
      const source = sources[i % sources.length]
      drafts.push({
        id: seedId('externalitem', i),
        schemaId: ExternalItemSchema._schemaId,
        properties: {
          source,
          kind: source === 'github' ? 'issue' : 'task',
          externalId: `${source}-${1000 + i}`,
          title: `[${source}] Imported item ${i + 1}`,
          url: `https://${source}.example.com/${1000 + i}`,
          status: pick(rng, ['open', 'closed', 'in-progress']),
          updatedAt: BASE_TS - i * DAY,
          space
        }
      })
    }

    // Media assets (file refs only — xNet never stores bytes).
    for (let i = 0; i < 3; i++) {
      drafts.push({
        id: seedId('media', i),
        schemaId: MediaAssetSchema._schemaId,
        properties: {
          title: `Sample image ${i + 1}`,
          kind: 'image',
          alt: 'Seeded placeholder image',
          width: 1200,
          height: 800,
          file: {
            cid: `bafyseedmedia${i}`,
            name: `image-${i + 1}.png`,
            mimeType: 'image/png',
            size: 100000 + i * 1000
          }
        }
      })
    }

    return { drafts }
  }
}
