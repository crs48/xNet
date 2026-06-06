/**
 * Google Takeout YouTube and YouTube Music importer.
 */

import type {
  ArchiveEntryRef,
  ArchiveManifest,
  ImportBucket,
  ImportSelection,
  SocialImportAdapter,
  SocialImportContext,
  StagedSocialRecord
} from '../import'
import type { SocialPrivacyClass } from '../schemas'
import { parseCSV } from '@xnetjs/data/database'
import { createSocialNodeId, createSourceRecord, createStagedNode, normalizeUrl } from '../import'

export const YOUTUBE_ADAPTER_ID = 'youtube'
export const YOUTUBE_ADAPTER_VERSION = '0.1.0'

export type YouTubeCsvRow = Record<string, string>

type YouTubeHistoryRecord = {
  header?: string
  title?: string
  titleUrl?: string
  subtitles?: Array<{ name?: string; url?: string }>
  time?: string
  products?: string[]
  activityControls?: string[]
}

type YouTubePlaylistVideoFile = {
  source: ArchiveEntryRef
  rows: YouTubeCsvRow[]
}

type YouTubeBucketPattern = {
  id: string
  label: string
  pattern: RegExp
  description: string
  privacyClass: SocialPrivacyClass
}

const bucketPatterns: YouTubeBucketPattern[] = [
  {
    id: 'youtube.channel',
    label: 'Channel',
    pattern: /YouTube and YouTube Music\/channels\/channel\.csv$/,
    description: 'The exported YouTube channel actor for the account.',
    privacyClass: 'public'
  },
  {
    id: 'youtube.subscriptions',
    label: 'Subscriptions',
    pattern: /YouTube and YouTube Music\/subscriptions\/subscriptions\.csv$/,
    description: 'Subscribed channels as follow interactions.',
    privacyClass: 'public'
  },
  {
    id: 'youtube.playlists',
    label: 'Playlists',
    pattern: /YouTube and YouTube Music\/playlists\/(playlists\.csv|.+-videos\.csv)$/,
    description: 'Playlist metadata and playlist-video membership.',
    privacyClass: 'private'
  },
  {
    id: 'youtube.comments',
    label: 'Comments',
    pattern: /YouTube and YouTube Music\/comments\/comments\.csv$/,
    description: 'Authored YouTube comments and target video references.',
    privacyClass: 'public'
  },
  {
    id: 'youtube.music-library',
    label: 'Music Library',
    pattern: /YouTube and YouTube Music\/music \(library and uploads\)\/music library songs\.csv$/,
    description: 'YouTube Music library songs as a private collection.',
    privacyClass: 'private'
  },
  {
    id: 'youtube.history',
    label: 'Watch And Search History',
    pattern: /YouTube and YouTube Music\/history\/(watch-history|search-history)\.json$/,
    description: 'Watch and search history. Disabled by default.',
    privacyClass: 'private'
  },
  {
    id: 'youtube.account-metadata',
    label: 'Channel Settings',
    pattern: /YouTube and YouTube Music\/channels\/channel (?!csv$).+\.csv$/,
    description: 'Channel settings and moderation metadata. Disabled by default.',
    privacyClass: 'account-security'
  }
]

export const youtubeAdapter: SocialImportAdapter = {
  id: YOUTUBE_ADAPTER_ID,
  version: YOUTUBE_ADAPTER_VERSION,
  platform: 'youtube',
  detect: (manifest) => (hasYouTubeSignals(manifest) ? 0.95 : 0),
  probe: ({ manifest }) => ({
    adapterId: YOUTUBE_ADAPTER_ID,
    adapterVersion: YOUTUBE_ADAPTER_VERSION,
    platform: 'youtube',
    confidence: hasYouTubeSignals(manifest) ? 0.95 : 0,
    buckets: createYouTubeBuckets(manifest),
    warnings: []
  }),
  stage: stageYouTubeArchive
}

export async function* stageYouTubeArchive(
  context: SocialImportContext,
  selection: ImportSelection = {}
): AsyncIterable<StagedSocialRecord> {
  const selectedBuckets = resolveSelectedBuckets(createYouTubeBuckets(context.manifest), selection)
  const selfActorId = createSocialNodeId('actor', [
    'youtube',
    'self',
    context.observedBy ?? context.archiveId
  ])

  for (const bucket of selectedBuckets) {
    if (bucket.id === 'youtube.playlists') {
      yield* await stageYouTubePlaylists(context, bucket, selfActorId, requireTextEntry(context))
      continue
    }

    for (const path of bucket.entryPaths) {
      const source = findEntry(context.manifest, path)
      if (!source) continue

      if (bucket.id === 'youtube.channel') {
        yield* mapYouTubeChannel({
          context,
          source,
          selfActorId,
          rows: parseYouTubeCsv(await requireTextEntry(context)(path))
        })
      } else if (bucket.id === 'youtube.subscriptions') {
        yield* mapYouTubeSubscriptions({
          context,
          source,
          selfActorId,
          rows: parseYouTubeCsv(await requireTextEntry(context)(path))
        })
      } else if (bucket.id === 'youtube.comments') {
        yield* mapYouTubeComments({
          context,
          source,
          selfActorId,
          rows: parseYouTubeCsv(await requireTextEntry(context)(path))
        })
      } else if (bucket.id === 'youtube.music-library') {
        yield* mapYouTubeMusicLibrary({
          context,
          source,
          selfActorId,
          rows: parseYouTubeCsv(await requireTextEntry(context)(path))
        })
      } else if (bucket.id === 'youtube.history') {
        const records = await context.readJsonEntry<YouTubeHistoryRecord[]>(path)
        if (path.endsWith('search-history.json')) {
          yield* mapYouTubeSearchHistory({ context, source, selfActorId, records })
        } else {
          yield* mapYouTubeWatchHistory({ context, source, selfActorId, records })
        }
      } else if (bucket.id === 'youtube.account-metadata') {
        yield createSourceRecord({
          archiveId: context.archiveId,
          importRunId: context.importRunId,
          platform: 'youtube',
          bucketId: bucket.id,
          source,
          sourceRecordKind: 'account-metadata',
          sourceRecordId: `account-metadata:${path}`,
          payload: { path, byteSize: source.byteSize, sha256: source.sha256 },
          privacyClass: 'account-security'
        })
      }
    }
  }
}

export function parseYouTubeCsv(text: string): YouTubeCsvRow[] {
  const parsed = parseCSV(text)
  return parsed.rows.map((row) =>
    Object.fromEntries(parsed.headers.map((header, index) => [header, row[index] ?? '']))
  )
}

export function mapYouTubeChannel(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  rows: readonly YouTubeCsvRow[]
}): StagedSocialRecord[] {
  return input.rows.flatMap((row, index) => {
    const channelId = row['Channel ID'] || `self:${index}`
    const displayName = row['Channel Title (Original)'] || 'YouTube Channel'
    const privacyClass = youtubeVisibilityToPrivacy(row['Channel Visibility'])
    const sourceRecord = createSourceRecord({
      ...sourceBase(input, 'youtube.channel', `channel:${channelId}`, row, 'actor', privacyClass)
    })

    return [
      sourceRecord,
      createStagedNode({
        kind: 'actor',
        deterministicId: input.selfActorId,
        platform: 'youtube',
        bucketId: 'youtube.channel',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass,
        properties: {
          actorKind: 'channel',
          platformActorId: channelId,
          displayName,
          profileUrl: channelId.startsWith('UC')
            ? `https://www.youtube.com/channel/${channelId}`
            : undefined,
          observedBy: input.context.observedBy,
          observedAt: input.context.importedAt,
          isSelf: true,
          metadataJson: JSON.stringify({ visibility: row['Channel Visibility'] })
        }
      })
    ]
  })
}

export function mapYouTubeSubscriptions(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  rows: readonly YouTubeCsvRow[]
}): StagedSocialRecord[] {
  return input.rows.flatMap((row, index) => {
    const channelId =
      row['Channel Id'] || channelIdFromUrl(row['Channel Url']) || row['Channel Title']
    if (!channelId) return []

    const title = row['Channel Title'] || channelId
    const url = row['Channel Url'] ? normalizeUrl(row['Channel Url']) : undefined
    const sourceRecord = createSourceRecord({
      ...sourceBase(
        input,
        'youtube.subscriptions',
        `subscription:${channelId}:${index}`,
        row,
        'actor',
        'public'
      )
    })
    const actorId = createYouTubeChannelActorId(channelId)

    return [
      sourceRecord,
      createStagedNode({
        kind: 'actor',
        deterministicId: actorId,
        platform: 'youtube',
        bucketId: 'youtube.subscriptions',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'public',
        properties: {
          actorKind: 'channel',
          platformActorId: channelId,
          displayName: title,
          profileUrl: url,
          observedBy: input.context.observedBy,
          observedAt: input.context.importedAt
        }
      }),
      createStagedNode({
        kind: 'interaction',
        deterministicId: createSocialNodeId('interaction', [
          'youtube',
          input.selfActorId,
          'subscription',
          actorId
        ]),
        platform: 'youtube',
        bucketId: 'youtube.subscriptions',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'public',
        properties: {
          interactionKind: 'follow',
          platformInteractionKind: 'subscription',
          actor: input.selfActorId,
          target: actorId,
          targetSchema: 'SocialActor',
          targetTitle: title,
          observedAt: input.context.importedAt,
          importedAt: input.context.importedAt,
          confidence: 0.95
        }
      })
    ]
  })
}

export function mapYouTubeComments(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  rows: readonly YouTubeCsvRow[]
}): StagedSocialRecord[] {
  return input.rows.flatMap((row, index) => {
    const commentId = row['Comment ID'] || `comment:${index}`
    const videoId = row['Video ID']
    const targetVideoId = videoId || `${commentId}:video`
    const publishedAt = isoOrUndefined(row['Comment Create Timestamp'])
    const text = parseCommentText(row['Comment Text'])
    const sourceRecord = createSourceRecord({
      ...sourceBase(input, 'youtube.comments', `comment:${commentId}`, row, 'content', 'public'),
      warnings: detectTextWarnings(text)
    })
    const videoContentId = createYouTubeVideoContentId(targetVideoId)
    const commentContentId = createSocialNodeId('content', ['youtube', 'comment', commentId])

    return [
      sourceRecord,
      createVideoContentNode({
        context: input.context,
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        bucketId: 'youtube.comments',
        videoId: targetVideoId,
        title: videoId ? `YouTube video ${videoId}` : undefined,
        privacyClass: 'public'
      }),
      createStagedNode({
        kind: 'content',
        deterministicId: commentContentId,
        platform: 'youtube',
        bucketId: 'youtube.comments',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'public',
        warnings: detectTextWarnings(text),
        properties: {
          contentKind: 'comment',
          platformContentKind: 'comment',
          platformContentId: commentId,
          authorActor: input.selfActorId,
          parentContent: videoContentId,
          title: trimPreview(text, 120),
          textPreview: trimPreview(text),
          searchText: text,
          publishedAt,
          observedAt: publishedAt,
          importedAt: input.context.importedAt,
          metadataJson: JSON.stringify({
            channelId: row['Channel ID'],
            price: row.Price,
            parentCommentId: row['Parent Comment ID'],
            topLevelCommentId: row['Top-Level Comment ID']
          })
        }
      }),
      createStagedNode({
        kind: 'interaction',
        deterministicId: createSocialNodeId('interaction', [
          'youtube',
          input.selfActorId,
          'comment',
          commentContentId
        ]),
        platform: 'youtube',
        bucketId: 'youtube.comments',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'public',
        properties: {
          interactionKind: 'comment',
          platformInteractionKind: 'comment',
          actor: input.selfActorId,
          target: commentContentId,
          targetSchema: 'SocialContent',
          targetTitle: trimPreview(text, 120),
          publishedAt,
          observedAt: publishedAt,
          importedAt: input.context.importedAt,
          confidence: 0.9
        }
      })
    ]
  })
}

export function mapYouTubePlaylists(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  selfActorId: string
  catalogSource?: ArchiveEntryRef
  catalogRows?: readonly YouTubeCsvRow[]
  videoFiles?: readonly YouTubePlaylistVideoFile[]
}): StagedSocialRecord[] {
  const catalogRows = input.catalogRows ?? []
  const rowsByTitle = new Map(
    catalogRows.map((row) => [normalizePlaylistTitle(row['Playlist Title (Original)']), row])
  )
  const emittedCollections = new Set<string>()

  const collectionRecords = catalogRows.flatMap((row, index) => {
    if (!input.catalogSource) return []
    const collection = createPlaylistCollection(input, input.catalogSource, row, index)
    emittedCollections.add(collection.collectionId)
    return collection.records
  })

  const itemRecords = (input.videoFiles ?? []).flatMap((file) => {
    const playlistTitle = playlistTitleFromVideoPath(file.source.path)
    const catalogRow = rowsByTitle.get(normalizePlaylistTitle(playlistTitle))
    const collection = createPlaylistCollection(input, file.source, catalogRow, 0, playlistTitle)
    const collectionIntro = emittedCollections.has(collection.collectionId)
      ? []
      : collection.records
    emittedCollections.add(collection.collectionId)

    return [
      ...collectionIntro,
      ...file.rows.flatMap((row, index) =>
        createPlaylistItemRecords({
          context: input.context,
          source: file.source,
          selfActorId: input.selfActorId,
          collectionId: collection.collectionId,
          collectionTitle: collection.title,
          row,
          index,
          privacyClass: collection.privacyClass
        })
      )
    ]
  })

  return [...collectionRecords, ...itemRecords]
}

export function mapYouTubeMusicLibrary(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  rows: readonly YouTubeCsvRow[]
}): StagedSocialRecord[] {
  const collectionId = createSocialNodeId('collection', ['youtube', input.selfActorId, 'music'])
  const collectionSource = createSourceRecord({
    ...sourceBase(
      input,
      'youtube.music-library',
      `music-library:${input.source.path}`,
      { rowCount: input.rows.length },
      'collection',
      'private'
    )
  })

  return [
    collectionSource,
    createStagedNode({
      kind: 'collection',
      deterministicId: collectionId,
      platform: 'youtube',
      bucketId: 'youtube.music-library',
      source: input.source,
      sourceRecordId: collectionSource.deterministicId,
      privacyClass: 'private',
      properties: {
        collectionKind: 'playlist',
        platformCollectionId: 'youtube-music-library',
        title: 'YouTube Music Library',
        ownerActor: input.selfActorId,
        itemCount: input.rows.length,
        observedAt: input.context.importedAt
      }
    }),
    ...input.rows.flatMap((row, index) => {
      const videoId = row['Video ID'] || `${row['Song Title']}:${index}`
      const sourceRecord = createSourceRecord({
        ...sourceBase(
          input,
          'youtube.music-library',
          `music:${videoId}:${index}`,
          row,
          'collection-item',
          'private'
        )
      })
      const contentId = createYouTubeVideoContentId(videoId)
      const artists = [row['Artist Name 1'], row['Artist Name 2'], row['Artist Name 3']].filter(
        Boolean
      )

      return [
        sourceRecord,
        createStagedNode({
          kind: 'content',
          deterministicId: contentId,
          platform: 'youtube',
          bucketId: 'youtube.music-library',
          source: input.source,
          sourceRecordId: sourceRecord.deterministicId,
          privacyClass: 'public',
          properties: {
            contentKind: 'audio',
            platformContentKind: 'music_library_song',
            platformContentId: videoId,
            canonicalUrl: videoUrl(videoId),
            platformUrl: videoUrl(videoId),
            title: row['Song Title'] || videoId,
            textPreview: [row['Song Title'], row['Album Title'], ...artists]
              .filter(Boolean)
              .join(' - '),
            searchText: [row['Song Title'], row['Album Title'], ...artists]
              .filter(Boolean)
              .join('\n'),
            mediaKind: 'audio',
            observedAt: input.context.importedAt,
            importedAt: input.context.importedAt,
            metadataJson: JSON.stringify({ albumTitle: row['Album Title'], artists })
          }
        }),
        createStagedNode({
          kind: 'collection-item',
          deterministicId: createSocialNodeId('collection-item', [
            'youtube',
            collectionId,
            contentId
          ]),
          platform: 'youtube',
          bucketId: 'youtube.music-library',
          source: input.source,
          sourceRecordId: sourceRecord.deterministicId,
          privacyClass: 'private',
          properties: {
            collection: collectionId,
            item: contentId,
            itemSchema: 'SocialContent',
            sortKey: String(index).padStart(8, '0')
          }
        })
      ]
    })
  ]
}

export function mapYouTubeWatchHistory(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  records: readonly YouTubeHistoryRecord[]
}): StagedSocialRecord[] {
  return input.records.flatMap((record, index) => {
    const observedAt = isoOrUndefined(record.time)
    const videoId = extractYouTubeVideoId(record.titleUrl) ?? `${record.title ?? 'watch'}:${index}`
    const sourceRecord = createSourceRecord({
      ...sourceBase(
        input,
        'youtube.history',
        `watch:${videoId}:${observedAt ?? index}`,
        record,
        'interaction',
        'private'
      )
    })
    const channel = record.subtitles?.[0]
    const channelActorId =
      channel?.url || channel?.name
        ? createYouTubeChannelActorId(channelIdFromUrl(channel.url) ?? channel.name ?? '')
        : undefined
    const videoContentId = createYouTubeVideoContentId(videoId)
    const title = cleanWatchTitle(record.title)

    return [
      sourceRecord,
      ...(channelActorId
        ? [
            createStagedNode({
              kind: 'actor',
              deterministicId: channelActorId,
              platform: 'youtube',
              bucketId: 'youtube.history',
              source: input.source,
              sourceRecordId: sourceRecord.deterministicId,
              privacyClass: 'public',
              properties: {
                actorKind: 'channel',
                platformActorId: channelIdFromUrl(channel?.url) ?? channel?.name,
                displayName: channel?.name,
                profileUrl: channel?.url ? normalizeUrl(channel.url) : undefined,
                observedBy: input.context.observedBy,
                observedAt
              }
            })
          ]
        : []),
      createVideoContentNode({
        context: input.context,
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        bucketId: 'youtube.history',
        videoId,
        title,
        authorActor: channelActorId,
        platformUrl: record.titleUrl,
        privacyClass: 'public'
      }),
      createStagedNode({
        kind: 'interaction',
        deterministicId: createSocialNodeId('interaction', [
          'youtube',
          input.selfActorId,
          'view',
          videoContentId,
          observedAt,
          index
        ]),
        platform: 'youtube',
        bucketId: 'youtube.history',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'private',
        properties: {
          interactionKind: 'view',
          platformInteractionKind: 'watch_history',
          actor: input.selfActorId,
          target: videoContentId,
          targetSchema: 'SocialContent',
          targetTitle: title,
          targetAuthorActor: channelActorId,
          observedAt,
          importedAt: input.context.importedAt,
          confidence: 0.95,
          metadataJson: JSON.stringify({
            products: record.products ?? [],
            activityControls: record.activityControls ?? []
          })
        }
      })
    ]
  })
}

export function mapYouTubeSearchHistory(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  records: readonly YouTubeHistoryRecord[]
}): StagedSocialRecord[] {
  return input.records.flatMap((record, index) => {
    const observedAt = isoOrUndefined(record.time)
    const query = cleanSearchTitle(record.title)
    if (!query) return []
    const sourceRecord = createSourceRecord({
      ...sourceBase(
        input,
        'youtube.history',
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
          'youtube',
          input.selfActorId,
          'search',
          query,
          observedAt,
          index
        ]),
        platform: 'youtube',
        bucketId: 'youtube.history',
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
          confidence: 0.95,
          metadataJson: JSON.stringify({
            titleUrl: record.titleUrl,
            products: record.products ?? [],
            activityControls: record.activityControls ?? []
          })
        }
      })
    ]
  })
}

async function stageYouTubePlaylists(
  context: SocialImportContext,
  bucket: ImportBucket,
  selfActorId: string,
  readTextEntry: (path: string) => Promise<string>
): Promise<StagedSocialRecord[]> {
  const catalogPath = bucket.entryPaths.find((path) => path.endsWith('/playlists.csv'))
  const catalogSource = catalogPath ? findEntry(context.manifest, catalogPath) : undefined
  const catalogRows =
    catalogPath && catalogSource ? parseYouTubeCsv(await readTextEntry(catalogPath)) : []
  const videoFiles = await Promise.all(
    bucket.entryPaths
      .filter((path) => /-videos\.csv$/.test(path))
      .map(async (path) => {
        const source = findEntry(context.manifest, path)
        return source ? { source, rows: parseYouTubeCsv(await readTextEntry(path)) } : undefined
      })
  )

  return mapYouTubePlaylists({
    context,
    selfActorId,
    catalogSource,
    catalogRows,
    videoFiles: videoFiles.filter((file): file is YouTubePlaylistVideoFile => Boolean(file))
  })
}

function createPlaylistCollection(
  input: Pick<Parameters<typeof mapYouTubePlaylists>[0], 'context' | 'selfActorId'>,
  source: ArchiveEntryRef,
  row: YouTubeCsvRow | undefined,
  index: number,
  fallbackTitle?: string
): {
  collectionId: string
  title: string
  privacyClass: SocialPrivacyClass
  records: StagedSocialRecord[]
} {
  const title = row?.['Playlist Title (Original)'] || fallbackTitle || 'YouTube Playlist'
  const platformCollectionId = row?.['Playlist ID'] || `${source.path}:${title}`
  const privacyClass = youtubeVisibilityToPrivacy(row?.['Playlist Visibility'])
  const collectionId = createSocialNodeId('collection', ['youtube', platformCollectionId])
  const sourceRecord = createSourceRecord({
    ...sourceBase(
      { context: input.context, source },
      'youtube.playlists',
      `playlist:${platformCollectionId}:${index}`,
      row ?? { title },
      'collection',
      privacyClass
    )
  })

  return {
    collectionId,
    title,
    privacyClass,
    records: [
      sourceRecord,
      createStagedNode({
        kind: 'collection',
        deterministicId: collectionId,
        platform: 'youtube',
        bucketId: 'youtube.playlists',
        source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass,
        properties: {
          collectionKind: 'playlist',
          platformCollectionId,
          title,
          ownerActor: input.selfActorId,
          canonicalUrl: platformCollectionId.startsWith('PL')
            ? `https://www.youtube.com/playlist?list=${platformCollectionId}`
            : undefined,
          observedAt:
            isoOrUndefined(row?.['Playlist Update Timestamp']) ?? input.context.importedAt,
          metadataJson: JSON.stringify({
            addNewVideosToTop: row?.['Add new videos to top'],
            playlistVideoOrder: row?.['Playlist Video Order'],
            visibility: row?.['Playlist Visibility'],
            createdAt: row?.['Playlist Create Timestamp'],
            imageUrl: row?.['Playlist Image 1 URL']
          })
        }
      })
    ]
  }
}

function createPlaylistItemRecords(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  collectionId: string
  collectionTitle: string
  row: YouTubeCsvRow
  index: number
  privacyClass: SocialPrivacyClass
}): StagedSocialRecord[] {
  const videoId = input.row['Video ID'] || `${input.collectionId}:${input.index}`
  const addedAt = isoOrUndefined(input.row['Playlist Video Creation Timestamp'])
  const sourceRecord = createSourceRecord({
    ...sourceBase(
      input,
      'youtube.playlists',
      `playlist-item:${input.collectionId}:${videoId}:${input.index}`,
      input.row,
      'collection-item',
      input.privacyClass
    )
  })
  const contentId = createYouTubeVideoContentId(videoId)

  return [
    sourceRecord,
    createVideoContentNode({
      context: input.context,
      source: input.source,
      sourceRecordId: sourceRecord.deterministicId,
      bucketId: 'youtube.playlists',
      videoId,
      title: `YouTube video ${videoId}`,
      privacyClass: 'public'
    }),
    createStagedNode({
      kind: 'collection-item',
      deterministicId: createSocialNodeId('collection-item', [
        'youtube',
        input.collectionId,
        contentId
      ]),
      platform: 'youtube',
      bucketId: 'youtube.playlists',
      source: input.source,
      sourceRecordId: sourceRecord.deterministicId,
      privacyClass: input.privacyClass,
      properties: {
        collection: input.collectionId,
        item: contentId,
        itemSchema: 'SocialContent',
        sortKey: String(input.index).padStart(8, '0'),
        addedAt,
        metadataJson: JSON.stringify({ collectionTitle: input.collectionTitle })
      }
    })
  ]
}

function createVideoContentNode(input: {
  context: Pick<SocialImportContext, 'importedAt'>
  source: ArchiveEntryRef
  sourceRecordId: string
  bucketId: string
  videoId: string
  title?: string
  authorActor?: string
  platformUrl?: string
  privacyClass: SocialPrivacyClass
}): StagedSocialRecord {
  const platformUrl = input.platformUrl ? normalizeUrl(input.platformUrl) : videoUrl(input.videoId)

  return createStagedNode({
    kind: 'content',
    deterministicId: createYouTubeVideoContentId(input.videoId),
    platform: 'youtube',
    bucketId: input.bucketId,
    source: input.source,
    sourceRecordId: input.sourceRecordId,
    privacyClass: input.privacyClass,
    properties: {
      contentKind: 'video',
      platformContentKind: 'video',
      platformContentId: input.videoId,
      canonicalUrl: platformUrl,
      platformUrl,
      authorActor: input.authorActor,
      title: input.title,
      textPreview: input.title,
      searchText: input.title,
      mediaKind: 'video',
      observedAt: input.context.importedAt,
      importedAt: input.context.importedAt,
      confidence: input.videoId ? 0.9 : 0.6
    }
  })
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
    platform: 'youtube',
    bucketId,
    source: input.source,
    sourceRecordKind,
    sourceRecordId,
    payload,
    privacyClass
  }
}

function createYouTubeBuckets(manifest: ArchiveManifest): ImportBucket[] {
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

function hasYouTubeSignals(manifest: ArchiveManifest): boolean {
  return manifest.entries.some((entry) => /Takeout\/YouTube and YouTube Music\//.test(entry.path))
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

function requireTextEntry(context: SocialImportContext): (path: string) => Promise<string> {
  if (!context.readTextEntry) {
    throw new Error('YouTube imports require readTextEntry for CSV export files')
  }
  return context.readTextEntry
}

function findEntry(manifest: ArchiveManifest, path: string): ArchiveEntryRef | undefined {
  return manifest.entries.find((entry) => entry.path === path)
}

function createYouTubeChannelActorId(channelIdOrName: string): string {
  return createSocialNodeId('actor', ['youtube', 'channel', channelIdOrName])
}

function createYouTubeVideoContentId(videoId: string): string {
  return createSocialNodeId('content', ['youtube', 'video', videoId])
}

function videoUrl(videoId: string): string | undefined {
  return videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : undefined
}

function channelIdFromUrl(value?: string): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    const parts = url.pathname.split('/').filter(Boolean)
    const channelIndex = parts.indexOf('channel')
    return channelIndex >= 0 ? parts[channelIndex + 1] : undefined
  } catch {
    return undefined
  }
}

function extractYouTubeVideoId(value?: string): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    const watchId = url.searchParams.get('v')
    if (watchId) return watchId
    if (url.hostname === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0]
    const parts = url.pathname.split('/').filter(Boolean)
    const shortIndex = parts.indexOf('shorts')
    return shortIndex >= 0 ? parts[shortIndex + 1] : undefined
  } catch {
    return value.trim() || undefined
  }
}

function playlistTitleFromVideoPath(path: string): string {
  const filename = path.split('/').at(-1) ?? path
  return filename.replace(/-videos\.csv$/, '')
}

function normalizePlaylistTitle(value?: string): string {
  return (value ?? '').trim().toLowerCase()
}

function youtubeVisibilityToPrivacy(value?: string): SocialPrivacyClass {
  return value?.trim().toLowerCase() === 'public' ? 'public' : 'private'
}

function isoOrUndefined(value?: string): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function parseCommentText(value?: string): string {
  if (!value) return ''
  try {
    const parsed = JSON.parse(value) as unknown
    if (isRecord(parsed) && typeof parsed.text === 'string') return parsed.text
  } catch {
    // Fall through to raw text.
  }
  return value
}

function cleanWatchTitle(value?: string): string | undefined {
  return value?.replace(/^Watched\s+/i, '').trim() || undefined
}

function cleanSearchTitle(value?: string): string {
  return value?.replace(/^Searched for\s+/i, '').trim() ?? ''
}

function trimPreview(value: string, maxLength = 5000): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value
}

function detectTextWarnings(value: string): string[] {
  return /Ã|Â|â[€™€œ€“]/.test(value) ? ['possible mojibake encoding anomaly'] : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
