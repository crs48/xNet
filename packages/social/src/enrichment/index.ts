/**
 * Display enrichment for imported social content (explorations 0170, 0419).
 */

export {
  buildEnrichmentNodeData,
  enrichmentTargetForPreview,
  feedEnrichmentEntryFor,
  hubAuthHeaders,
  hubHttpUrlFor,
  nextEnrichmentAttempt,
  resolveHubAuthToken,
  socialEnrichmentKey,
  thumbnailContentTypeFor,
  type EnrichmentRowLike,
  type FeedEnrichmentEntry,
  type SocialEnrichmentNodeData,
  type SocialEnrichmentPreviewLike,
  type SocialEnrichmentTarget,
  type SocialUnfurlMetadataPayload
} from './targets'

export {
  fetchEnrichmentForTarget,
  fetchTikTokOEmbed,
  loadMissingThumbnailBlobUrls,
  supportsDirectOEmbed,
  tiktokOEmbedUrl,
  DIRECT_OEMBED_PLATFORMS,
  type BlobPutSink,
  type EnrichmentFetchResult,
  type FetchEnrichmentInput
} from './fetch'

export { SocialEnrichmentQueue, DEFAULT_ENRICHMENT_INTERVAL_MS } from './queue'
