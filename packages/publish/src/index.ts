/**
 * `@xnetjs/publish` — render xNet pages to static HTML, feeds and sitemaps
 * (exploration 0362).
 *
 * The publishing spine. Deliberately depends on nothing but `yjs`: a static
 * build, a hub SSR route, and a test all render through the same code, and the
 * static path works with no xNet infrastructure in the read path at all (the
 * Charter BATNA guarantee).
 */

export {
  renderPost,
  buildExcerpt,
  XNET_PAGE_FRAGMENT_FIELD,
  XNET_PAGE_LEGACY_FRAGMENT_FIELD,
  type EmbedTier,
  type RenderOptions,
  type RenderedHeading,
  type RenderedPost
} from './render'

export { slugify, uniqueSlug, isValidSlug } from './slug'

export {
  publishPost,
  unpublishPost,
  frontierEquals,
  hasUnpublishedChanges,
  takenSlugsFor,
  type Frontier,
  type PostRecord,
  type PostPatch,
  type PublishInput,
  type PublishResult
} from './pipeline'

export {
  buildRss,
  buildSitemap,
  publishedPosts,
  postUrl,
  escapeXml,
  type FeedMeta,
  type PublishedPost
} from './feed'

export { buildPostHead, buildJsonLd, type HeadOptions } from './meta'

export { escapeHtml, escapeAttr, safeUrl, headingId } from './html'
