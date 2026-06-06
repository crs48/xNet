/**
 * Instagram export importer.
 */

import type {
  ArchiveEntryRef,
  ArchiveManifest,
  ImportBucket,
  ImportSelection,
  SocialImportAdapter,
  SocialImportContext,
  StagedSocialRecord
} from '../import/core'
import {
  classifySocialEntryPrivacy,
  createSocialNodeId,
  createSourceRecord,
  createStagedNode,
  getBucketDefaultSelected,
  normalizeHandle,
  normalizeUrl
} from '../import/core'

export const INSTAGRAM_ADAPTER_ID = 'instagram'
export const INSTAGRAM_ADAPTER_VERSION = '0.1.0'

type InstagramStringListData = {
  href?: string
  value?: string
  timestamp?: number
}

type InstagramRelationshipRecord = {
  title?: string
  string_list_data?: InstagramStringListData[]
}

type InstagramLabeledRecord = {
  timestamp?: number
  fbid?: string
  label_values?: Array<{ label?: string; value?: string; href?: string }>
  media?: unknown[]
}

type InstagramCommentRecord = {
  media_list_data?: Array<{ uri?: string; creation_timestamp?: number }>
  string_map_data?: Record<string, { value?: string; href?: string; timestamp?: number }>
}

type InstagramReelsExport = {
  ig_reels_media?: Array<{
    uri?: string
    creation_timestamp?: number
    title?: string
    cross_post_source?: string
    media_metadata?: unknown
  }>
}

type InstagramReelRecord = NonNullable<InstagramReelsExport['ig_reels_media']>[number]

type InstagramMessageThread = {
  participants?: Array<{ name?: string }>
  messages?: Array<{
    sender_name?: string
    timestamp_ms?: number
    content?: string
    photos?: Array<{ uri?: string; creation_timestamp?: number }>
    videos?: Array<{ uri?: string; creation_timestamp?: number }>
    share?: { link?: string; share_text?: string; original_content_owner?: string }
    reactions?: unknown[]
  }>
  title?: string
  thread_path?: string
  is_still_participant?: boolean
}

type InstagramProfileExport = {
  profile_user?: Array<{
    title?: string
    string_map_data?: Record<string, { value?: string; href?: string; timestamp?: number }>
    media_map_data?: Record<string, unknown>
  }>
}

type InstagramProfileRecord = NonNullable<InstagramProfileExport['profile_user']>[number]

const bucketPatterns: Array<{ id: string; label: string; pattern: RegExp; description: string }> = [
  {
    id: 'instagram.profile',
    label: 'Profile',
    pattern:
      /personal_information\/personal_information\/(personal_information|instagram_profile_information)\.json$/,
    description: 'Self profile actor without account-security fields.'
  },
  {
    id: 'instagram.following',
    label: 'Following',
    pattern: /connections\/followers_and_following\/following\.json$/,
    description: 'Outbound follow edges.'
  },
  {
    id: 'instagram.followers',
    label: 'Followers',
    pattern: /connections\/followers_and_following\/followers_\d+\.json$/,
    description: 'Inbound follow edges.'
  },
  {
    id: 'instagram.likes',
    label: 'Likes',
    pattern: /your_instagram_activity\/likes\/liked_(posts|comments)\.json$/,
    description: 'Liked post/comment placeholders and like interactions.'
  },
  {
    id: 'instagram.saves',
    label: 'Saves',
    pattern: /your_instagram_activity\/saved\/saved_(posts|collections|music)\.json$/,
    description: 'Saved content and collection membership.'
  },
  {
    id: 'instagram.comments',
    label: 'Comments',
    pattern: /your_instagram_activity\/comments\/post_comments_\d+\.json$/,
    description: 'Authored comments and comment interactions.'
  },
  {
    id: 'instagram.media',
    label: 'Media',
    pattern: /your_instagram_activity\/media\/|^media\//,
    description: 'Instagram posts, reels, reposts, and local media references.'
  },
  {
    id: 'instagram.messages',
    label: 'Messages',
    pattern: /your_instagram_activity\/messages\/.*\/message_\d+\.json$/,
    description: 'Direct, request, and broadcast message threads.'
  },
  {
    id: 'instagram.account-metadata',
    label: 'Account Metadata',
    pattern:
      /personal_information|security_and_login_information|apps_and_websites|monetization|shopping/,
    description: 'Sensitive account/security/payment-like metadata excluded by default.'
  },
  {
    id: 'instagram.ads',
    label: 'Ads And Attention',
    pattern: /ads_information|logged_information/,
    description: 'Ad profile and activity logs excluded by default.'
  }
]

export const instagramAdapter: SocialImportAdapter = {
  id: INSTAGRAM_ADAPTER_ID,
  version: INSTAGRAM_ADAPTER_VERSION,
  platform: 'instagram',
  detect: (manifest) => (hasInstagramSignals(manifest) ? 0.95 : 0),
  probe: ({ manifest }) => ({
    adapterId: INSTAGRAM_ADAPTER_ID,
    adapterVersion: INSTAGRAM_ADAPTER_VERSION,
    platform: 'instagram',
    confidence: hasInstagramSignals(manifest) ? 0.95 : 0,
    buckets: createInstagramBuckets(manifest),
    warnings: []
  }),
  stage: stageInstagramArchive
}

export async function* stageInstagramArchive(
  context: SocialImportContext,
  selection: ImportSelection = {}
): AsyncIterable<StagedSocialRecord> {
  const selectedBuckets = resolveSelectedBuckets(
    createInstagramBuckets(context.manifest),
    selection
  )
  const selfActorId = createSocialNodeId('actor', [
    'instagram',
    'self',
    context.observedBy ?? context.archiveId
  ])

  for (const bucket of selectedBuckets) {
    for (const path of bucket.entryPaths) {
      const source = findEntry(context.manifest, path)
      if (!source) continue
      const input = await context.readJsonEntry(path)

      if (bucket.id === 'instagram.profile') {
        yield* mapInstagramProfile({ context, source, selfActorId, input })
      } else if (bucket.id === 'instagram.following') {
        yield* mapInstagramFollowing({ context, source, selfActorId, input })
      } else if (bucket.id === 'instagram.followers') {
        yield* mapInstagramFollowers({ context, source, selfActorId, input })
      } else if (bucket.id === 'instagram.likes') {
        yield* mapInstagramLikedPosts({ context, source, selfActorId, input })
      } else if (bucket.id === 'instagram.saves') {
        yield* mapInstagramSavedPosts({ context, source, selfActorId, input })
      } else if (bucket.id === 'instagram.comments') {
        yield* mapInstagramComments({ context, source, selfActorId, input })
      } else if (bucket.id === 'instagram.media') {
        yield* mapInstagramReels({ context, source, selfActorId, input })
      } else if (bucket.id === 'instagram.messages') {
        yield* mapInstagramMessages({ context, source, selfActorId, input })
      }
    }
  }
}

export function mapInstagramProfile(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  input: unknown
}): StagedSocialRecord[] {
  const profile = isRecord(input.input)
    ? ((input.input as InstagramProfileExport).profile_user?.[0] ?? input.input)
    : {}
  const labels = isRecord(profile)
    ? Object.fromEntries(
        Object.entries(
          ((profile as InstagramProfileRecord).string_map_data ?? {}) as Record<
            string,
            { value?: string; href?: string; timestamp?: number }
          >
        ).map(([key, value]) => [normalizeHandle(key), value.value ?? value.href])
      )
    : {}
  const title =
    isRecord(profile) && typeof profile.title === 'string' ? profile.title : 'Instagram Profile'
  const handle = normalizeHandle(labels.username ?? labels.handle ?? title)
  const sourceRecord = createSourceRecord({
    ...sourceBase(
      input,
      'instagram.profile',
      `profile:${handle || 'self'}`,
      profile,
      'actor',
      'private'
    )
  })

  return [
    sourceRecord,
    createStagedNode({
      kind: 'actor',
      deterministicId: input.selfActorId,
      platform: 'instagram',
      bucketId: 'instagram.profile',
      source: input.source,
      sourceRecordId: sourceRecord.deterministicId,
      privacyClass: 'private',
      properties: {
        actorKind: 'account',
        platformActorId: handle || 'self',
        handle,
        displayName: labels.name ?? title,
        profileUrl: labels.profile ?? labels.website,
        observedBy: input.context.observedBy,
        observedAt: input.context.importedAt,
        isSelf: true,
        metadataJson: JSON.stringify({ labelKeys: Object.keys(labels) })
      }
    })
  ]
}

export function mapInstagramFollowing(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  input: unknown
}): StagedSocialRecord[] {
  const rows = asRelationshipArray(input.input, 'relationships_following')
  return rows.flatMap((row, index) => {
    const handle = normalizeHandle(row.title ?? row.string_list_data?.[0]?.value ?? '')
    if (!handle) return []
    const sourceRecordId = `following:${handle}:${index}`
    const sourceRecord = createSourceRecord({
      ...sourceBase(input, 'instagram.following', sourceRecordId, row, 'actor', 'public')
    })
    const actorId = createSocialNodeId('actor', ['instagram', 'handle', handle])
    const observedAt = secondsToIso(row.string_list_data?.[0]?.timestamp)

    return [
      sourceRecord,
      createStagedNode({
        kind: 'actor',
        deterministicId: actorId,
        platform: 'instagram',
        bucketId: 'instagram.following',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'public',
        properties: {
          actorKind: 'account',
          platformActorId: handle,
          handle,
          displayName: row.title ?? handle,
          profileUrl: row.string_list_data?.[0]?.href,
          observedBy: input.context.observedBy,
          observedAt
        }
      }),
      createStagedNode({
        kind: 'interaction',
        deterministicId: createSocialNodeId('interaction', [
          'instagram',
          input.selfActorId,
          'follow',
          actorId,
          observedAt
        ]),
        platform: 'instagram',
        bucketId: 'instagram.following',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'public',
        properties: {
          interactionKind: 'follow',
          platformInteractionKind: 'relationships_following',
          actor: input.selfActorId,
          target: actorId,
          targetSchema: 'SocialActor',
          targetTitle: row.title ?? handle,
          targetAuthorHandle: handle,
          observedAt,
          importedAt: input.context.importedAt,
          confidence: 0.95
        }
      })
    ]
  })
}

export function mapInstagramFollowers(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  input: unknown
}): StagedSocialRecord[] {
  const rows = asRelationshipArray(input.input)
  return rows.flatMap((row, index) => {
    const handle = normalizeHandle(row.title ?? row.string_list_data?.[0]?.value ?? '')
    if (!handle) return []
    const sourceRecordId = `follower:${handle}:${index}`
    const sourceRecord = createSourceRecord({
      ...sourceBase(input, 'instagram.followers', sourceRecordId, row, 'actor', 'public')
    })
    const actorId = createSocialNodeId('actor', ['instagram', 'handle', handle])
    const observedAt = secondsToIso(row.string_list_data?.[0]?.timestamp)

    return [
      sourceRecord,
      createStagedNode({
        kind: 'actor',
        deterministicId: actorId,
        platform: 'instagram',
        bucketId: 'instagram.followers',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'public',
        properties: {
          actorKind: 'account',
          platformActorId: handle,
          handle,
          displayName: row.title ?? handle,
          profileUrl: row.string_list_data?.[0]?.href,
          observedBy: input.context.observedBy,
          observedAt
        }
      }),
      createStagedNode({
        kind: 'interaction',
        deterministicId: createSocialNodeId('interaction', [
          'instagram',
          actorId,
          'follow',
          input.selfActorId,
          observedAt
        ]),
        platform: 'instagram',
        bucketId: 'instagram.followers',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'public',
        properties: {
          interactionKind: 'follow',
          platformInteractionKind: 'relationships_followers',
          actor: actorId,
          target: input.selfActorId,
          targetSchema: 'SocialActor',
          targetTitle: 'Self',
          observedAt,
          importedAt: input.context.importedAt,
          confidence: 0.85
        }
      })
    ]
  })
}

export function mapInstagramLikedPosts(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  input: unknown
}): StagedSocialRecord[] {
  return asLabeledArray(input.input).flatMap((row, index) =>
    mapInstagramLabeledContentInteraction({
      ...input,
      row,
      index,
      bucketId: 'instagram.likes',
      interactionKind: 'like',
      platformInteractionKind: input.source.path.includes('liked_comments')
        ? 'liked_comments'
        : 'liked_posts'
    })
  )
}

export function mapInstagramSavedPosts(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  input: unknown
}): StagedSocialRecord[] {
  const collectionId = createSocialNodeId('collection', [
    'instagram',
    input.selfActorId,
    input.source.path
  ])
  const collectionSource = createSourceRecord({
    ...sourceBase(
      input,
      'instagram.saves',
      `collection:${input.source.path}`,
      {},
      'collection',
      'public'
    )
  })

  return [
    collectionSource,
    createStagedNode({
      kind: 'collection',
      deterministicId: collectionId,
      platform: 'instagram',
      bucketId: 'instagram.saves',
      source: input.source,
      sourceRecordId: collectionSource.deterministicId,
      privacyClass: 'public',
      properties: {
        collectionKind: 'saved',
        platformCollectionId: input.source.path,
        title: savedCollectionTitle(input.source.path),
        ownerActor: input.selfActorId,
        itemCount: asLabeledArray(input.input).length,
        observedAt: input.context.importedAt
      }
    }),
    ...asLabeledArray(input.input).flatMap((row, index) => {
      const mapped = mapInstagramLabeledContentInteraction({
        ...input,
        row,
        index,
        bucketId: 'instagram.saves',
        interactionKind: 'save',
        platformInteractionKind: input.source.path.includes('music') ? 'saved_music' : 'saved_posts'
      })
      const content = mapped.find((record) => record.kind === 'content')
      if (!content) return mapped
      return [
        ...mapped,
        createStagedNode({
          kind: 'collection-item',
          deterministicId: createSocialNodeId('collection-item', [
            'instagram',
            collectionId,
            content.deterministicId
          ]),
          platform: 'instagram',
          bucketId: 'instagram.saves',
          source: input.source,
          sourceRecordId:
            mapped.find((record) => record.kind === 'source-record')?.deterministicId ??
            collectionSource.deterministicId,
          privacyClass: 'public',
          properties: {
            collection: collectionId,
            item: content.deterministicId,
            itemSchema: 'SocialContent',
            sortKey: String(index).padStart(8, '0'),
            addedAt: secondsToIso(row.timestamp)
          }
        })
      ]
    })
  ]
}

export function mapInstagramComments(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  input: unknown
}): StagedSocialRecord[] {
  return asArray<InstagramCommentRecord>(input.input).flatMap((row, index) => {
    const comment = row.string_map_data?.Comment?.value ?? ''
    const owner = row.string_map_data?.['Media Owner']?.value
    const observedAt = secondsToIso(row.string_map_data?.Time?.timestamp)
    const sourceRecordId = `comment:${index}:${observedAt ?? 'unknown'}`
    const sourceRecord = createSourceRecord({
      ...sourceBase(input, 'instagram.comments', sourceRecordId, row, 'content', 'public'),
      warnings: detectTextWarnings(comment)
    })
    const commentId = createSocialNodeId('content', [
      'instagram',
      'comment',
      comment,
      observedAt,
      index
    ])

    return [
      sourceRecord,
      createStagedNode({
        kind: 'content',
        deterministicId: commentId,
        platform: 'instagram',
        bucketId: 'instagram.comments',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'public',
        warnings: detectTextWarnings(comment),
        properties: {
          contentKind: 'comment',
          platformContentKind: 'post_comment',
          authorActor: input.selfActorId,
          actorHandle: 'self',
          textPreview: trimPreview(comment),
          searchText: comment,
          platformUrl: row.string_map_data?.Comment?.href,
          publishedAt: observedAt,
          observedAt,
          importedAt: input.context.importedAt,
          confidence: 0.85,
          metadataJson: JSON.stringify({ mediaOwner: owner, media: row.media_list_data ?? [] })
        }
      }),
      createStagedNode({
        kind: 'interaction',
        deterministicId: createSocialNodeId('interaction', [
          'instagram',
          input.selfActorId,
          'comment',
          commentId
        ]),
        platform: 'instagram',
        bucketId: 'instagram.comments',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'public',
        properties: {
          interactionKind: 'comment',
          platformInteractionKind: 'post_comment',
          actor: input.selfActorId,
          target: commentId,
          targetSchema: 'SocialContent',
          targetTitle: owner,
          targetAuthorHandle: owner ? normalizeHandle(owner) : undefined,
          observedAt,
          publishedAt: observedAt,
          importedAt: input.context.importedAt,
          confidence: 0.8
        }
      })
    ]
  })
}

export function mapInstagramReels(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  input: unknown
}): StagedSocialRecord[] {
  const rows = asArray<InstagramReelRecord>(
    isRecord(input.input) && Array.isArray(input.input.ig_reels_media)
      ? input.input.ig_reels_media
      : input.input
  )
  return rows.flatMap((row, index) => {
    const sourceRecordId = `reel:${row.uri ?? index}`
    const sourceRecord = createSourceRecord({
      ...sourceBase(input, 'instagram.media', sourceRecordId, row, 'content', 'public')
    })
    const contentId = createSocialNodeId('content', ['instagram', 'reel', row.uri ?? index])
    const observedAt = secondsToIso(row.creation_timestamp)

    return [
      sourceRecord,
      createStagedNode({
        kind: 'content',
        deterministicId: contentId,
        platform: 'instagram',
        bucketId: 'instagram.media',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'public',
        properties: {
          contentKind: 'video',
          platformContentKind: 'reel',
          platformContentId: row.uri,
          authorActor: input.selfActorId,
          actorHandle: 'self',
          title: row.title,
          textPreview: trimPreview(row.title ?? ''),
          mediaKind: 'video',
          observedAt,
          publishedAt: observedAt,
          importedAt: input.context.importedAt,
          metadataJson: JSON.stringify({
            uri: row.uri,
            crossPostSource: row.cross_post_source,
            mediaMetadata: row.media_metadata
          })
        }
      })
    ]
  })
}

export function mapInstagramMessages(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  input: unknown
}): StagedSocialRecord[] {
  const thread = isRecord(input.input) ? (input.input as InstagramMessageThread) : {}
  const participants = thread.participants ?? []
  const messages = thread.messages ?? []
  const sourceRecordId = `thread:${thread.thread_path ?? input.source.path}`
  const sourceRecord = createSourceRecord({
    ...sourceBase(
      input,
      'instagram.messages',
      sourceRecordId,
      thread,
      'conversation',
      'third-party-private'
    )
  })
  const conversationId = createSocialNodeId('conversation', [
    'instagram',
    thread.thread_path ?? input.source.path
  ])
  const participantActors = participants
    .map((participant) => participant.name?.trim())
    .filter((name): name is string => Boolean(name))
    .map((name) => ({
      name,
      actorId: createSocialNodeId('actor', [
        'instagram',
        'message-participant',
        normalizeHandle(name)
      ])
    }))

  return [
    sourceRecord,
    ...participantActors.map(({ name, actorId }) =>
      createStagedNode({
        kind: 'actor',
        deterministicId: actorId,
        platform: 'instagram',
        bucketId: 'instagram.messages',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'third-party-private',
        properties: {
          actorKind: 'account',
          platformActorId: normalizeHandle(name),
          handle: normalizeHandle(name),
          displayName: name,
          observedBy: input.context.observedBy,
          observedAt: input.context.importedAt
        }
      })
    ),
    createStagedNode({
      kind: 'conversation',
      deterministicId: conversationId,
      platform: 'instagram',
      bucketId: 'instagram.messages',
      source: input.source,
      sourceRecordId: sourceRecord.deterministicId,
      privacyClass: 'third-party-private',
      properties: {
        conversationKind: participantActors.length > 2 ? 'group-dm' : 'dm',
        platformConversationId: thread.thread_path ?? input.source.path,
        title: thread.title,
        participantActorIdsJson: JSON.stringify(participantActors.map((actor) => actor.actorId)),
        startedAt: millisecondsToIso(
          Math.min(...messages.map((message) => message.timestamp_ms ?? Number.POSITIVE_INFINITY))
        ),
        lastMessageAt: millisecondsToIso(
          Math.max(...messages.map((message) => message.timestamp_ms ?? 0))
        ),
        messageCount: messages.length,
        metadataJson: JSON.stringify({ isStillParticipant: thread.is_still_participant })
      }
    }),
    ...messages.map((message, index) => {
      const senderHandle = normalizeHandle(message.sender_name ?? '')
      const senderActor = participantActors.find(
        (actor) => normalizeHandle(actor.name) === senderHandle
      )
      const sentAt = millisecondsToIso(message.timestamp_ms)
      const text = message.content ?? message.share?.share_text ?? ''
      return createStagedNode({
        kind: 'message',
        deterministicId: createSocialNodeId('message', [
          'instagram',
          conversationId,
          message.timestamp_ms,
          message.sender_name,
          index
        ]),
        platform: 'instagram',
        bucketId: 'instagram.messages',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'third-party-private',
        warnings: detectTextWarnings(text),
        properties: {
          messageKind: 'message',
          platformMessageId: `${message.timestamp_ms ?? 'unknown'}:${index}`,
          conversation: conversationId,
          senderActor: senderActor?.actorId,
          senderHandle,
          textPreview: trimPreview(text),
          searchText: text,
          attachmentRefsJson: JSON.stringify([
            ...(message.photos ?? []),
            ...(message.videos ?? [])
          ]),
          externalRefsJson: JSON.stringify(
            message.share?.link ? [{ url: message.share.link }] : []
          ),
          reactionSummaryJson: JSON.stringify(message.reactions ?? []),
          sentAt,
          importedAt: input.context.importedAt,
          metadataJson: JSON.stringify({ share: message.share })
        }
      })
    })
  ]
}

function mapInstagramLabeledContentInteraction(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  row: InstagramLabeledRecord
  index: number
  bucketId: string
  interactionKind: 'like' | 'save'
  platformInteractionKind: string
}): StagedSocialRecord[] {
  const labels = labelMap(input.row)
  const url = labels.href ?? labels.url
  const contentKey = input.row.fbid ?? url ?? `${input.source.path}:${input.index}`
  const sourceRecordId = `${input.platformInteractionKind}:${contentKey}:${input.index}`
  const sourceRecord = createSourceRecord({
    ...sourceBase(input, input.bucketId, sourceRecordId, input.row, 'interaction', 'public')
  })
  const contentId = createSocialNodeId('content', [
    'instagram',
    input.platformInteractionKind,
    contentKey
  ])
  const observedAt = secondsToIso(input.row.timestamp)
  const title = labels.title ?? labels.name ?? input.row.fbid

  return [
    sourceRecord,
    createStagedNode({
      kind: 'content',
      deterministicId: contentId,
      platform: 'instagram',
      bucketId: input.bucketId,
      source: input.source,
      sourceRecordId: sourceRecord.deterministicId,
      privacyClass: 'public',
      properties: {
        contentKind: input.platformInteractionKind.includes('comment') ? 'comment' : 'post',
        platformContentKind: input.platformInteractionKind,
        platformContentId: input.row.fbid ?? contentKey,
        canonicalUrl: url ? normalizeUrl(url) : undefined,
        platformUrl: url ? normalizeUrl(url) : undefined,
        title,
        textPreview: trimPreview(labels.description ?? title ?? ''),
        searchText: Object.values(labels).filter(Boolean).join('\n'),
        observedAt,
        importedAt: input.context.importedAt,
        confidence: input.row.fbid ? 0.9 : 0.7,
        metadataJson: JSON.stringify({ labels, media: input.row.media ?? [] })
      }
    }),
    createStagedNode({
      kind: 'interaction',
      deterministicId: createSocialNodeId('interaction', [
        'instagram',
        input.selfActorId,
        input.interactionKind,
        contentId,
        observedAt
      ]),
      platform: 'instagram',
      bucketId: input.bucketId,
      source: input.source,
      sourceRecordId: sourceRecord.deterministicId,
      privacyClass: 'public',
      properties: {
        interactionKind: input.interactionKind,
        platformInteractionKind: input.platformInteractionKind,
        actor: input.selfActorId,
        target: contentId,
        targetSchema: 'SocialContent',
        targetTitle: title,
        observedAt,
        importedAt: input.context.importedAt,
        confidence: 0.9
      }
    })
  ]
}

function sourceBase(
  input: {
    context: Pick<SocialImportContext, 'archiveId' | 'importRunId'>
    source: ArchiveEntryRef
  },
  bucketId: string,
  sourceRecordId: string,
  payload: unknown,
  sourceRecordKind: Parameters<typeof createSourceRecord>[0]['sourceRecordKind'],
  privacyClass: Parameters<typeof createSourceRecord>[0]['privacyClass']
): Parameters<typeof createSourceRecord>[0] {
  return {
    archiveId: input.context.archiveId,
    importRunId: input.context.importRunId,
    platform: 'instagram',
    bucketId,
    source: input.source,
    sourceRecordKind,
    sourceRecordId,
    payload,
    privacyClass
  }
}

function createInstagramBuckets(manifest: ArchiveManifest): ImportBucket[] {
  return bucketPatterns.flatMap((bucket) => {
    const entryPaths = manifest.entries
      .filter((entry) => bucket.pattern.test(entry.path))
      .map((entry) => entry.path)
      .sort()
    if (entryPaths.length === 0) return []
    const privacyClass = entryPaths.reduce<ReturnType<typeof classifySocialEntryPrivacy>>(
      (current, path) => (current === 'public' ? classifySocialEntryPrivacy(path) : current),
      'public'
    )

    return [
      {
        ...bucket,
        entryPaths,
        privacyClass,
        defaultSelected: getBucketDefaultSelected(privacyClass),
        ignoredReason: getBucketDefaultSelected(privacyClass)
          ? undefined
          : `Disabled by default because this bucket is ${privacyClass}.`
      }
    ]
  })
}

function hasInstagramSignals(manifest: ArchiveManifest): boolean {
  return manifest.entries.some((entry) =>
    /your_instagram_activity|followers_and_following/.test(entry.path)
  )
}

function resolveSelectedBuckets(
  buckets: readonly ImportBucket[],
  selection: ImportSelection
): ImportBucket[] {
  const selected = new Set(
    selection.buckets ??
      buckets.filter((bucket) => bucket.defaultSelected).map((bucket) => bucket.id)
  )
  return buckets.filter(
    (bucket) =>
      selected.has(bucket.id) &&
      (selection.includeSensitive || bucket.defaultSelected || bucket.privacyClass === 'public')
  )
}

function findEntry(manifest: ArchiveManifest, path: string): ArchiveEntryRef | undefined {
  return manifest.entries.find((entry) => entry.path === path)
}

function asRelationshipArray(input: unknown, key?: string): InstagramRelationshipRecord[] {
  if (key && isRecord(input) && Array.isArray(input[key]))
    return input[key] as InstagramRelationshipRecord[]
  return asArray<InstagramRelationshipRecord>(input)
}

function asLabeledArray(input: unknown): InstagramLabeledRecord[] {
  return asArray<InstagramLabeledRecord>(input)
}

function asArray<T>(input: unknown): T[] {
  return Array.isArray(input) ? (input as T[]) : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function labelMap(row: InstagramLabeledRecord): Record<string, string | undefined> {
  return Object.fromEntries(
    (row.label_values ?? []).flatMap((label) => {
      const key = normalizeHandle(label.label ?? 'value')
      return key ? [[key, label.href ?? label.value]] : []
    })
  )
}

function secondsToIso(timestamp?: number): string | undefined {
  return timestamp ? new Date(timestamp * 1000).toISOString() : undefined
}

function millisecondsToIso(timestamp?: number): string | undefined {
  return Number.isFinite(timestamp) && timestamp ? new Date(timestamp).toISOString() : undefined
}

function trimPreview(value: string): string {
  return value.length > 5000 ? `${value.slice(0, 4997)}...` : value
}

function detectTextWarnings(value: string): string[] {
  return /Ã|Â|â[€™€œ€“]/.test(value) ? ['possible mojibake encoding anomaly'] : []
}

function savedCollectionTitle(path: string): string {
  if (path.includes('saved_music')) return 'Instagram Saved Music'
  if (path.includes('saved_collections')) return 'Instagram Saved Collections'
  return 'Instagram Saved Posts'
}
