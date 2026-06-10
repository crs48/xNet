/**
 * X / Twitter archive importer.
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
import type { SocialPrivacyClass } from '../schemas'
import {
  createSocialNodeId,
  createSourceRecord,
  createStagedNode,
  normalizeHandle,
  normalizeUrl
} from '../import/core'

export const X_ADAPTER_ID = 'x'
export const X_ADAPTER_VERSION = '0.1.0'

type XBucketPattern = {
  id: string
  label: string
  pattern: RegExp
  description: string
  privacyClass: SocialPrivacyClass
}

type XAccountRecord = {
  account?: {
    accountId?: string
    username?: string
    accountDisplayName?: string
    createdAt?: string
    createdVia?: string
    email?: string
  }
}

type XProfileRecord = {
  profile?: {
    description?: {
      bio?: string
      website?: string
      location?: string
    }
    avatarMediaUrl?: string
    headerMediaUrl?: string
  }
}

type XRelationshipRecord = Partial<
  Record<
    'following' | 'follower' | 'blocking' | 'muting',
    {
      accountId?: string
      userLink?: string
    }
  >
>

type XUrlEntity = {
  url?: string
  expanded?: string
  expanded_url?: string
  display?: string
  display_url?: string
}

type XUserMentionEntity = {
  id?: string
  id_str?: string
  screen_name?: string
  name?: string
}

type XTweet = {
  id?: string
  id_str?: string
  full_text?: string
  created_at?: string
  favorite_count?: string
  retweet_count?: string
  retweeted?: boolean
  lang?: string
  source?: string
  in_reply_to_status_id_str?: string
  in_reply_to_user_id_str?: string
  community_id_str?: string
  possibly_sensitive?: boolean
  entities?: {
    urls?: XUrlEntity[]
    user_mentions?: XUserMentionEntity[]
    hashtags?: Array<{ text?: string }>
  }
  extended_entities?: unknown
}

type XTweetRecord = {
  tweet?: XTweet
  noteTweet?: {
    noteTweetId?: string
    createdAt?: string
    updatedAt?: string
    core?: {
      text?: string
      urls?: XUrlEntity[]
    }
    lifecycle?: { name?: string; originalName?: string }
  }
}

type XLikeRecord = {
  like?: {
    tweetId?: string
    fullText?: string
    expandedUrl?: string
  }
}

type XDmConversationRecord = {
  dmConversation?: {
    conversationId?: string
    messages?: XDmEvent[]
  }
}

type XDmEvent = {
  messageCreate?: {
    id?: string
    senderId?: string
    recipientId?: string
    createdAt?: string
    text?: string
    urls?: XUrlEntity[]
    mediaUrls?: string[]
    reactions?: unknown[]
    editHistory?: unknown[]
  }
  conversationNameUpdate?: {
    initiatingUserId?: string
    name?: string
    createdAt?: string
  }
  joinConversation?: {
    initiatingUserId?: string
    participantsSnapshot?: string[]
    createdAt?: string
  }
}

type XListRecord = {
  userListInfo?: {
    url?: string
  }
}

type XGrokChatItemRecord = {
  grokChatItem?: {
    accountId?: string
    chatId?: string
    createdAt?: string
    message?: string
    grokMode?: { name?: string; originalName?: string; value?: string }
    sender?: { name?: string; originalName?: string; value?: string }
  }
}

const bucketPatterns: XBucketPattern[] = [
  {
    id: 'x.profile',
    label: 'Profile',
    pattern: /^data\/(account|profile)\.js$/,
    description:
      'Self account and public profile data. Account email is not copied to canonical nodes.',
    privacyClass: 'private'
  },
  {
    id: 'x.following',
    label: 'Following',
    pattern: /^data\/following\.js$/,
    description: 'Outbound follow edges from the exported account.',
    privacyClass: 'public'
  },
  {
    id: 'x.followers',
    label: 'Followers',
    pattern: /^data\/follower\.js$/,
    description: 'Inbound follow edges to the exported account.',
    privacyClass: 'public'
  },
  {
    id: 'x.tweets',
    label: 'Tweets',
    pattern: /^data\/(tweets|community-tweet|note-tweet)\.js$/,
    description: 'Authored tweets, community tweets, replies, mentions, and long-form note tweets.',
    privacyClass: 'public'
  },
  {
    id: 'x.likes',
    label: 'Likes',
    pattern: /^data\/like\.js$/,
    description: 'Liked tweet placeholders and like interactions.',
    privacyClass: 'public'
  },
  {
    id: 'x.lists',
    label: 'Lists',
    pattern: /^data\/lists-(created|member|subscribed)\.js$/,
    description: 'Created, member, and subscribed X lists as social collections.',
    privacyClass: 'public'
  },
  {
    id: 'x.direct-messages',
    label: 'Direct Messages',
    pattern: /^data\/direct-messages(-group)?\.js$/,
    description: 'One-to-one and group direct message conversations.',
    privacyClass: 'third-party-private'
  },
  {
    id: 'x.grok-chat',
    label: 'Grok Chat',
    pattern: /^data\/grok-chat-item\.js$/,
    description: 'Grok chat transcripts embedded in the X archive.',
    privacyClass: 'private'
  },
  {
    id: 'x.blocks-mutes',
    label: 'Blocks And Mutes',
    pattern: /^data\/(block|mute)\.js$/,
    description: 'Blocked and muted accounts. Disabled by default.',
    privacyClass: 'private'
  },
  {
    id: 'x.ads-personalization',
    label: 'Ads And Personalization',
    pattern: /^data\/(ad-|ads-|personalization\.js)/,
    description: 'Ad engagements, impressions, and inferred personalization data.',
    privacyClass: 'ads'
  },
  {
    id: 'x.account-metadata',
    label: 'Account Metadata',
    pattern:
      /^data\/(account-creation-ip|account-label|account-suspension|account-timezone|ageinfo|app|connected-application|contact|device-token|email-address-change|expanded-profile|ip-audit|key-registry|phone-number|protected-history|screen-name-change|sso|tweetdeck|verified|verified-organization)\.js$/,
    description: 'Security, device, contact, and account metadata. Disabled by default.',
    privacyClass: 'account-security'
  }
]

export const xAdapter: SocialImportAdapter = {
  id: X_ADAPTER_ID,
  version: X_ADAPTER_VERSION,
  platform: 'x',
  detect: (manifest) => (hasXArchiveSignals(manifest) ? 0.95 : 0),
  probe: ({ manifest }) => ({
    adapterId: X_ADAPTER_ID,
    adapterVersion: X_ADAPTER_VERSION,
    platform: 'x',
    confidence: hasXArchiveSignals(manifest) ? 0.95 : 0,
    buckets: createXBuckets(manifest),
    warnings: []
  }),
  stage: stageXArchive
}

export async function* stageXArchive(
  context: SocialImportContext,
  selection: ImportSelection = {}
): AsyncIterable<StagedSocialRecord> {
  const selectedBuckets = resolveSelectedBuckets(createXBuckets(context.manifest), selection)
  const readTextEntry = requireTextEntry(context)
  const accountRecords = await readArchiveArray<XAccountRecord>(context, 'data/account.js')
  const selfAccount = accountRecords[0]?.account
  const selfActorId = createSocialNodeId('actor', [
    'x',
    'self',
    context.observedBy ?? selfAccount?.accountId ?? context.archiveId
  ])
  const selfHandle = selfAccount?.username ? normalizeHandle(selfAccount.username) : undefined
  const selfAccountId = selfAccount?.accountId

  for (const bucket of selectedBuckets) {
    if (bucket.id === 'x.profile') {
      const profileRecords = await readOptionalArchiveArray<XProfileRecord>(
        context,
        'data/profile.js'
      )
      const source = findFirstEntry(context.manifest, ['data/account.js', 'data/profile.js'])
      if (source) {
        yield* mapXProfile({
          context,
          source,
          selfActorId,
          accountRecords,
          profileRecords
        })
      }
      continue
    }

    for (const path of bucket.entryPaths) {
      const source = findEntry(context.manifest, path)
      if (!source) continue

      if (bucket.id === 'x.following') {
        yield* mapXRelationships({
          context,
          source,
          selfActorId,
          records: await readArchiveArray<XRelationshipRecord>(context, path),
          relationshipKey: 'following'
        })
      } else if (bucket.id === 'x.followers') {
        yield* mapXRelationships({
          context,
          source,
          selfActorId,
          records: await readArchiveArray<XRelationshipRecord>(context, path),
          relationshipKey: 'follower'
        })
      } else if (bucket.id === 'x.tweets') {
        yield* mapXTweets({
          context,
          source,
          selfActorId,
          selfHandle,
          records: await readArchiveArray<XTweetRecord>(context, path),
          bucketId: bucket.id,
          platformContentKind: path.includes('note-tweet')
            ? 'note_tweet'
            : path.includes('community-tweet')
              ? 'community_tweet'
              : 'tweet'
        })
      } else if (bucket.id === 'x.likes') {
        yield* mapXLikes({
          context,
          source,
          selfActorId,
          records: await readArchiveArray<XLikeRecord>(context, path)
        })
      } else if (bucket.id === 'x.lists') {
        yield* mapXLists({
          context,
          source,
          selfActorId,
          records: await readArchiveArray<XListRecord>(context, path),
          listKind: path.includes('lists-created')
            ? 'created'
            : path.includes('lists-member')
              ? 'member'
              : 'subscribed'
        })
      } else if (bucket.id === 'x.direct-messages') {
        yield* mapXDirectMessages({
          context,
          source,
          selfActorId,
          selfAccountId,
          records: await readArchiveArray<XDmConversationRecord>(context, path),
          group: path.includes('direct-messages-group')
        })
      } else if (bucket.id === 'x.grok-chat') {
        yield* mapXGrokChatItems({
          context,
          source,
          selfActorId,
          records: await readArchiveArray<XGrokChatItemRecord>(context, path)
        })
      } else if (bucket.id === 'x.blocks-mutes') {
        yield* mapXRelationships({
          context,
          source,
          selfActorId,
          records: await readArchiveArray<XRelationshipRecord>(context, path),
          relationshipKey: path.includes('block') ? 'blocking' : 'muting'
        })
      } else if (bucket.id === 'x.ads-personalization') {
        yield createMetadataSourceRecord({
          context,
          source,
          bucketId: bucket.id,
          sourceRecordId: `ads:${path}`,
          payload: parseTwitterArchiveJs(await readTextEntry(path)),
          privacyClass: 'ads'
        })
      } else if (bucket.id === 'x.account-metadata') {
        yield createMetadataSourceRecord({
          context,
          source,
          bucketId: bucket.id,
          sourceRecordId: `account-metadata:${path}`,
          payload: parseTwitterArchiveJs(await readTextEntry(path)),
          privacyClass: 'account-security'
        })
      }
    }
  }
}

export function parseTwitterArchiveJs<T = unknown>(text: string): T {
  const equalsIndex = text.indexOf('=')
  const payload = (equalsIndex >= 0 ? text.slice(equalsIndex + 1) : text)
    .trim()
    .replace(/;?\s*$/, '')
  return JSON.parse(payload) as T
}

export function mapXProfile(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  accountRecords: readonly XAccountRecord[]
  profileRecords: readonly XProfileRecord[]
}): StagedSocialRecord[] {
  const account = input.accountRecords[0]?.account ?? {}
  const profile = input.profileRecords[0]?.profile ?? {}
  const handle = account.username ? normalizeHandle(account.username) : undefined
  const sourceRecord = createSourceRecord({
    ...sourceBase(
      input,
      'x.profile',
      `profile:${account.accountId ?? handle ?? 'self'}`,
      {
        account,
        profile
      },
      'actor',
      'private'
    )
  })

  return [
    sourceRecord,
    createStagedNode({
      kind: 'actor',
      deterministicId: input.selfActorId,
      platform: 'x',
      bucketId: 'x.profile',
      source: input.source,
      sourceRecordId: sourceRecord.deterministicId,
      privacyClass: 'private',
      properties: {
        actorKind: 'account',
        platformActorId: account.accountId,
        handle,
        displayName: account.accountDisplayName ?? handle,
        profileUrl: handle ? `https://x.com/${encodeURIComponent(handle)}` : undefined,
        observedBy: input.context.observedBy,
        observedAt: input.context.importedAt,
        isSelf: true,
        metadataJson: JSON.stringify({
          createdAt: account.createdAt,
          createdVia: account.createdVia,
          description: profile.description,
          avatarMediaUrl: profile.avatarMediaUrl,
          headerMediaUrl: profile.headerMediaUrl
        })
      }
    })
  ]
}

export function mapXRelationships(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  records: readonly XRelationshipRecord[]
  relationshipKey: 'following' | 'follower' | 'blocking' | 'muting'
}): StagedSocialRecord[] {
  const bucketId = relationshipBucketId(input.relationshipKey)
  const privacyClass = relationshipPrivacyClass(input.relationshipKey)
  return input.records.flatMap((record, index) => {
    const relationship = record[input.relationshipKey]
    const accountId = relationship?.accountId
    if (!accountId) return []

    const actorId = createXAccountActorId(accountId)
    const sourceRecord = createSourceRecord({
      ...sourceBase(
        input,
        bucketId,
        `${input.relationshipKey}:${accountId}:${index}`,
        relationship,
        'actor',
        privacyClass
      )
    })
    const outgoing = input.relationshipKey === 'following'
    const interactionKind =
      input.relationshipKey === 'following' || input.relationshipKey === 'follower'
        ? 'follow'
        : 'unknown'

    return [
      sourceRecord,
      createXAccountActor({
        input,
        sourceRecordId: sourceRecord.deterministicId,
        actorId,
        accountId,
        profileUrl: relationship.userLink,
        bucketId,
        privacyClass
      }),
      createStagedNode({
        kind: 'interaction',
        deterministicId: createSocialNodeId('interaction', [
          'x',
          input.relationshipKey,
          input.selfActorId,
          actorId
        ]),
        platform: 'x',
        bucketId,
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass,
        properties: {
          interactionKind,
          platformInteractionKind: input.relationshipKey,
          actor: outgoing ? input.selfActorId : actorId,
          target: outgoing ? actorId : input.selfActorId,
          targetSchema: 'SocialActor',
          targetTitle: accountId,
          observedAt: input.context.importedAt,
          importedAt: input.context.importedAt,
          confidence: 0.9
        }
      })
    ]
  })
}

export function mapXTweets(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  selfHandle?: string
  records: readonly XTweetRecord[]
  bucketId?: string
  platformContentKind?: string
}): StagedSocialRecord[] {
  const bucketId = input.bucketId ?? 'x.tweets'
  const platformContentKind = input.platformContentKind ?? 'tweet'

  return input.records.flatMap((record, index) => {
    const tweet = normalizeTweetRecord(record)
    if (!tweet) return []

    const tweetId = tweet.id_str ?? tweet.id ?? `${input.source.path}:${index}`
    const publishedAt = isoOrUndefined(tweet.created_at)
    const contentId = createXTweetContentId(tweetId)
    const sourceRecord = createSourceRecord({
      ...sourceBase(input, bucketId, `tweet:${tweetId}:${index}`, tweet, 'content', 'public')
    })
    const text = tweet.full_text ?? ''
    const contentRecords: StagedSocialRecord[] = [
      sourceRecord,
      createStagedNode({
        kind: 'content',
        deterministicId: contentId,
        platform: 'x',
        bucketId,
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'public',
        properties: {
          contentKind: tweet.in_reply_to_status_id_str ? 'reply' : 'post',
          platformContentKind,
          platformContentId: tweetId,
          canonicalUrl: tweetUrl(tweetId, input.selfHandle),
          platformUrl: tweetUrl(tweetId, input.selfHandle),
          authorActor: input.selfActorId,
          actorHandle: input.selfHandle,
          title: trimPreview(text, 120),
          textPreview: trimPreview(text),
          searchText: tweetSearchText(tweet),
          language: tweet.lang,
          parentContent: tweet.in_reply_to_status_id_str
            ? createXTweetContentId(tweet.in_reply_to_status_id_str)
            : undefined,
          publishedAt,
          observedAt: input.context.importedAt,
          importedAt: input.context.importedAt,
          confidence: tweet.id_str || tweet.id ? 0.95 : 0.7,
          metadataJson: JSON.stringify({
            favoriteCount: toNumber(tweet.favorite_count),
            retweetCount: toNumber(tweet.retweet_count),
            retweeted: tweet.retweeted,
            source: tweet.source,
            communityId: tweet.community_id_str,
            possiblySensitive: tweet.possibly_sensitive,
            hashtags: tweet.entities?.hashtags ?? [],
            urls: normalizeUrlEntities(tweet.entities?.urls)
          })
        }
      })
    ]

    if (tweet.in_reply_to_status_id_str) {
      contentRecords.push(
        createTweetPlaceholder({
          input,
          sourceRecordId: sourceRecord.deterministicId,
          tweetId: tweet.in_reply_to_status_id_str,
          bucketId
        }),
        createStagedNode({
          kind: 'interaction',
          deterministicId: createSocialNodeId('interaction', [
            'x',
            'reply',
            contentId,
            tweet.in_reply_to_status_id_str
          ]),
          platform: 'x',
          bucketId,
          source: input.source,
          sourceRecordId: sourceRecord.deterministicId,
          privacyClass: 'public',
          properties: {
            interactionKind: 'comment',
            platformInteractionKind: 'reply',
            actor: input.selfActorId,
            target: createXTweetContentId(tweet.in_reply_to_status_id_str),
            targetSchema: 'SocialContent',
            targetTitle: tweet.in_reply_to_status_id_str,
            publishedAt,
            importedAt: input.context.importedAt,
            confidence: 0.8
          }
        })
      )
    }

    for (const mention of tweet.entities?.user_mentions ?? []) {
      const mentionActorId = createMentionActorId(mention)
      const screenName = mention.screen_name ? normalizeHandle(mention.screen_name) : undefined
      contentRecords.push(
        createStagedNode({
          kind: 'actor',
          deterministicId: mentionActorId,
          platform: 'x',
          bucketId,
          source: input.source,
          sourceRecordId: sourceRecord.deterministicId,
          privacyClass: 'public',
          properties: {
            actorKind: 'account',
            platformActorId: mention.id_str ?? mention.id,
            handle: screenName,
            displayName: mention.name ?? screenName,
            profileUrl: screenName ? `https://x.com/${encodeURIComponent(screenName)}` : undefined,
            observedAt: input.context.importedAt,
            confidence: mention.id_str || mention.id ? 0.9 : 0.7
          }
        }),
        createStagedNode({
          kind: 'interaction',
          deterministicId: createSocialNodeId('interaction', [
            'x',
            'mention',
            contentId,
            mentionActorId
          ]),
          platform: 'x',
          bucketId,
          source: input.source,
          sourceRecordId: sourceRecord.deterministicId,
          privacyClass: 'public',
          properties: {
            interactionKind: 'mention',
            platformInteractionKind: 'tweet_mention',
            actor: input.selfActorId,
            target: mentionActorId,
            targetSchema: 'SocialActor',
            targetTitle: mention.name ?? screenName,
            publishedAt,
            importedAt: input.context.importedAt,
            confidence: 0.85
          }
        })
      )
    }

    return contentRecords
  })
}

export function mapXLikes(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  records: readonly XLikeRecord[]
}): StagedSocialRecord[] {
  return input.records.flatMap((record, index) => {
    const like = record.like
    const tweetId = like?.tweetId
    if (!tweetId) return []

    const contentId = createXTweetContentId(tweetId)
    const sourceRecord = createSourceRecord({
      ...sourceBase(input, 'x.likes', `like:${tweetId}:${index}`, like, 'interaction', 'public')
    })

    return [
      sourceRecord,
      createStagedNode({
        kind: 'content',
        deterministicId: contentId,
        platform: 'x',
        bucketId: 'x.likes',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'public',
        properties: {
          contentKind: 'post',
          platformContentKind: 'tweet',
          platformContentId: tweetId,
          canonicalUrl: like.expandedUrl ? normalizeUrl(like.expandedUrl) : tweetUrl(tweetId),
          platformUrl: like.expandedUrl ? normalizeUrl(like.expandedUrl) : tweetUrl(tweetId),
          title: trimPreview(like.fullText ?? '', 120),
          textPreview: trimPreview(like.fullText ?? ''),
          searchText: like.fullText,
          observedAt: input.context.importedAt,
          importedAt: input.context.importedAt,
          confidence: 0.85
        }
      }),
      createStagedNode({
        kind: 'interaction',
        deterministicId: createSocialNodeId('interaction', [
          'x',
          'like',
          input.selfActorId,
          contentId
        ]),
        platform: 'x',
        bucketId: 'x.likes',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'public',
        properties: {
          interactionKind: 'like',
          platformInteractionKind: 'like',
          actor: input.selfActorId,
          target: contentId,
          targetSchema: 'SocialContent',
          targetTitle: tweetId,
          observedAt: input.context.importedAt,
          importedAt: input.context.importedAt,
          confidence: 0.9
        }
      })
    ]
  })
}

export function mapXDirectMessages(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  selfAccountId?: string
  records: readonly XDmConversationRecord[]
  group?: boolean
}): StagedSocialRecord[] {
  return input.records.flatMap((record, index) => {
    const conversation = record.dmConversation
    const conversationId = conversation?.conversationId
    if (!conversationId) return []

    const messageCreates = (conversation.messages ?? []).flatMap((message) =>
      message.messageCreate ? [message.messageCreate] : []
    )
    const participantIds = collectDmParticipantIds(conversation.messages ?? [], input.selfAccountId)
    const participantActorIds = participantIds.map((participantId) =>
      participantId === input.selfAccountId
        ? input.selfActorId
        : createXAccountActorId(participantId)
    )
    const sourceRecord = createSourceRecord({
      ...sourceBase(
        input,
        'x.direct-messages',
        `conversation:${conversationId}:${index}`,
        conversation,
        'conversation',
        'third-party-private'
      )
    })
    const stagedConversationId = createSocialNodeId('conversation', [
      'x',
      input.group ? 'group-dm' : 'dm',
      conversationId
    ])
    const dates = messageCreates
      .map((message) => isoOrUndefined(message.createdAt))
      .filter((value): value is string => Boolean(value))
      .sort()
    const conversationRecords: StagedSocialRecord[] = [
      sourceRecord,
      ...participantIds
        .filter((participantId) => participantId !== input.selfAccountId)
        .map((participantId) =>
          createXAccountActor({
            input,
            sourceRecordId: sourceRecord.deterministicId,
            actorId: createXAccountActorId(participantId),
            accountId: participantId,
            bucketId: 'x.direct-messages',
            privacyClass: 'third-party-private'
          })
        ),
      createStagedNode({
        kind: 'conversation',
        deterministicId: stagedConversationId,
        platform: 'x',
        bucketId: 'x.direct-messages',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'third-party-private',
        properties: {
          conversationKind: input.group ? 'group-dm' : 'dm',
          platformConversationId: conversationId,
          title: input.group ? `X Group DM ${conversationId}` : `X DM ${conversationId}`,
          participantActorIdsJson: JSON.stringify(participantActorIds),
          startedAt: dates[0],
          lastMessageAt: dates.at(-1),
          messageCount: messageCreates.length,
          sourceArchive: input.context.archiveId,
          metadataJson: JSON.stringify({
            participantIds,
            group: Boolean(input.group)
          })
        }
      })
    ]

    for (const message of messageCreates) {
      const senderActor =
        message.senderId === input.selfAccountId
          ? input.selfActorId
          : message.senderId
            ? createXAccountActorId(message.senderId)
            : undefined
      conversationRecords.push(
        createStagedNode({
          kind: 'message',
          deterministicId: createSocialNodeId('message', [
            'x',
            conversationId,
            message.id ?? message.createdAt ?? message.text
          ]),
          platform: 'x',
          bucketId: 'x.direct-messages',
          source: input.source,
          sourceRecordId: sourceRecord.deterministicId,
          privacyClass: 'third-party-private',
          properties: {
            messageKind: 'message',
            platformMessageId: message.id,
            conversation: stagedConversationId,
            senderActor,
            senderHandle: message.senderId,
            textPreview: trimPreview(message.text ?? ''),
            searchText: message.text,
            attachmentRefsJson: JSON.stringify(message.mediaUrls ?? []),
            externalRefsJson: JSON.stringify(normalizeUrlEntities(message.urls)),
            reactionSummaryJson: JSON.stringify(message.reactions ?? []),
            sentAt: isoOrUndefined(message.createdAt),
            importedAt: input.context.importedAt,
            metadataJson: JSON.stringify({
              recipientId: message.recipientId,
              editHistory: message.editHistory ?? []
            })
          }
        })
      )
    }

    return conversationRecords
  })
}

export function mapXLists(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  records: readonly XListRecord[]
  listKind: 'created' | 'member' | 'subscribed'
}): StagedSocialRecord[] {
  return input.records.flatMap((record, index) => {
    const url = record.userListInfo?.url
    if (!url) return []

    const listInfo = parseXListUrl(url)
    const collectionId = createSocialNodeId('collection', ['x', 'list', listInfo.id ?? url])
    const sourceRecord = createSourceRecord({
      ...sourceBase(
        input,
        'x.lists',
        `list:${input.listKind}:${listInfo.id ?? url}:${index}`,
        record.userListInfo,
        'collection',
        'public'
      )
    })

    return [
      sourceRecord,
      createStagedNode({
        kind: 'collection',
        deterministicId: collectionId,
        platform: 'x',
        bucketId: 'x.lists',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'public',
        properties: {
          collectionKind: 'list',
          platformCollectionId: listInfo.id,
          title: listInfo.title,
          ownerActor: listInfo.ownerHandle
            ? createSocialNodeId('actor', ['x', 'handle', listInfo.ownerHandle])
            : undefined,
          canonicalUrl: normalizeUrl(url),
          itemCount: undefined,
          observedAt: input.context.importedAt,
          metadataJson: JSON.stringify({
            listKind: input.listKind,
            ownerHandle: listInfo.ownerHandle
          })
        }
      }),
      createStagedNode({
        kind: 'interaction',
        deterministicId: createSocialNodeId('interaction', [
          'x',
          'list',
          input.listKind,
          input.selfActorId,
          collectionId
        ]),
        platform: 'x',
        bucketId: 'x.lists',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'public',
        properties: {
          interactionKind: input.listKind === 'subscribed' ? 'membership' : 'unknown',
          platformInteractionKind: `list_${input.listKind}`,
          actor: input.selfActorId,
          target: collectionId,
          targetSchema: 'SocialCollection',
          targetTitle: listInfo.title,
          observedAt: input.context.importedAt,
          importedAt: input.context.importedAt,
          confidence: 0.8
        }
      })
    ]
  })
}

export function mapXGrokChatItems(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  records: readonly XGrokChatItemRecord[]
}): StagedSocialRecord[] {
  const assistantActorId = createSocialNodeId('actor', ['x', 'grok', 'assistant'])
  return Object.entries(
    groupBy(input.records, (record) => record.grokChatItem?.chatId ?? 'unknown')
  )
    .filter(([chatId]) => chatId !== 'unknown')
    .flatMap(([chatId, records]) => {
      const items = records.flatMap((record) => (record.grokChatItem ? [record.grokChatItem] : []))
      const sourceRecord = createSourceRecord({
        ...sourceBase(input, 'x.grok-chat', `grok-chat:${chatId}`, items, 'conversation', 'private')
      })
      const conversationId = createSocialNodeId('conversation', ['x', 'grok-chat', chatId])
      const dates = items
        .map((item) => isoOrUndefined(item.createdAt))
        .filter((value): value is string => Boolean(value))
        .sort()
      const title = trimPreview(
        items.find((item) => isUserGrokSender(item.sender))?.message ?? '',
        120
      )
      const output: StagedSocialRecord[] = [
        sourceRecord,
        createStagedNode({
          kind: 'actor',
          deterministicId: assistantActorId,
          platform: 'x',
          bucketId: 'x.grok-chat',
          source: input.source,
          sourceRecordId: sourceRecord.deterministicId,
          privacyClass: 'private',
          properties: {
            actorKind: 'ai-assistant',
            displayName: 'Grok',
            observedAt: input.context.importedAt,
            confidence: 0.9
          }
        }),
        createStagedNode({
          kind: 'conversation',
          deterministicId: conversationId,
          platform: 'x',
          bucketId: 'x.grok-chat',
          source: input.source,
          sourceRecordId: sourceRecord.deterministicId,
          privacyClass: 'private',
          properties: {
            conversationKind: 'ai-chat',
            platformConversationId: chatId,
            title: title || `Grok Chat ${chatId}`,
            participantActorIdsJson: JSON.stringify([input.selfActorId, assistantActorId]),
            startedAt: dates[0],
            lastMessageAt: dates.at(-1),
            messageCount: items.length,
            sourceArchive: input.context.archiveId,
            metadataJson: JSON.stringify({
              modes: [...new Set(items.map((item) => item.grokMode?.name))]
            })
          }
        })
      ]

      for (const [index, item] of items.entries()) {
        const userSender = isUserGrokSender(item.sender)
        output.push(
          createStagedNode({
            kind: 'message',
            deterministicId: createSocialNodeId('message', [
              'x',
              'grok-chat',
              chatId,
              index,
              item.createdAt,
              item.sender?.originalName
            ]),
            platform: 'x',
            bucketId: 'x.grok-chat',
            source: input.source,
            sourceRecordId: sourceRecord.deterministicId,
            privacyClass: 'private',
            properties: {
              messageKind: userSender ? 'prompt' : 'ai-response',
              platformMessageId: `${chatId}:${index}`,
              conversation: conversationId,
              senderActor: userSender ? input.selfActorId : assistantActorId,
              senderHandle: item.sender?.name,
              model: item.grokMode?.name,
              textPreview: trimPreview(item.message ?? ''),
              searchText: item.message,
              sentAt: isoOrUndefined(item.createdAt),
              importedAt: input.context.importedAt,
              metadataJson: JSON.stringify({
                accountId: item.accountId,
                sender: item.sender,
                grokMode: item.grokMode
              })
            }
          })
        )
      }

      return output
    })
}

function createMetadataSourceRecord(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId'>
  source: ArchiveEntryRef
  bucketId: string
  sourceRecordId: string
  payload: unknown
  privacyClass: SocialPrivacyClass
}): StagedSocialRecord {
  return createSourceRecord({
    ...sourceBase(
      input,
      input.bucketId,
      input.sourceRecordId,
      input.payload,
      'account-metadata',
      input.privacyClass
    )
  })
}

function createXAccountActor(input: {
  input: {
    context: Pick<SocialImportContext, 'observedBy' | 'importedAt'>
    source: ArchiveEntryRef
  }
  sourceRecordId: string
  actorId: string
  accountId: string
  profileUrl?: string
  bucketId: string
  privacyClass: SocialPrivacyClass
}): StagedSocialRecord {
  return createStagedNode({
    kind: 'actor',
    deterministicId: input.actorId,
    platform: 'x',
    bucketId: input.bucketId,
    source: input.input.source,
    sourceRecordId: input.sourceRecordId,
    privacyClass: input.privacyClass,
    properties: {
      actorKind: 'account',
      platformActorId: input.accountId,
      displayName: input.accountId,
      profileUrl: input.profileUrl ? normalizeUrl(input.profileUrl) : undefined,
      observedBy: input.input.context.observedBy,
      observedAt: input.input.context.importedAt,
      confidence: 0.75
    }
  })
}

function createTweetPlaceholder(input: {
  input: {
    context: Pick<SocialImportContext, 'importedAt'>
    source: ArchiveEntryRef
  }
  sourceRecordId: string
  tweetId: string
  bucketId: string
}): StagedSocialRecord {
  return createStagedNode({
    kind: 'content',
    deterministicId: createXTweetContentId(input.tweetId),
    platform: 'x',
    bucketId: input.bucketId,
    source: input.input.source,
    sourceRecordId: input.sourceRecordId,
    privacyClass: 'public',
    properties: {
      contentKind: 'post',
      platformContentKind: 'tweet',
      platformContentId: input.tweetId,
      canonicalUrl: tweetUrl(input.tweetId),
      platformUrl: tweetUrl(input.tweetId),
      title: input.tweetId,
      observedAt: input.input.context.importedAt,
      importedAt: input.input.context.importedAt,
      confidence: 0.45
    }
  })
}

function normalizeTweetRecord(record: XTweetRecord): XTweet | undefined {
  if (record.tweet) return record.tweet
  if (!record.noteTweet) return undefined
  return {
    id: record.noteTweet.noteTweetId,
    id_str: record.noteTweet.noteTweetId,
    full_text: record.noteTweet.core?.text,
    created_at: record.noteTweet.createdAt,
    entities: { urls: record.noteTweet.core?.urls ?? [] }
  }
}

function createXBuckets(manifest: ArchiveManifest): ImportBucket[] {
  return bucketPatterns.flatMap((bucket) => {
    const entryPaths = manifest.entries
      .filter((entry) => bucket.pattern.test(entry.path))
      .map((entry) => entry.path)
      .sort()
    if (entryPaths.length === 0) return []

    return [
      {
        id: bucket.id,
        label: bucket.label,
        description: bucket.description,
        entryPaths,
        privacyClass: bucket.privacyClass,
        defaultSelected: bucket.privacyClass === 'public',
        ignoredReason:
          bucket.privacyClass === 'public'
            ? undefined
            : `Disabled by default because this bucket is ${bucket.privacyClass}.`
      }
    ]
  })
}

function hasXArchiveSignals(manifest: ArchiveManifest): boolean {
  const paths = new Set(manifest.entries.map((entry) => entry.path))
  return (
    paths.has('data/manifest.js') &&
    (paths.has('data/account.js') ||
      paths.has('data/tweets.js') ||
      paths.has('data/following.js') ||
      paths.has('data/follower.js'))
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

async function readArchiveArray<T>(context: SocialImportContext, path: string): Promise<T[]> {
  const source = findEntry(context.manifest, path)
  if (!source) return []
  return parseTwitterArchiveJs<T[]>(await requireTextEntry(context)(path))
}

async function readOptionalArchiveArray<T>(
  context: SocialImportContext,
  path: string
): Promise<T[]> {
  return readArchiveArray<T>(context, path)
}

function requireTextEntry(context: SocialImportContext): (path: string) => Promise<string> {
  if (!context.readTextEntry) {
    throw new Error('X imports require readTextEntry for Twitter archive JavaScript files')
  }
  return context.readTextEntry
}

function findEntry(manifest: ArchiveManifest, path: string): ArchiveEntryRef | undefined {
  return manifest.entries.find((entry) => entry.path === path)
}

function findFirstEntry(
  manifest: ArchiveManifest,
  paths: readonly string[]
): ArchiveEntryRef | undefined {
  return paths.flatMap((path) => findEntry(manifest, path) ?? []).at(0)
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
    platform: 'x',
    bucketId,
    source: input.source,
    sourceRecordKind,
    sourceRecordId,
    payload,
    privacyClass
  }
}

function relationshipBucketId(
  relationshipKey: 'following' | 'follower' | 'blocking' | 'muting'
): string {
  if (relationshipKey === 'following') return 'x.following'
  if (relationshipKey === 'follower') return 'x.followers'
  return 'x.blocks-mutes'
}

function relationshipPrivacyClass(
  relationshipKey: 'following' | 'follower' | 'blocking' | 'muting'
): SocialPrivacyClass {
  return relationshipKey === 'blocking' || relationshipKey === 'muting' ? 'private' : 'public'
}

function createXAccountActorId(accountId: string): string {
  return createSocialNodeId('actor', ['x', 'account', accountId])
}

function createXTweetContentId(tweetId: string): string {
  return createSocialNodeId('content', ['x', 'tweet', tweetId])
}

function createMentionActorId(mention: XUserMentionEntity): string {
  return mention.id_str || mention.id
    ? createXAccountActorId(mention.id_str ?? mention.id ?? '')
    : createSocialNodeId('actor', ['x', 'handle', normalizeHandle(mention.screen_name ?? '')])
}

function tweetUrl(tweetId: string, handle?: string): string {
  return handle
    ? `https://x.com/${encodeURIComponent(handle)}/status/${encodeURIComponent(tweetId)}`
    : `https://x.com/i/web/status/${encodeURIComponent(tweetId)}`
}

function tweetSearchText(tweet: XTweet): string {
  return [
    tweet.full_text,
    ...(tweet.entities?.urls ?? []).flatMap((url) => [
      url.expanded_url,
      url.expanded,
      url.display_url,
      url.display
    ]),
    ...(tweet.entities?.user_mentions ?? []).flatMap((mention) => [
      mention.screen_name,
      mention.name
    ]),
    ...(tweet.entities?.hashtags ?? []).flatMap((hashtag) => hashtag.text)
  ]
    .filter(Boolean)
    .join('\n')
}

function normalizeUrlEntities(values?: readonly XUrlEntity[]): Array<Record<string, string>> {
  return (values ?? []).map((value) => ({
    url: value.url ? normalizeUrl(value.url) : '',
    expanded:
      value.expanded_url || value.expanded
        ? normalizeUrl(value.expanded_url ?? value.expanded ?? '')
        : '',
    display: value.display_url ?? value.display ?? ''
  }))
}

function collectDmParticipantIds(messages: readonly XDmEvent[], selfAccountId?: string): string[] {
  const participants = new Set<string>()
  if (selfAccountId) participants.add(selfAccountId)

  for (const message of messages) {
    if (message.messageCreate?.senderId) participants.add(message.messageCreate.senderId)
    if (message.messageCreate?.recipientId) participants.add(message.messageCreate.recipientId)
    if (message.conversationNameUpdate?.initiatingUserId)
      participants.add(message.conversationNameUpdate.initiatingUserId)
    if (message.joinConversation?.initiatingUserId)
      participants.add(message.joinConversation.initiatingUserId)
    for (const participant of message.joinConversation?.participantsSnapshot ?? []) {
      participants.add(participant)
    }
  }

  return [...participants].sort()
}

function parseXListUrl(value: string): { id?: string; ownerHandle?: string; title: string } {
  try {
    const url = new URL(value)
    const parts = url.pathname.split('/').filter(Boolean)
    const listIndex = parts.indexOf('lists')
    const ownerHandle = parts[0] ? normalizeHandle(parts[0]) : undefined
    const id = listIndex >= 0 ? parts[listIndex + 1] : undefined
    return {
      id,
      ownerHandle,
      title: [ownerHandle, id].filter(Boolean).join('/') || value
    }
  } catch {
    return { title: value }
  }
}

function isUserGrokSender(sender?: { name?: string; originalName?: string }): boolean {
  return [sender?.name, sender?.originalName].some((value) => value?.toLowerCase() === 'user')
}

function groupBy<T>(items: readonly T[], keyFn: (item: T) => string): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((groups, item) => {
    const key = keyFn(item)
    return { ...groups, [key]: [...(groups[key] ?? []), item] }
  }, {})
}

function isoOrUndefined(value?: string): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function toNumber(value?: string): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function trimPreview(value: string, maxLength = 5000): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value
}
