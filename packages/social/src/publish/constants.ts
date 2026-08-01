/**
 * @xnetjs/social — constants for publishing affinity edges (exploration 0420).
 *
 * The one rule that governs this whole directory: what gets published is the
 * user's own ACT — "I saved this URL, on this date, with these tags" — and
 * never the platform's content. Titles, descriptions and thumbnails belong to
 * the platform and the creator; they stay local, and the reader re-derives them
 * if it wants them. That is 0367's card/body split applied to an interaction.
 */

import type { SocialInteractionKind, SocialPlatform } from '../schemas/constants'

/**
 * The adopted lexicon. Its `subject` is `{type: string, format: uri}` — an
 * arbitrary URL — which is the entire reason this feature is possible.
 *
 * Its sibling `community.lexicon.interaction.like` is NOT usable and must not
 * be reached for despite the better-matching name: that record's subject is a
 * `com.atproto.repo.strongRef`, so it can only like things that are already
 * atproto records. There is no CID for a YouTube video.
 */
export const BOOKMARK_NSID = 'community.lexicon.bookmarks.bookmark'

/** The one thing we mint: platform + interaction kind, which bookmark lacks. */
export const AFFINITY_NSID = 'fyi.xnet.social.affinity'

/** The AI-use declaration emitted alongside a publish run. */
export const PREFERENCE_AI_NSID = 'community.lexicon.preference.ai'

/**
 * `community.lexicon.bookmarks.bookmark` declares `"key": "tid"`, so its rkey
 * is timestamp-ordered and assigned at write time. A content-derived rkey — the
 * trick that makes every other upsert in this repo idempotent — is therefore
 * unavailable for it, and idempotence has to come from a local map instead.
 *
 * `fyi.xnet.social.affinity` declares `"key": "any"` precisely so it can carry
 * a deterministic rkey. That addressability, not the extra fields, is the
 * strongest argument for the extension record existing at all.
 */
export const BOOKMARK_RKEY_KIND = 'tid' as const
export const AFFINITY_RKEY_KIND = 'any' as const

/**
 * Interaction kinds that describe **other people** rather than the author's
 * relationship to a piece of content.
 *
 * These are not "off by default" — they are absent from the picker entirely
 * (`selectableInteractionKinds`). A follow names someone who never agreed to be
 * named; a message and a comment carry another person's words; a search query
 * is the most revealing text a person produces and is about nobody but them.
 * A default can be flipped by a tired user at 1am; an absence cannot.
 */
export const NEVER_PUBLISHABLE_INTERACTION_KINDS: readonly SocialInteractionKind[] = [
  'follow',
  'message',
  'comment',
  'search',
  'mention',
  'membership',
  'prompt',
  'generation'
] as const

/** Interaction kinds a user may choose to publish. Everything else is excluded. */
export const PUBLISHABLE_INTERACTION_KINDS: readonly SocialInteractionKind[] = [
  'like',
  'save',
  'bookmark',
  'share',
  'repost',
  'reaction',
  'vote',
  'view'
] as const

/**
 * Privacy classes that can never be offered, whatever the interaction kind.
 * `third-party-private` is the load-bearing one: it is how the importers mark
 * a row as describing someone other than the account holder.
 */
export const NEVER_PUBLISHABLE_PRIVACY_CLASSES = [
  'third-party-private',
  'account-security',
  'billing',
  'ads'
] as const

/**
 * xNet platform id → the bare domain the record carries, mirroring teal.fm's
 * `musicServiceBaseDomain`. A domain travels better than a private vocabulary:
 * a reader that has never heard of xNet still knows what `youtube.com` means.
 *
 * Platforms absent from this map are not publishable — an edge whose origin we
 * cannot name honestly is one we do not publish (`generic` especially, which is
 * the importers' "we could not tell").
 */
export const PLATFORM_DOMAINS: Partial<Record<SocialPlatform, string>> = {
  youtube: 'youtube.com',
  instagram: 'instagram.com',
  tiktok: 'tiktok.com',
  x: 'x.com',
  reddit: 'reddit.com',
  spotify: 'spotify.com',
  apple: 'apple.com'
}

/**
 * Foreign-ID namespaces per platform, after the `my.skylights.rel` pattern
 * (`{ref: 'tmdb:m', value: '389'}`). Used only when the platform id is more
 * stable than the URL.
 */
export const PLATFORM_ID_REFS: Partial<Record<SocialPlatform, string>> = {
  youtube: 'youtube:video',
  instagram: 'instagram:post',
  tiktok: 'tiktok:post',
  x: 'x:post',
  reddit: 'reddit:post'
}
