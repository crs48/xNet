/**
 * Built-in social importer registry metadata.
 */

import type { SocialImportAdapter } from '../import/types'
import type { SocialPlatform, SocialPrivacyClass } from '../schemas/constants'
import { claudeAdapter } from './claude'
import { grokAdapter } from './grok'
import { instagramAdapter } from './instagram'
import { openaiAdapter } from './openai'
import { redditAdapter } from './reddit'
import { tiktokAdapter } from './tiktok'
import { xAdapter } from './x'
import { youtubeAdapter } from './youtube'

export type SocialImporterAvailability = 'available' | 'planned'

export type SocialImporterRegistryEntry = {
  id: string
  label: string
  platform: SocialPlatform
  availability: SocialImporterAvailability
  description: string
  archiveFormats: readonly string[]
  recordTypes: readonly string[]
  privacyClasses: readonly SocialPrivacyClass[]
  adapter?: SocialImportAdapter
}

const availableImporter = (input: {
  adapter: SocialImportAdapter
  label: string
  description: string
  archiveFormats: readonly string[]
  recordTypes: readonly string[]
  privacyClasses: readonly SocialPrivacyClass[]
}): SocialImporterRegistryEntry => ({
  id: input.adapter.id,
  label: input.label,
  platform: input.adapter.platform,
  availability: 'available',
  description: input.description,
  archiveFormats: input.archiveFormats,
  recordTypes: input.recordTypes,
  privacyClasses: input.privacyClasses,
  adapter: input.adapter
})

const plannedImporter = (input: {
  id: string
  label: string
  platform: SocialPlatform
  description: string
  archiveFormats: readonly string[]
  recordTypes: readonly string[]
  privacyClasses: readonly SocialPrivacyClass[]
}): SocialImporterRegistryEntry => ({
  ...input,
  availability: 'planned'
})

export const builtInSocialImporterRegistry = [
  availableImporter({
    adapter: instagramAdapter,
    label: 'Instagram',
    description: 'Meta data download archives for profile, graph, posts, reactions, and messages.',
    archiveFormats: ['ZIP export'],
    recordTypes: [
      'profile',
      'followers',
      'following',
      'likes',
      'saves',
      'comments',
      'reels',
      'DMs'
    ],
    privacyClasses: ['public', 'private']
  }),
  availableImporter({
    adapter: grokAdapter,
    label: 'Grok',
    description: 'xAI account export archives for Grok chats and generated conversation records.',
    archiveFormats: ['ZIP export'],
    recordTypes: ['profile', 'conversations', 'messages'],
    privacyClasses: ['private']
  }),
  availableImporter({
    adapter: youtubeAdapter,
    label: 'Google / YouTube',
    description:
      'Google Takeout archives for YouTube subscriptions, history, comments, and playlists.',
    archiveFormats: ['Takeout ZIP'],
    recordTypes: [
      'channel',
      'subscriptions',
      'watch history',
      'search history',
      'comments',
      'playlists'
    ],
    privacyClasses: ['public', 'private']
  }),
  availableImporter({
    adapter: xAdapter,
    label: 'X / Twitter',
    description:
      'Twitter archive exports for account profile, follows, tweets, likes, lists, and DMs.',
    archiveFormats: ['ZIP export'],
    recordTypes: [
      'profile',
      'following',
      'followers',
      'tweets',
      'likes',
      'lists',
      'DMs',
      'Grok chats'
    ],
    privacyClasses: ['public', 'private', 'account-security']
  }),
  availableImporter({
    adapter: tiktokAdapter,
    label: 'TikTok',
    description:
      'TikTok user data exports for profile, social edges, comments, favorites, searches, and chats.',
    archiveFormats: ['ZIP export'],
    recordTypes: [
      'profile',
      'following',
      'followers',
      'comments',
      'favorites',
      'activity',
      'searches',
      'DMs'
    ],
    privacyClasses: ['public', 'private']
  }),
  availableImporter({
    adapter: claudeAdapter,
    label: 'Claude',
    description:
      'Anthropic Claude exports for profile, conversations, projects, and uploaded files.',
    archiveFormats: ['ZIP export'],
    recordTypes: ['profile', 'conversations', 'messages', 'projects', 'files'],
    privacyClasses: ['private']
  }),
  availableImporter({
    adapter: redditAdapter,
    label: 'Reddit',
    description:
      'Reddit GDPR exports for posts, comments, votes, saved items, subreddit membership, and messages.',
    archiveFormats: ['ZIP export', 'CSV bundle'],
    recordTypes: ['profile', 'posts', 'comments', 'votes', 'saved items', 'subreddits', 'messages'],
    privacyClasses: ['public', 'private']
  }),
  availableImporter({
    adapter: openaiAdapter,
    label: 'OpenAI',
    description:
      'OpenAI ChatGPT exports for profile, conversations, feedback, shared links, and files.',
    archiveFormats: ['ZIP export'],
    recordTypes: ['profile', 'conversations', 'messages', 'feedback', 'shared links', 'files'],
    privacyClasses: ['private', 'account-security']
  }),
  plannedImporter({
    id: 'spotify',
    label: 'Spotify',
    platform: 'spotify',
    description: 'Planned support for streaming history, playlists, follows, and library exports.',
    archiveFormats: ['ZIP export', 'JSON bundle'],
    recordTypes: ['profile', 'listening history', 'playlists', 'library', 'follows'],
    privacyClasses: ['private']
  }),
  plannedImporter({
    id: 'apple',
    label: 'Apple',
    platform: 'apple',
    description: 'Planned support for Apple media, purchases, playlist, and activity exports.',
    archiveFormats: ['ZIP export', 'CSV bundle'],
    recordTypes: ['profile', 'media library', 'playlists', 'activity'],
    privacyClasses: ['private']
  }),
  plannedImporter({
    id: 'activitypub',
    label: 'ActivityPub',
    platform: 'activitypub',
    description:
      'Planned support for Mastodon-compatible archives and federated social graph data.',
    archiveFormats: ['ZIP export', 'JSON archive'],
    recordTypes: ['profile', 'followers', 'following', 'posts', 'likes', 'bookmarks'],
    privacyClasses: ['public', 'private']
  }),
  plannedImporter({
    id: 'atproto',
    label: 'AT Protocol',
    platform: 'atproto',
    description: 'Planned support for Bluesky and AT Protocol repository exports.',
    archiveFormats: ['CAR export', 'JSON archive'],
    recordTypes: ['profile', 'follows', 'posts', 'likes', 'lists'],
    privacyClasses: ['public', 'private']
  }),
  plannedImporter({
    id: 'generic',
    label: 'Generic Archive',
    platform: 'generic',
    description:
      'Planned schema-mapping importer for CSV, JSON, and spreadsheet-like personal data exports.',
    archiveFormats: ['ZIP export', 'CSV', 'JSON'],
    recordTypes: ['actors', 'content', 'interactions', 'collections'],
    privacyClasses: ['unknown']
  })
] as const satisfies readonly SocialImporterRegistryEntry[]

export const builtInSocialImportAdapters = listAvailableSocialImportAdapters(
  builtInSocialImporterRegistry
)

export function listAvailableSocialImportAdapters(
  registry: readonly SocialImporterRegistryEntry[] = builtInSocialImporterRegistry
): SocialImportAdapter[] {
  return registry.flatMap((entry) => (entry.adapter ? [entry.adapter] : []))
}

export function findSocialImporterRegistryEntry(
  importerId: string,
  registry: readonly SocialImporterRegistryEntry[] = builtInSocialImporterRegistry
): SocialImporterRegistryEntry | undefined {
  return registry.find((entry) => entry.id === importerId)
}
