/**
 * Social enrichment schema.
 *
 * Enrichment nodes carry remotely fetched display metadata (titles,
 * descriptions, thumbnails) for imported social content. They are keyed
 * deterministically per platform content id and owned by the enrichment
 * pipeline, so re-imports never clobber them and they never clobber
 * import-owned content nodes.
 */

import type { InferNode } from '@xnetjs/data'
import { date, defineSchema, number, select, text, url } from '@xnetjs/data'
import { createSocialNodeId } from '../import/ids'
import {
  SOCIAL_NAMESPACE,
  enrichmentSources,
  enrichmentStatuses,
  socialPlatforms
} from './constants'

export const SocialEnrichmentSchema = defineSchema({
  name: 'SocialEnrichment',
  namespace: SOCIAL_NAMESPACE,
  properties: {
    platform: select({ options: socialPlatforms, required: true, default: 'generic' }),
    platformContentId: text({ required: true, maxLength: 500 }),
    canonicalUrl: url({}),
    status: select({ options: enrichmentStatuses, required: true, default: 'pending' }),
    title: text({ maxLength: 1000 }),
    description: text({ maxLength: 5000 }),
    authorName: text({ maxLength: 500 }),
    authorUrl: url({}),
    thumbnailUrl: url({}),
    thumbnailBlobCid: text({ maxLength: 200 }),
    source: select({ options: enrichmentSources }),
    fetchedAt: date({ includeTime: true }),
    attemptCount: number({ min: 0, integer: true }),
    lastError: text({ maxLength: 1000 }),
    metadataJson: text({ maxLength: 20000 })
  },
  document: undefined
})

export type SocialEnrichment = InferNode<(typeof SocialEnrichmentSchema)['_properties']>

/**
 * Deterministic enrichment node id for a platform content id, so fetches
 * from any device upsert the same node.
 */
export function createSocialEnrichmentId(platform: string, platformContentId: string): string {
  return createSocialNodeId('enrichment', [platform, platformContentId])
}
