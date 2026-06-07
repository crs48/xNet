/**
 * TikTok user data export importer.
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
import type { SocialInteractionKind, SocialPrivacyClass } from '../schemas'
import {
  createSocialNodeId,
  createSourceRecord,
  createStagedNode,
  normalizeHandle,
  normalizeUrl
} from '../import/core'

export const TIKTOK_ADAPTER_ID = 'tiktok'
export const TIKTOK_ADAPTER_VERSION = '0.1.0'

type TikTokBucketDefinition = {
  id: string
  label: string
  description: string
  privacyClass: SocialPrivacyClass
}

type TikTokExport = {
  Comment?: {
    Comments?: {
      CommentsList?: TikTokCommentRecord[]
    }
  }
  'Direct Message'?: {
    'Direct Messages'?: {
      ChatHistory?: Record<string, TikTokDirectMessageRecord[]>
    }
    'Group Chat'?: unknown
    'Tako Chat History'?: unknown
  }
  'Income+ Wallet'?: unknown
  'Likes and Favorites'?: {
    'Favorite Collection'?: {
      FavoriteCollectionList?: TikTokFavoriteCollectionRecord[]
    }
    'Favorite Hashtags'?: {
      FavoriteHashtagList?: TikTokHashtagRecord[]
    }
    'Favorite Playlists'?: {
      FavoritePlaylistList?: TikTokLinkRecord[]
    }
    'Favorite Sounds'?: {
      FavoriteSoundList?: TikTokLinkRecord[]
    }
    'Favorite Videos'?: {
      FavoriteVideoList?: TikTokLinkRecord[]
    }
    'Like List'?: {
      ItemFavoriteList?: TikTokLinkRecord[]
    }
  }
  Post?: {
    Posts?: {
      VideoList?: unknown
    }
    'Recently Deleted Posts'?: {
      PostList?: unknown
    }
    Story?: unknown
  }
  'Profile And Settings'?: {
    'Block List'?: {
      BlockList?: TikTokUserRecord[]
    }
    Follower?: {
      FansList?: TikTokUserRecord[]
    }
    Following?: {
      Following?: TikTokUserRecord[]
    }
    'Off TikTok Activity'?: unknown
    'Profile Info'?: {
      ProfileMap?: TikTokProfileMap
    }
    Settings?: unknown
    Autofill?: unknown
    'AI-Moji'?: unknown
    AISelfImage?: unknown
    ProfileViews?: unknown
  }
  'TikTok Live'?: unknown
  'TikTok Shop'?: unknown
  'Your Activity'?: {
    'Ad Interests'?: unknown
    'Ads Visit History'?: unknown
    'Instant Form Ads Responses'?: unknown
    Hashtag?: {
      HashtagList?: TikTokHashtagRecord[]
    }
    'Login History'?: unknown
    Reposts?: unknown
    Searches?: {
      SearchList?: TikTokSearchRecord[]
    }
    'Share History'?: {
      ShareHistoryList?: TikTokShareRecord[]
    }
    'Watch History'?: {
      VideoList?: TikTokWatchRecord[]
    }
    Status?: unknown
  }
}

type TikTokProfileMap = {
  accountRegion?: string
  aiSelf?: string
  bioDescription?: string
  birthDate?: string
  displayName?: string
  emailAddress?: string
  followerCount?: number
  followingCount?: number
  fundraiser?: string
  inferredGender?: string
  instagramLink?: string
  lemon8Link?: string
  likesReceived?: string
  profilePhoto?: string
  profileVideo?: string
  telephoneNumber?: string
  userName?: string
  youtubeLink?: string
}

type TikTokUserRecord = {
  Date?: string
  UserName?: string
}

type TikTokCommentRecord = {
  date?: string
  comment?: string
  photo?: string
  video?: string
  sticker?: string
  originalPostUrl?: string
  'original post link'?: string
}

type TikTokLinkRecord = {
  Date?: string
  date?: string
  Link?: string
  link?: string
  Title?: string
}

type TikTokWatchRecord = TikTokLinkRecord & {
  Title?: string
}

type TikTokShareRecord = TikTokLinkRecord & {
  SharedContent?: string
  Method?: string
}

type TikTokSearchRecord = {
  Date?: string
  SearchTerm?: string
}

type TikTokHashtagRecord = {
  HashtagName?: string
  HashtagLink?: string
}

type TikTokFavoriteCollectionRecord = {
  Date?: string
  FavoriteCollection?: string
}

type TikTokDirectMessageRecord = {
  Date?: string
  From?: string
  Content?: string
}

const TIKTOK_EXPORT_PATH = 'user_data_tiktok.json'

const bucketDefinitions: TikTokBucketDefinition[] = [
  {
    id: 'tiktok.profile',
    label: 'Profile',
    description:
      'Self profile and account summary. Email, phone, birth date, and autofill fields are not copied to canonical actor nodes.',
    privacyClass: 'private'
  },
  {
    id: 'tiktok.following',
    label: 'Following',
    description: 'Outbound follow edges from the exported TikTok account.',
    privacyClass: 'public'
  },
  {
    id: 'tiktok.followers',
    label: 'Followers',
    description: 'Inbound follow edges to the exported TikTok account.',
    privacyClass: 'public'
  },
  {
    id: 'tiktok.comments',
    label: 'Comments',
    description: 'Authored comments and target video references.',
    privacyClass: 'public'
  },
  {
    id: 'tiktok.likes',
    label: 'Likes',
    description: 'Liked TikTok videos as video nodes and like interactions.',
    privacyClass: 'public'
  },
  {
    id: 'tiktok.posts',
    label: 'Posts',
    description: 'Authored posts, stories, and deleted-post export sections.',
    privacyClass: 'public'
  },
  {
    id: 'tiktok.favorites',
    label: 'Favorites',
    description: 'Favorite videos, sounds, hashtags, playlists, and saved collections.',
    privacyClass: 'private'
  },
  {
    id: 'tiktok.activity-history',
    label: 'Activity History',
    description: 'Watch history, searches, shares, hashtags, and repost/source activity.',
    privacyClass: 'private'
  },
  {
    id: 'tiktok.direct-messages',
    label: 'Direct Messages',
    description: 'One-to-one direct message conversations.',
    privacyClass: 'third-party-private'
  },
  {
    id: 'tiktok.blocks',
    label: 'Blocks',
    description: 'Blocked TikTok accounts.',
    privacyClass: 'private'
  },
  {
    id: 'tiktok.ads',
    label: 'Ads And Personalization',
    description: 'Ad interests, ad visit history, and instant form ad responses.',
    privacyClass: 'ads'
  },
  {
    id: 'tiktok.live',
    label: 'TikTok Live',
    description: 'Live history and live settings metadata.',
    privacyClass: 'private'
  },
  {
    id: 'tiktok.shop',
    label: 'TikTok Shop',
    description: 'Shop orders, support, payment, address, cart, voucher, and review metadata.',
    privacyClass: 'billing'
  },
  {
    id: 'tiktok.wallet',
    label: 'Income+ Wallet',
    description: 'Coin purchase and wallet transaction metadata.',
    privacyClass: 'billing'
  },
  {
    id: 'tiktok.account-metadata',
    label: 'Account Metadata',
    description: 'Settings, autofill, login, device, status, and off-platform activity metadata.',
    privacyClass: 'account-security'
  }
]

export const tiktokAdapter: SocialImportAdapter = {
  id: TIKTOK_ADAPTER_ID,
  version: TIKTOK_ADAPTER_VERSION,
  platform: 'tiktok',
  detect: (manifest) => (hasTikTokSignals(manifest) ? 0.95 : 0),
  probe: ({ manifest }) => ({
    adapterId: TIKTOK_ADAPTER_ID,
    adapterVersion: TIKTOK_ADAPTER_VERSION,
    platform: 'tiktok',
    confidence: hasTikTokSignals(manifest) ? 0.95 : 0,
    buckets: createTikTokBuckets(manifest),
    warnings: []
  }),
  stage: stageTikTokArchive
}

export async function* stageTikTokArchive(
  context: SocialImportContext,
  selection: ImportSelection = {}
): AsyncIterable<StagedSocialRecord> {
  const selectedBuckets = resolveSelectedBuckets(createTikTokBuckets(context.manifest), selection)
  const source = findTikTokEntry(context.manifest)
  if (!source || selectedBuckets.length === 0) return

  const input = await context.readJsonEntry<TikTokExport>(source.path)
  const profile = getTikTokProfile(input)
  const selfActorId = createSocialNodeId('actor', [
    'tiktok',
    'self',
    context.observedBy ?? cleanString(profile?.userName) ?? context.archiveId
  ])
  const selfHandle = cleanString(profile?.userName)

  for (const bucket of selectedBuckets) {
    if (bucket.id === 'tiktok.profile') {
      yield* mapTikTokProfile({ context, source, selfActorId, profile })
    } else if (bucket.id === 'tiktok.following') {
      yield* mapTikTokRelationships({
        context,
        source,
        selfActorId,
        records: input['Profile And Settings']?.Following?.Following ?? [],
        relationshipKind: 'following'
      })
    } else if (bucket.id === 'tiktok.followers') {
      yield* mapTikTokRelationships({
        context,
        source,
        selfActorId,
        records: input['Profile And Settings']?.Follower?.FansList ?? [],
        relationshipKind: 'follower'
      })
    } else if (bucket.id === 'tiktok.blocks') {
      yield* mapTikTokRelationships({
        context,
        source,
        selfActorId,
        records: input['Profile And Settings']?.['Block List']?.BlockList ?? [],
        relationshipKind: 'block'
      })
    } else if (bucket.id === 'tiktok.comments') {
      yield* mapTikTokComments({
        context,
        source,
        selfActorId,
        records: input.Comment?.Comments?.CommentsList ?? []
      })
    } else if (bucket.id === 'tiktok.likes') {
      yield* mapTikTokContentInteractions({
        context,
        source,
        selfActorId,
        bucketId: 'tiktok.likes',
        privacyClass: 'public',
        records: input['Likes and Favorites']?.['Like List']?.ItemFavoriteList ?? [],
        interactionKind: 'like',
        platformInteractionKind: 'like',
        contentKind: 'video',
        platformContentKind: 'video'
      })
    } else if (bucket.id === 'tiktok.posts') {
      yield* mapTikTokPosts({
        context,
        source,
        selfActorId,
        selfHandle,
        records: [
          ...unknownList(input.Post?.Posts?.VideoList),
          ...unknownList(input.Post?.['Recently Deleted Posts']?.PostList)
        ]
      })
    } else if (bucket.id === 'tiktok.favorites') {
      yield* mapTikTokFavorites({ context, source, selfActorId, input })
    } else if (bucket.id === 'tiktok.activity-history') {
      yield* mapTikTokActivityHistory({ context, source, selfActorId, input })
    } else if (bucket.id === 'tiktok.direct-messages') {
      yield* mapTikTokDirectMessages({
        context,
        source,
        selfActorId,
        selfHandle,
        chatHistory: input['Direct Message']?.['Direct Messages']?.ChatHistory ?? {}
      })
    } else if (bucket.id === 'tiktok.ads') {
      yield* mapTikTokMetadataRecords({
        context,
        source,
        bucketId: bucket.id,
        privacyClass: 'ads',
        sections: {
          adInterests: input['Your Activity']?.['Ad Interests'],
          adsVisitHistory: input['Your Activity']?.['Ads Visit History'],
          instantFormAdsResponses: input['Your Activity']?.['Instant Form Ads Responses']
        }
      })
    } else if (bucket.id === 'tiktok.live') {
      yield* mapTikTokMetadataRecords({
        context,
        source,
        bucketId: bucket.id,
        privacyClass: 'private',
        sections: { live: input['TikTok Live'] }
      })
    } else if (bucket.id === 'tiktok.shop') {
      yield* mapTikTokMetadataRecords({
        context,
        source,
        bucketId: bucket.id,
        privacyClass: 'billing',
        sections: { shop: input['TikTok Shop'] }
      })
    } else if (bucket.id === 'tiktok.wallet') {
      yield* mapTikTokMetadataRecords({
        context,
        source,
        bucketId: bucket.id,
        privacyClass: 'billing',
        sections: { wallet: input['Income+ Wallet'] }
      })
    } else if (bucket.id === 'tiktok.account-metadata') {
      yield* mapTikTokMetadataRecords({
        context,
        source,
        bucketId: bucket.id,
        privacyClass: 'account-security',
        sections: {
          settings: input['Profile And Settings']?.Settings,
          autofill: input['Profile And Settings']?.Autofill,
          aiMoji: input['Profile And Settings']?.['AI-Moji'],
          aiSelfImage: input['Profile And Settings']?.AISelfImage,
          offTikTokActivity: input['Profile And Settings']?.['Off TikTok Activity'],
          profileViews: input['Profile And Settings']?.ProfileViews,
          loginHistory: input['Your Activity']?.['Login History'],
          status: input['Your Activity']?.Status
        }
      })
    }
  }
}

export function mapTikTokProfile(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  profile?: TikTokProfileMap
}): StagedSocialRecord[] {
  const profile = input.profile ?? {}
  const handle = cleanString(profile.userName)
    ? normalizeHandle(cleanString(profile.userName) ?? '')
    : undefined
  const displayName = cleanString(profile.displayName) ?? handle ?? 'TikTok Account'
  const sourceRecord = createSourceRecord({
    ...sourceBase(
      input,
      'tiktok.profile',
      `profile:${handle ?? 'self'}`,
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
      platform: 'tiktok',
      bucketId: 'tiktok.profile',
      source: input.source,
      sourceRecordId: sourceRecord.deterministicId,
      privacyClass: 'private',
      properties: {
        actorKind: 'account',
        platformActorId: handle,
        handle,
        displayName,
        profileUrl: handle ? tiktokProfileUrl(handle) : undefined,
        observedBy: input.context.observedBy,
        observedAt: input.context.importedAt,
        isSelf: true,
        metadataJson: JSON.stringify({
          accountRegion: cleanString(profile.accountRegion),
          bioDescription: cleanString(profile.bioDescription),
          followerCount: profile.followerCount,
          followingCount: profile.followingCount,
          likesReceived: toNumber(cleanString(profile.likesReceived)),
          profilePhoto: cleanUrl(profile.profilePhoto),
          profileVideo: cleanUrl(profile.profileVideo),
          aiSelf: cleanUrl(profile.aiSelf),
          fundraiser: cleanString(profile.fundraiser),
          instagramLink: cleanUrl(profile.instagramLink),
          lemon8Link: cleanUrl(profile.lemon8Link),
          youtubeLink: cleanUrl(profile.youtubeLink)
        })
      }
    })
  ]
}

export function mapTikTokRelationships(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  records: readonly TikTokUserRecord[]
  relationshipKind: 'following' | 'follower' | 'block'
}): StagedSocialRecord[] {
  const bucketId = relationshipBucketId(input.relationshipKind)
  const privacyClass = input.relationshipKind === 'block' ? 'private' : 'public'
  return input.records.flatMap((record, index) => {
    const handle = cleanString(record.UserName)
    if (!handle) return []

    const normalizedHandle = normalizeHandle(handle)
    const actorId = createTikTokActorId(normalizedHandle)
    const observedAt = isoOrUndefined(record.Date)
    const sourceRecord = createSourceRecord({
      ...sourceBase(
        input,
        bucketId,
        `${input.relationshipKind}:${normalizedHandle}:${index}`,
        record,
        'actor',
        privacyClass
      )
    })
    const outgoing = input.relationshipKind === 'following' || input.relationshipKind === 'block'

    return [
      sourceRecord,
      createTikTokAccountActor({
        input,
        sourceRecordId: sourceRecord.deterministicId,
        actorId,
        handle: normalizedHandle,
        bucketId,
        privacyClass,
        observedAt
      }),
      createStagedNode({
        kind: 'interaction',
        deterministicId: createSocialNodeId('interaction', [
          'tiktok',
          input.relationshipKind,
          input.selfActorId,
          actorId
        ]),
        platform: 'tiktok',
        bucketId,
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass,
        properties: {
          interactionKind: input.relationshipKind === 'block' ? 'unknown' : 'follow',
          platformInteractionKind: input.relationshipKind,
          actor: outgoing ? input.selfActorId : actorId,
          target: outgoing ? actorId : input.selfActorId,
          targetSchema: 'SocialActor',
          targetTitle: normalizedHandle,
          observedAt,
          importedAt: input.context.importedAt,
          confidence: 0.9
        }
      })
    ]
  })
}

export function mapTikTokComments(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  records: readonly TikTokCommentRecord[]
}): StagedSocialRecord[] {
  return input.records.flatMap((record, index) => {
    const text = cleanString(record.comment)
    if (!text) return []

    const publishedAt = isoOrUndefined(record.date)
    const targetUrl = cleanUrl(record.originalPostUrl) ?? cleanUrl(record['original post link'])
    const targetContentId = targetUrl ? createTikTokContentId('video', targetUrl) : undefined
    const sourceRecord = createSourceRecord({
      ...sourceBase(
        input,
        'tiktok.comments',
        `comment:${publishedAt ?? index}:${targetUrl ?? index}`,
        record,
        'content',
        'public'
      )
    })
    const commentId = createSocialNodeId('content', [
      'tiktok',
      'comment',
      input.source.path,
      publishedAt,
      targetUrl,
      index
    ])
    const output: StagedSocialRecord[] = [
      sourceRecord,
      createStagedNode({
        kind: 'content',
        deterministicId: commentId,
        platform: 'tiktok',
        bucketId: 'tiktok.comments',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'public',
        properties: {
          contentKind: 'comment',
          platformContentKind: 'comment',
          authorActor: input.selfActorId,
          parentContent: targetContentId,
          title: trimPreview(text, 120),
          textPreview: trimPreview(text),
          searchText: text,
          publishedAt,
          importedAt: input.context.importedAt,
          confidence: 0.85,
          metadataJson: JSON.stringify({
            photo: cleanUrl(record.photo),
            video: cleanUrl(record.video),
            sticker: cleanUrl(record.sticker),
            originalPostUrl: targetUrl
          })
        }
      }),
      createStagedNode({
        kind: 'interaction',
        deterministicId: createSocialNodeId('interaction', ['tiktok', 'comment', commentId]),
        platform: 'tiktok',
        bucketId: 'tiktok.comments',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'public',
        properties: {
          interactionKind: 'comment',
          platformInteractionKind: 'comment',
          actor: input.selfActorId,
          target: targetContentId ?? commentId,
          targetSchema: targetContentId ? 'SocialContent' : 'SocialContent',
          targetTitle: targetUrl ?? trimPreview(text, 120),
          publishedAt,
          importedAt: input.context.importedAt,
          confidence: 0.85
        }
      })
    ]

    if (targetUrl && targetContentId) {
      output.splice(
        1,
        0,
        createTikTokLinkedContent({
          input,
          sourceRecordId: sourceRecord.deterministicId,
          bucketId: 'tiktok.comments',
          privacyClass: 'public',
          contentKind: 'video',
          platformContentKind: 'video',
          url: targetUrl,
          observedAt: publishedAt
        })
      )
    }

    return output
  })
}

export function mapTikTokContentInteractions(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  bucketId: string
  privacyClass: SocialPrivacyClass
  records: readonly TikTokLinkRecord[]
  interactionKind: SocialInteractionKind
  platformInteractionKind: string
  contentKind: 'video' | 'audio' | 'post' | 'unknown'
  platformContentKind: string
}): StagedSocialRecord[] {
  return input.records.flatMap((record, index) => {
    const url = cleanUrl(record.Link) ?? cleanUrl(record.link)
    if (!url) return []

    const observedAt = isoOrUndefined(record.Date ?? record.date)
    const contentId = createTikTokContentId(input.platformContentKind, url)
    const sourceRecord = createSourceRecord({
      ...sourceBase(
        input,
        input.bucketId,
        `${input.platformInteractionKind}:${url}:${observedAt ?? index}`,
        record,
        'interaction',
        input.privacyClass
      )
    })

    return [
      sourceRecord,
      createTikTokLinkedContent({
        input,
        sourceRecordId: sourceRecord.deterministicId,
        bucketId: input.bucketId,
        privacyClass: input.privacyClass,
        contentKind: input.contentKind,
        platformContentKind: input.platformContentKind,
        url,
        title: cleanString(record.Title),
        observedAt
      }),
      createStagedNode({
        kind: 'interaction',
        deterministicId: createSocialNodeId('interaction', [
          'tiktok',
          input.platformInteractionKind,
          input.selfActorId,
          contentId,
          observedAt,
          index
        ]),
        platform: 'tiktok',
        bucketId: input.bucketId,
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: input.privacyClass,
        properties: {
          interactionKind: input.interactionKind,
          platformInteractionKind: input.platformInteractionKind,
          actor: input.selfActorId,
          target: contentId,
          targetSchema: 'SocialContent',
          targetTitle: cleanString(record.Title) ?? url,
          observedAt,
          importedAt: input.context.importedAt,
          confidence: 0.9
        }
      })
    ]
  })
}

export function mapTikTokFavorites(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  input: TikTokExport
}): StagedSocialRecord[] {
  return [
    ...mapTikTokContentInteractions({
      ...input,
      bucketId: 'tiktok.favorites',
      privacyClass: 'private',
      records: input.input['Likes and Favorites']?.['Favorite Videos']?.FavoriteVideoList ?? [],
      interactionKind: 'bookmark',
      platformInteractionKind: 'favorite_video',
      contentKind: 'video',
      platformContentKind: 'video'
    }),
    ...mapTikTokContentInteractions({
      ...input,
      bucketId: 'tiktok.favorites',
      privacyClass: 'private',
      records: input.input['Likes and Favorites']?.['Favorite Sounds']?.FavoriteSoundList ?? [],
      interactionKind: 'bookmark',
      platformInteractionKind: 'favorite_sound',
      contentKind: 'audio',
      platformContentKind: 'sound'
    }),
    ...mapTikTokContentInteractions({
      ...input,
      bucketId: 'tiktok.favorites',
      privacyClass: 'private',
      records:
        input.input['Likes and Favorites']?.['Favorite Playlists']?.FavoritePlaylistList ?? [],
      interactionKind: 'bookmark',
      platformInteractionKind: 'favorite_playlist',
      contentKind: 'unknown',
      platformContentKind: 'playlist'
    }),
    ...mapTikTokFavoriteCollections({
      ...input,
      records:
        input.input['Likes and Favorites']?.['Favorite Collection']?.FavoriteCollectionList ?? []
    }),
    ...mapTikTokHashtags({
      ...input,
      bucketId: 'tiktok.favorites',
      records: input.input['Likes and Favorites']?.['Favorite Hashtags']?.FavoriteHashtagList ?? [],
      privacyClass: 'private'
    })
  ]
}

export function mapTikTokActivityHistory(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  input: TikTokExport
}): StagedSocialRecord[] {
  return [
    ...mapTikTokContentInteractions({
      ...input,
      bucketId: 'tiktok.activity-history',
      privacyClass: 'private',
      records: input.input['Your Activity']?.['Watch History']?.VideoList ?? [],
      interactionKind: 'view',
      platformInteractionKind: 'watch_history',
      contentKind: 'video',
      platformContentKind: 'video'
    }),
    ...mapTikTokSearches({
      ...input,
      records: input.input['Your Activity']?.Searches?.SearchList ?? []
    }),
    ...mapTikTokShares({
      ...input,
      records: input.input['Your Activity']?.['Share History']?.ShareHistoryList ?? []
    }),
    ...mapTikTokHashtags({
      ...input,
      bucketId: 'tiktok.activity-history',
      records: input.input['Your Activity']?.Hashtag?.HashtagList ?? [],
      privacyClass: 'private'
    }),
    ...mapTikTokMetadataRecords({
      ...input,
      bucketId: 'tiktok.activity-history',
      privacyClass: 'private',
      sections: { reposts: input.input['Your Activity']?.Reposts }
    })
  ]
}

export function mapTikTokSearches(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  records: readonly TikTokSearchRecord[]
}): StagedSocialRecord[] {
  return input.records.flatMap((record, index) => {
    const query = cleanString(record.SearchTerm)
    if (!query) return []

    const observedAt = isoOrUndefined(record.Date)
    const sourceRecord = createSourceRecord({
      ...sourceBase(
        input,
        'tiktok.activity-history',
        `search:${query}:${observedAt ?? index}`,
        record,
        'interaction',
        'private'
      )
    })

    return [
      sourceRecord,
      createStagedNode({
        kind: 'interaction',
        deterministicId: createSocialNodeId('interaction', [
          'tiktok',
          input.selfActorId,
          'search',
          query,
          observedAt,
          index
        ]),
        platform: 'tiktok',
        bucketId: 'tiktok.activity-history',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'private',
        properties: {
          interactionKind: 'search',
          platformInteractionKind: 'search_history',
          actor: input.selfActorId,
          value: query,
          targetTitle: query,
          observedAt,
          importedAt: input.context.importedAt,
          confidence: 0.95
        }
      })
    ]
  })
}

export function mapTikTokShares(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  records: readonly TikTokShareRecord[]
}): StagedSocialRecord[] {
  return input.records.flatMap((record, index) => {
    const url = cleanUrl(record.Link) ?? cleanUrl(record.link)
    if (!url) return []

    const observedAt = isoOrUndefined(record.Date ?? record.date)
    const contentId = createTikTokContentId('video', url)
    const sourceRecord = createSourceRecord({
      ...sourceBase(
        input,
        'tiktok.activity-history',
        `share:${url}:${observedAt ?? index}`,
        record,
        'interaction',
        'private'
      )
    })

    return [
      sourceRecord,
      createTikTokLinkedContent({
        input,
        sourceRecordId: sourceRecord.deterministicId,
        bucketId: 'tiktok.activity-history',
        privacyClass: 'private',
        contentKind: 'video',
        platformContentKind: cleanString(record.SharedContent) ?? 'video',
        url,
        observedAt
      }),
      createStagedNode({
        kind: 'interaction',
        deterministicId: createSocialNodeId('interaction', [
          'tiktok',
          'share',
          input.selfActorId,
          contentId,
          observedAt,
          index
        ]),
        platform: 'tiktok',
        bucketId: 'tiktok.activity-history',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'private',
        properties: {
          interactionKind: 'share',
          platformInteractionKind: 'share_history',
          actor: input.selfActorId,
          target: contentId,
          targetSchema: 'SocialContent',
          targetTitle: url,
          observedAt,
          importedAt: input.context.importedAt,
          confidence: 0.9,
          metadataJson: JSON.stringify({
            method: cleanString(record.Method),
            sharedContent: cleanString(record.SharedContent)
          })
        }
      })
    ]
  })
}

export function mapTikTokFavoriteCollections(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  records: readonly TikTokFavoriteCollectionRecord[]
}): StagedSocialRecord[] {
  return input.records.flatMap((record, index) => {
    const title = cleanString(record.FavoriteCollection)
    if (!title) return []

    const observedAt = isoOrUndefined(record.Date)
    const collectionId = createSocialNodeId('collection', ['tiktok', 'favorite-collection', title])
    const sourceRecord = createSourceRecord({
      ...sourceBase(
        input,
        'tiktok.favorites',
        `favorite-collection:${title}:${index}`,
        record,
        'collection',
        'private'
      )
    })

    return [
      sourceRecord,
      createStagedNode({
        kind: 'collection',
        deterministicId: collectionId,
        platform: 'tiktok',
        bucketId: 'tiktok.favorites',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'private',
        properties: {
          collectionKind: 'folder',
          platformCollectionId: title,
          title,
          ownerActor: input.selfActorId,
          observedAt,
          metadataJson: JSON.stringify({ platformCollectionKind: 'favorite_collection' })
        }
      })
    ]
  })
}

export function mapTikTokHashtags(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  bucketId: string
  records: readonly TikTokHashtagRecord[]
  privacyClass: SocialPrivacyClass
}): StagedSocialRecord[] {
  return input.records.flatMap((record, index) => {
    const name = cleanString(record.HashtagName)
    if (!name) return []

    const url = cleanUrl(record.HashtagLink)
    const collectionId = createSocialNodeId('collection', ['tiktok', 'hashtag', name])
    const sourceRecord = createSourceRecord({
      ...sourceBase(
        input,
        input.bucketId,
        `hashtag:${name}:${index}`,
        record,
        'collection',
        input.privacyClass
      )
    })

    return [
      sourceRecord,
      createStagedNode({
        kind: 'collection',
        deterministicId: collectionId,
        platform: 'tiktok',
        bucketId: input.bucketId,
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: input.privacyClass,
        properties: {
          collectionKind: 'topic',
          platformCollectionId: name,
          title: name,
          canonicalUrl: url,
          observedAt: input.context.importedAt,
          metadataJson: JSON.stringify({ hashtagName: name })
        }
      })
    ]
  })
}

export function mapTikTokPosts(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  selfHandle?: string
  records: readonly unknown[]
}): StagedSocialRecord[] {
  return input.records.flatMap((record, index) => {
    const post = objectRecord(record)
    if (!post) return []

    const url = firstCleanUrl(post, ['Link', 'link', 'VideoLink', 'videoLink', 'URL', 'url'])
    const title = firstCleanString(post, ['Title', 'title', 'Caption', 'caption', 'Description'])
    const publishedAt = isoOrUndefined(
      firstCleanString(post, ['Date', 'date', 'CreateTime', 'createTime', 'CreatedTime'])
    )
    const platformContentId = url ?? `${input.source.path}:${index}`
    const sourceRecord = createSourceRecord({
      ...sourceBase(
        input,
        'tiktok.posts',
        `post:${platformContentId}:${index}`,
        post,
        'content',
        'public'
      )
    })

    return [
      sourceRecord,
      createStagedNode({
        kind: 'content',
        deterministicId: createTikTokContentId('post', platformContentId),
        platform: 'tiktok',
        bucketId: 'tiktok.posts',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'public',
        properties: {
          contentKind: 'video',
          platformContentKind: 'post',
          platformContentId: extractTikTokId(url) ?? platformContentId,
          canonicalUrl: url,
          platformUrl: url,
          authorActor: input.selfActorId,
          actorHandle: input.selfHandle,
          title: title ?? url ?? 'TikTok post',
          textPreview: title,
          searchText: title,
          publishedAt,
          observedAt: input.context.importedAt,
          importedAt: input.context.importedAt,
          confidence: url ? 0.9 : 0.55,
          metadataJson: JSON.stringify({ sourceKeys: Object.keys(post).sort() })
        }
      })
    ]
  })
}

export function mapTikTokDirectMessages(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  selfHandle?: string
  chatHistory: Record<string, TikTokDirectMessageRecord[]>
}): StagedSocialRecord[] {
  return Object.entries(input.chatHistory).flatMap(([chatTitle, messages], index) => {
    const conversationHandle = parseChatHandle(chatTitle)
    const participantHandles = [
      input.selfHandle,
      conversationHandle,
      ...messages.map((message) => cleanString(message.From))
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => normalizeHandle(value))
    const uniqueParticipantHandles = [...new Set(participantHandles)].sort()
    const participantActorIds = [
      input.selfActorId,
      ...uniqueParticipantHandles
        .filter((handle) => handle !== input.selfHandle)
        .map((handle) => createTikTokActorId(handle))
    ]
    const sourceRecord = createSourceRecord({
      ...sourceBase(
        input,
        'tiktok.direct-messages',
        `conversation:${chatTitle}:${index}`,
        { chatTitle, messages },
        'conversation',
        'third-party-private'
      )
    })
    const conversationId = createSocialNodeId('conversation', ['tiktok', 'dm', chatTitle, index])
    const dates = messages
      .map((message) => isoOrUndefined(message.Date))
      .filter((value): value is string => Boolean(value))
      .sort()
    const conversationRecords: StagedSocialRecord[] = [
      sourceRecord,
      ...uniqueParticipantHandles
        .filter((handle) => handle !== input.selfHandle)
        .map((handle) =>
          createTikTokAccountActor({
            input,
            sourceRecordId: sourceRecord.deterministicId,
            actorId: createTikTokActorId(handle),
            handle,
            bucketId: 'tiktok.direct-messages',
            privacyClass: 'third-party-private',
            observedAt: input.context.importedAt
          })
        ),
      createStagedNode({
        kind: 'conversation',
        deterministicId: conversationId,
        platform: 'tiktok',
        bucketId: 'tiktok.direct-messages',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'third-party-private',
        properties: {
          conversationKind: 'dm',
          platformConversationId: chatTitle,
          title: conversationHandle ? `TikTok DM ${conversationHandle}` : chatTitle,
          participantActorIdsJson: JSON.stringify(participantActorIds),
          startedAt: dates[0],
          lastMessageAt: dates.at(-1),
          messageCount: messages.length,
          sourceArchive: input.context.archiveId
        }
      })
    ]

    for (const [messageIndex, message] of messages.entries()) {
      const senderHandle = cleanString(message.From)
        ? normalizeHandle(cleanString(message.From) ?? '')
        : undefined
      const sentAt = isoOrUndefined(message.Date)
      const text = cleanString(message.Content)
      const urls = extractUrls(text ?? '')
      conversationRecords.push(
        createStagedNode({
          kind: 'message',
          deterministicId: createSocialNodeId('message', [
            'tiktok',
            chatTitle,
            messageIndex,
            sentAt,
            senderHandle
          ]),
          platform: 'tiktok',
          bucketId: 'tiktok.direct-messages',
          source: input.source,
          sourceRecordId: sourceRecord.deterministicId,
          privacyClass: 'third-party-private',
          properties: {
            messageKind: 'message',
            platformMessageId: `${chatTitle}:${messageIndex}`,
            conversation: conversationId,
            senderActor:
              senderHandle && senderHandle === input.selfHandle
                ? input.selfActorId
                : senderHandle
                  ? createTikTokActorId(senderHandle)
                  : undefined,
            senderHandle,
            textPreview: trimPreview(text ?? ''),
            searchText: text,
            externalRefsJson: JSON.stringify(urls),
            sentAt,
            importedAt: input.context.importedAt
          }
        })
      )
    }

    return conversationRecords
  })
}

function mapTikTokMetadataRecords(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId'>
  source: ArchiveEntryRef
  bucketId: string
  privacyClass: SocialPrivacyClass
  sections: Record<string, unknown>
}): StagedSocialRecord[] {
  return Object.entries(input.sections).flatMap(([key, payload]) => {
    if (payload === undefined || payload === null) return []

    return [
      createSourceRecord({
        ...sourceBase(
          input,
          input.bucketId,
          `metadata:${input.bucketId}:${key}`,
          payload,
          'account-metadata',
          input.privacyClass
        )
      })
    ]
  })
}

function createTikTokLinkedContent(input: {
  input: {
    context: Pick<SocialImportContext, 'importedAt'>
    source: ArchiveEntryRef
  }
  sourceRecordId: string
  bucketId: string
  privacyClass: SocialPrivacyClass
  contentKind: 'video' | 'audio' | 'post' | 'unknown'
  platformContentKind: string
  url: string
  title?: string
  observedAt?: string
}): StagedSocialRecord {
  return createStagedNode({
    kind: 'content',
    deterministicId: createTikTokContentId(input.platformContentKind, input.url),
    platform: 'tiktok',
    bucketId: input.bucketId,
    source: input.input.source,
    sourceRecordId: input.sourceRecordId,
    privacyClass: input.privacyClass,
    properties: {
      contentKind: input.contentKind,
      platformContentKind: input.platformContentKind,
      platformContentId: extractTikTokId(input.url),
      canonicalUrl: input.url,
      platformUrl: input.url,
      title: input.title ?? input.url,
      observedAt: input.observedAt,
      importedAt: input.input.context.importedAt,
      confidence: 0.8
    }
  })
}

function createTikTokAccountActor(input: {
  input: {
    context: Pick<SocialImportContext, 'observedBy' | 'importedAt'>
    source: ArchiveEntryRef
  }
  sourceRecordId: string
  actorId: string
  handle: string
  bucketId: string
  privacyClass: SocialPrivacyClass
  observedAt?: string
}): StagedSocialRecord {
  return createStagedNode({
    kind: 'actor',
    deterministicId: input.actorId,
    platform: 'tiktok',
    bucketId: input.bucketId,
    source: input.input.source,
    sourceRecordId: input.sourceRecordId,
    privacyClass: input.privacyClass,
    properties: {
      actorKind: 'account',
      platformActorId: input.handle,
      handle: input.handle,
      displayName: input.handle,
      profileUrl: tiktokProfileUrl(input.handle),
      observedBy: input.input.context.observedBy,
      observedAt: input.observedAt ?? input.input.context.importedAt,
      confidence: 0.75
    }
  })
}

function createTikTokBuckets(manifest: ArchiveManifest): ImportBucket[] {
  const entry = findTikTokEntry(manifest)
  if (!entry) return []

  return bucketDefinitions.map((bucket) => ({
    ...bucket,
    entryPaths: [entry.path],
    defaultSelected: bucket.privacyClass === 'public',
    ignoredReason:
      bucket.privacyClass === 'public'
        ? undefined
        : `Disabled by default because this bucket is ${bucket.privacyClass}.`
  }))
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

function hasTikTokSignals(manifest: ArchiveManifest): boolean {
  return Boolean(findTikTokEntry(manifest))
}

function findTikTokEntry(manifest: ArchiveManifest): ArchiveEntryRef | undefined {
  return manifest.entries.find((entry) => entry.path.endsWith(TIKTOK_EXPORT_PATH))
}

function getTikTokProfile(input: TikTokExport): TikTokProfileMap | undefined {
  return input['Profile And Settings']?.['Profile Info']?.ProfileMap
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
    platform: 'tiktok',
    bucketId,
    source: input.source,
    sourceRecordKind,
    sourceRecordId,
    payload,
    privacyClass
  }
}

function relationshipBucketId(kind: 'following' | 'follower' | 'block'): string {
  if (kind === 'following') return 'tiktok.following'
  if (kind === 'follower') return 'tiktok.followers'
  return 'tiktok.blocks'
}

function createTikTokActorId(handle: string): string {
  return createSocialNodeId('actor', ['tiktok', 'handle', handle])
}

function createTikTokContentId(kind: string, value: string): string {
  return createSocialNodeId('content', ['tiktok', kind, value])
}

function tiktokProfileUrl(handle: string): string {
  return `https://www.tiktok.com/@${encodeURIComponent(handle)}`
}

function parseChatHandle(value: string): string | undefined {
  const match = value.match(/^Chat History with (.*):$/)
  const handle = cleanString(match?.[1] ?? value)
  return handle ? normalizeHandle(handle) : undefined
}

function extractTikTokId(value?: string): string | undefined {
  const url = cleanUrl(value)
  if (!url) return undefined

  try {
    const parsed = new URL(url)
    const parts = parsed.pathname.split('/').filter(Boolean)
    const typedIndex = parts.findIndex((part) =>
      ['video', 'music', 'tag', 'playlist'].includes(part)
    )
    if (typedIndex >= 0 && parts[typedIndex + 1]) {
      return parts[typedIndex + 1].replace(/\.html$/, '')
    }
    return parts.at(-1)?.replace(/\.html$/, '')
  } catch {
    return undefined
  }
}

function unknownList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  return Object.values(value as Record<string, unknown>).flatMap((child) => unknownList(child))
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function firstCleanString(
  record: Record<string, unknown>,
  keys: readonly string[]
): string | undefined {
  for (const key of keys) {
    const value = cleanString(record[key])
    if (value) return value
  }
  return undefined
}

function firstCleanUrl(
  record: Record<string, unknown>,
  keys: readonly string[]
): string | undefined {
  for (const key of keys) {
    const value = cleanUrl(record[key])
    if (value) return value
  }
  return undefined
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed || trimmed.toLowerCase() === 'n/a' || trimmed.toLowerCase() === 'null') {
    return undefined
  }
  return trimmed
}

function cleanUrl(value: unknown): string | undefined {
  const text = cleanString(value)
  if (!text || !/^https?:\/\//i.test(text)) return undefined
  return normalizeUrl(text)
}

function isoOrUndefined(value?: string): string | undefined {
  const text = cleanString(value)
  if (!text) return undefined

  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$/.test(text)
    ? `${text.slice(0, 10)}T${text.slice(11, 19)}Z`
    : /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)
      ? `${text.slice(0, 10)}T${text.slice(11, 19)}Z`
      : text
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function extractUrls(value: string): string[] {
  return [...value.matchAll(/https?:\/\/\S+/gi)].map((match) => normalizeUrl(match[0]))
}

function toNumber(value?: string): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function trimPreview(value: string, maxLength = 5000): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value
}
