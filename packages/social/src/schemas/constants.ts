/**
 * Shared social graph schema constants.
 */

export const SOCIAL_NAMESPACE = 'xnet://xnet.fyi/social/' as const

export const socialPlatforms = [
  { id: 'instagram', name: 'Instagram' },
  { id: 'grok', name: 'Grok' },
  { id: 'x', name: 'X' },
  { id: 'youtube', name: 'YouTube' },
  { id: 'reddit', name: 'Reddit' },
  { id: 'openai', name: 'OpenAI' },
  { id: 'claude', name: 'Claude' },
  { id: 'spotify', name: 'Spotify' },
  { id: 'apple', name: 'Apple' },
  { id: 'activitypub', name: 'ActivityPub' },
  { id: 'atproto', name: 'AT Protocol' },
  { id: 'generic', name: 'Generic' }
] as const

export type SocialPlatform = (typeof socialPlatforms)[number]['id']

export const privacyClasses = [
  { id: 'public', name: 'Public', color: 'green' },
  { id: 'private', name: 'Private', color: 'red' },
  { id: 'third-party-private', name: 'Third-Party Private', color: 'orange' },
  { id: 'account-security', name: 'Account Security', color: 'red' },
  { id: 'billing', name: 'Billing', color: 'red' },
  { id: 'ads', name: 'Ads', color: 'yellow' },
  { id: 'unknown', name: 'Unknown', color: 'gray' }
] as const

export type SocialPrivacyClass = (typeof privacyClasses)[number]['id']

export const visibilityOptions = [
  { id: 'private', name: 'Private', color: 'red' },
  { id: 'friends', name: 'Friends', color: 'blue' },
  { id: 'public', name: 'Public', color: 'green' },
  { id: 'hub-indexed', name: 'Hub Indexed', color: 'purple' }
] as const

export type SocialVisibility = (typeof visibilityOptions)[number]['id']

export const importRunStatuses = [
  { id: 'staged', name: 'Staged', color: 'yellow' },
  { id: 'committed', name: 'Committed', color: 'green' },
  { id: 'failed', name: 'Failed', color: 'red' },
  { id: 'cancelled', name: 'Cancelled', color: 'gray' }
] as const

export type SocialImportRunStatus = (typeof importRunStatuses)[number]['id']

export const sourceRecordKinds = [
  { id: 'actor', name: 'Actor' },
  { id: 'content', name: 'Content' },
  { id: 'interaction', name: 'Interaction' },
  { id: 'conversation', name: 'Conversation' },
  { id: 'message', name: 'Message' },
  { id: 'collection', name: 'Collection' },
  { id: 'collection-item', name: 'Collection Item' },
  { id: 'media', name: 'Media' },
  { id: 'account-metadata', name: 'Account Metadata' },
  { id: 'ignored', name: 'Ignored' },
  { id: 'unknown', name: 'Unknown' }
] as const

export type SocialSourceRecordKind = (typeof sourceRecordKinds)[number]['id']

export const actorKinds = [
  { id: 'person', name: 'Person' },
  { id: 'account', name: 'Account' },
  { id: 'channel', name: 'Channel' },
  { id: 'community', name: 'Community' },
  { id: 'organization', name: 'Organization' },
  { id: 'bot', name: 'Bot' },
  { id: 'ai-assistant', name: 'AI Assistant' },
  { id: 'unknown', name: 'Unknown' }
] as const

export type SocialActorKind = (typeof actorKinds)[number]['id']

export const contentKinds = [
  { id: 'post', name: 'Post' },
  { id: 'comment', name: 'Comment' },
  { id: 'reply', name: 'Reply' },
  { id: 'video', name: 'Video' },
  { id: 'audio', name: 'Audio' },
  { id: 'image', name: 'Image' },
  { id: 'link', name: 'Link' },
  { id: 'generated-media', name: 'Generated Media' },
  { id: 'ai-response', name: 'AI Response' },
  { id: 'transcript', name: 'Transcript' },
  { id: 'unknown', name: 'Unknown' }
] as const

export type SocialContentKind = (typeof contentKinds)[number]['id']

export const interactionKinds = [
  { id: 'follow', name: 'Follow' },
  { id: 'like', name: 'Like' },
  { id: 'save', name: 'Save' },
  { id: 'bookmark', name: 'Bookmark' },
  { id: 'comment', name: 'Comment' },
  { id: 'message', name: 'Message' },
  { id: 'view', name: 'View' },
  { id: 'vote', name: 'Vote' },
  { id: 'share', name: 'Share' },
  { id: 'repost', name: 'Repost' },
  { id: 'mention', name: 'Mention' },
  { id: 'reaction', name: 'Reaction' },
  { id: 'prompt', name: 'Prompt' },
  { id: 'generation', name: 'Generation' },
  { id: 'cited', name: 'Cited' },
  { id: 'membership', name: 'Membership' },
  { id: 'unknown', name: 'Unknown' }
] as const

export type SocialInteractionKind = (typeof interactionKinds)[number]['id']

export const conversationKinds = [
  { id: 'dm', name: 'Direct Message' },
  { id: 'group-dm', name: 'Group Direct Message' },
  { id: 'ai-chat', name: 'AI Chat' },
  { id: 'comment-thread', name: 'Comment Thread' },
  { id: 'support', name: 'Support' },
  { id: 'unknown', name: 'Unknown' }
] as const

export type SocialConversationKind = (typeof conversationKinds)[number]['id']

export const messageKinds = [
  { id: 'message', name: 'Message' },
  { id: 'prompt', name: 'Prompt' },
  { id: 'ai-response', name: 'AI Response' },
  { id: 'system', name: 'System' },
  { id: 'attachment', name: 'Attachment' },
  { id: 'unknown', name: 'Unknown' }
] as const

export type SocialMessageKind = (typeof messageKinds)[number]['id']

export const collectionKinds = [
  { id: 'saved', name: 'Saved' },
  { id: 'playlist', name: 'Playlist' },
  { id: 'list', name: 'List' },
  { id: 'folder', name: 'Folder' },
  { id: 'project', name: 'Project' },
  { id: 'subreddit', name: 'Subreddit' },
  { id: 'topic', name: 'Topic' },
  { id: 'inferred-cluster', name: 'Inferred Cluster' },
  { id: 'unknown', name: 'Unknown' }
] as const

export type SocialCollectionKind = (typeof collectionKinds)[number]['id']

export const identityClaimKinds = [
  { id: 'same-platform-id', name: 'Same Platform ID' },
  { id: 'same-url', name: 'Same URL' },
  { id: 'same-handle', name: 'Same Handle' },
  { id: 'same-display-name', name: 'Same Display Name' },
  { id: 'model-inferred', name: 'Model Inferred' },
  { id: 'user-confirmed', name: 'User Confirmed' }
] as const

export type SocialIdentityClaimKind = (typeof identityClaimKinds)[number]['id']
