/**
 * Reddit user data export importer.
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
import { parseCSV } from '@xnetjs/data/database'
import {
  createSocialNodeId,
  createSourceRecord,
  createStagedNode,
  normalizeHandle,
  normalizeUrl
} from '../import/core'

export const REDDIT_ADAPTER_ID = 'reddit'
export const REDDIT_ADAPTER_VERSION = '0.1.0'

export type RedditCsvRow = Record<string, string>

type RedditBucketPattern = {
  id: string
  label: string
  pattern: RegExp
  description: string
  privacyClass: SocialPrivacyClass
}

type RedditCsvFile = {
  source: ArchiveEntryRef
  rows: RedditCsvRow[]
}

type RedditContentKind = 'post' | 'comment'

const bucketPatterns: RedditBucketPattern[] = [
  {
    id: 'reddit.profile',
    label: 'Profile',
    pattern: /^(account_gender|birthdate|inferred_age|persona|statistics)\.csv$/,
    description:
      'Self account actor and private profile summary. Raw birthdate, gender, age, and persona values are not copied to canonical actor nodes.',
    privacyClass: 'private'
  },
  {
    id: 'reddit.authored-content',
    label: 'Posts And Comments',
    pattern: /^(posts|comments)\.csv$/,
    description: 'Authored Reddit posts and comments as public content records.',
    privacyClass: 'public'
  },
  {
    id: 'reddit.votes',
    label: 'Votes',
    pattern: /^(post_votes|comment_votes|poll_votes)\.csv$/,
    description: 'Private post, comment, and poll vote history.',
    privacyClass: 'private'
  },
  {
    id: 'reddit.saved-hidden',
    label: 'Saved And Hidden Items',
    pattern: /^(saved_posts|saved_comments|hidden_posts)\.csv$/,
    description: 'Private saved comment, saved post, and hidden post interactions.',
    privacyClass: 'private'
  },
  {
    id: 'reddit.subreddits',
    label: 'Subreddits',
    pattern: /^(subscribed_subreddits|moderated_subreddits|approved_submitter_subreddits)\.csv$/,
    description: 'Subreddit memberships and moderation relationships.',
    privacyClass: 'private'
  },
  {
    id: 'reddit.messages',
    label: 'Chats And Messages',
    pattern: /^(chat_history|messages_archive|messages_archive_headers)\.csv$/,
    description: 'Private Reddit chats and private-message archive records.',
    privacyClass: 'third-party-private'
  },
  {
    id: 'reddit.ads',
    label: 'Ad Preferences',
    pattern: /^sensitive_ads_preferences\.csv$/,
    description: 'Ad preference source records.',
    privacyClass: 'ads'
  },
  {
    id: 'reddit.billing',
    label: 'Billing',
    pattern: /^(payouts|purchases|stripe|subscriptions)\.csv$/,
    description: 'Billing, payout, purchase, and subscription source records.',
    privacyClass: 'billing'
  },
  {
    id: 'reddit.account-security',
    label: 'Account Security',
    pattern: /^(checkfile|ip_logs|linked_identities|linked_phone_number)\.csv$/,
    description: 'Security-sensitive account metadata source records.',
    privacyClass: 'account-security'
  },
  {
    id: 'reddit.account-metadata',
    label: 'Other Account Metadata',
    pattern:
      /^(announcements|drafts|friends|gilded_content|gold_received|multireddits|scheduled_posts|user_preferences)\.csv$/,
    description: 'Other private Reddit account metadata source records.',
    privacyClass: 'private'
  }
]

export const redditAdapter: SocialImportAdapter = {
  id: REDDIT_ADAPTER_ID,
  version: REDDIT_ADAPTER_VERSION,
  platform: 'reddit',
  detect: (manifest) => (hasRedditSignals(manifest) ? 0.95 : 0),
  probe: ({ manifest }) => ({
    adapterId: REDDIT_ADAPTER_ID,
    adapterVersion: REDDIT_ADAPTER_VERSION,
    platform: 'reddit',
    confidence: hasRedditSignals(manifest) ? 0.95 : 0,
    buckets: createRedditBuckets(manifest),
    warnings: []
  }),
  stage: stageRedditArchive
}

export async function* stageRedditArchive(
  context: SocialImportContext,
  selection: ImportSelection = {}
): AsyncIterable<StagedSocialRecord> {
  const readTextEntry = requireTextEntry(context)
  const selectedBuckets = resolveSelectedBuckets(createRedditBuckets(context.manifest), selection)
  const selfActorId = createSocialNodeId('actor', [
    'reddit',
    'self',
    context.observedBy ?? context.archiveId
  ])

  for (const bucket of selectedBuckets) {
    const files = await readBucketCsvFiles(context, bucket, readTextEntry)

    if (bucket.id === 'reddit.profile') {
      yield* mapRedditProfile({ context, files, selfActorId })
    } else if (bucket.id === 'reddit.authored-content') {
      yield* mapRedditAuthoredContent({ context, files, selfActorId })
    } else if (bucket.id === 'reddit.votes') {
      yield* mapRedditVotes({ context, files, selfActorId })
    } else if (bucket.id === 'reddit.saved-hidden') {
      yield* mapRedditSavedAndHiddenItems({ context, files, selfActorId })
    } else if (bucket.id === 'reddit.subreddits') {
      yield* mapRedditSubredditMemberships({ context, files, selfActorId })
    } else if (bucket.id === 'reddit.messages') {
      const selfHandle = inferSelfHandle(files)
      yield* mapRedditChatHistory({ context, files, selfActorId, selfHandle })
      yield* mapRedditPrivateMessages({ context, files, selfActorId, selfHandle })
      yield* mapRedditSourceRecords({ context, files, bucket })
    } else {
      yield* mapRedditSourceRecords({ context, files, bucket })
    }
  }
}

export function parseRedditCsv(text: string): RedditCsvRow[] {
  const parsed = parseCSV(text)
  return parsed.rows.map((row) =>
    Object.fromEntries(parsed.headers.map((header, index) => [header, row[index] ?? '']))
  )
}

export function mapRedditProfile(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  files: readonly RedditCsvFile[]
  selfActorId: string
}): StagedSocialRecord[] {
  const source = input.files[0]?.source
  if (!source) return []

  const sourceRecord = createSourceRecord({
    ...sourceBase(
      { context: input.context, source },
      'reddit.profile',
      'profile:self',
      {
        files: input.files.map((file) => summarizeCsvFile(file)),
        hasPrivateDemographics: input.files.some((file) =>
          /^(account_gender|birthdate|inferred_age|persona)\.csv$/.test(file.source.path)
        )
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
      platform: 'reddit',
      bucketId: 'reddit.profile',
      source,
      sourceRecordId: sourceRecord.deterministicId,
      privacyClass: 'private',
      properties: {
        actorKind: 'account',
        displayName: 'Reddit User',
        observedBy: input.context.observedBy,
        observedAt: input.context.importedAt,
        isSelf: true,
        metadataJson: JSON.stringify({
          files: input.files.map((file) => summarizeCsvFile(file))
        })
      }
    }),
    ...input.files.flatMap((file) =>
      createFileSummarySourceRecords({
        context: input.context,
        file,
        bucketId: 'reddit.profile',
        privacyClass: 'private'
      })
    )
  ]
}

export function mapRedditAuthoredContent(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  files: readonly RedditCsvFile[]
  selfActorId: string
}): StagedSocialRecord[] {
  return [
    ...createRedditSelfActorRecords({
      context: input.context,
      source: input.files[0]?.source,
      selfActorId: input.selfActorId,
      bucketId: 'reddit.authored-content',
      privacyClass: 'public'
    }),
    ...input.files.flatMap((file) => {
      if (file.source.path === 'posts.csv') {
        return file.rows.flatMap((row, index) =>
          createAuthoredPostRecords({
            context: input.context,
            source: file.source,
            selfActorId: input.selfActorId,
            row,
            index
          })
        )
      }
      if (file.source.path === 'comments.csv') {
        return file.rows.flatMap((row, index) =>
          createAuthoredCommentRecords({
            context: input.context,
            source: file.source,
            selfActorId: input.selfActorId,
            row,
            index
          })
        )
      }
      return []
    })
  ]
}

export function mapRedditVotes(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  files: readonly RedditCsvFile[]
  selfActorId: string
}): StagedSocialRecord[] {
  return [
    ...createRedditSelfActorRecords({
      context: input.context,
      source: input.files[0]?.source,
      selfActorId: input.selfActorId,
      bucketId: 'reddit.votes',
      privacyClass: 'private'
    }),
    ...input.files.flatMap((file) =>
      file.rows.flatMap((row, index) => {
        if (file.source.path === 'post_votes.csv') {
          return createVoteRecords({
            context: input.context,
            source: file.source,
            selfActorId: input.selfActorId,
            row,
            index,
            targetKind: 'post',
            platformInteractionKind: 'post_vote',
            value: cleanString(row.direction)
          })
        }
        if (file.source.path === 'comment_votes.csv') {
          return createVoteRecords({
            context: input.context,
            source: file.source,
            selfActorId: input.selfActorId,
            row,
            index,
            targetKind: 'comment',
            platformInteractionKind: 'comment_vote',
            value: cleanString(row.direction)
          })
        }
        if (file.source.path === 'poll_votes.csv') {
          return createVoteRecords({
            context: input.context,
            source: file.source,
            selfActorId: input.selfActorId,
            row,
            index,
            targetKind: 'post',
            platformInteractionKind: 'poll_vote',
            value: cleanString(row.user_selection) ?? cleanString(row.text)
          })
        }
        return []
      })
    )
  ]
}

export function mapRedditSavedAndHiddenItems(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  files: readonly RedditCsvFile[]
  selfActorId: string
}): StagedSocialRecord[] {
  return [
    ...createRedditSelfActorRecords({
      context: input.context,
      source: input.files[0]?.source,
      selfActorId: input.selfActorId,
      bucketId: 'reddit.saved-hidden',
      privacyClass: 'private'
    }),
    ...input.files.flatMap((file) =>
      file.rows.flatMap((row, index) => {
        if (file.source.path === 'saved_posts.csv') {
          return createSavedItemRecords({
            context: input.context,
            source: file.source,
            selfActorId: input.selfActorId,
            row,
            index,
            targetKind: 'post',
            interactionKind: 'save',
            platformInteractionKind: 'saved_post'
          })
        }
        if (file.source.path === 'saved_comments.csv') {
          return createSavedItemRecords({
            context: input.context,
            source: file.source,
            selfActorId: input.selfActorId,
            row,
            index,
            targetKind: 'comment',
            interactionKind: 'save',
            platformInteractionKind: 'saved_comment'
          })
        }
        if (file.source.path === 'hidden_posts.csv') {
          return createSavedItemRecords({
            context: input.context,
            source: file.source,
            selfActorId: input.selfActorId,
            row,
            index,
            targetKind: 'post',
            interactionKind: 'unknown',
            platformInteractionKind: 'hidden_post'
          })
        }
        return []
      })
    )
  ]
}

export function mapRedditSubredditMemberships(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  files: readonly RedditCsvFile[]
  selfActorId: string
}): StagedSocialRecord[] {
  return [
    ...createRedditSelfActorRecords({
      context: input.context,
      source: input.files[0]?.source,
      selfActorId: input.selfActorId,
      bucketId: 'reddit.subreddits',
      privacyClass: 'private'
    }),
    ...input.files.flatMap((file) =>
      file.rows.flatMap((row, index) =>
        createSubredditMembershipRecords({
          context: input.context,
          source: file.source,
          selfActorId: input.selfActorId,
          row,
          index,
          relationshipKind: subredditRelationshipKind(file.source.path)
        })
      )
    )
  ]
}

export function mapRedditChatHistory(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  files: readonly RedditCsvFile[]
  selfActorId: string
  selfHandle?: string
}): StagedSocialRecord[] {
  const rows = input.files
    .filter((file) => file.source.path === 'chat_history.csv')
    .flatMap((file) => file.rows.map((row) => ({ source: file.source, row })))
  const groups = groupBy(rows, ({ row }) => row.channel_url || row.channel_name || row.subreddit)

  return [...groups.entries()].flatMap(([conversationKey, groupedRows], conversationIndex) =>
    createChatConversationRecords({
      ...input,
      source: groupedRows[0]?.source,
      rows: groupedRows.map((item) => item.row),
      conversationKey,
      conversationIndex
    })
  )
}

export function mapRedditPrivateMessages(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  files: readonly RedditCsvFile[]
  selfActorId: string
  selfHandle?: string
}): StagedSocialRecord[] {
  const rows = input.files
    .filter((file) => file.source.path === 'messages_archive.csv')
    .flatMap((file) => file.rows.map((row) => ({ source: file.source, row })))
  const groups = groupBy(rows, ({ row }) => row.thread_id || row.permalink || row.id)

  return [...groups.entries()].flatMap(([conversationKey, groupedRows], conversationIndex) =>
    createPrivateMessageConversationRecords({
      ...input,
      source: groupedRows[0]?.source,
      rows: groupedRows.map((item) => item.row),
      conversationKey,
      conversationIndex
    })
  )
}

export function mapRedditSourceRecords(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId'>
  files: readonly RedditCsvFile[]
  bucket: Pick<ImportBucket, 'id' | 'privacyClass'>
}): StagedSocialRecord[] {
  return input.files.flatMap((file) =>
    file.rows.length > 0
      ? file.rows.map((row, index) =>
          createSourceRecord({
            ...sourceBase(
              { context: input.context, source: file.source },
              input.bucket.id,
              `${file.source.path}:${index}`,
              row,
              metadataSourceKind(file.source.path),
              input.bucket.privacyClass
            )
          })
        )
      : createFileSummarySourceRecords({
          context: input.context,
          file,
          bucketId: input.bucket.id,
          privacyClass: input.bucket.privacyClass
        })
  )
}

function createAuthoredPostRecords(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  row: RedditCsvRow
  index: number
}): StagedSocialRecord[] {
  const postId = cleanString(input.row.id) ?? contentFallbackId(input.source, input.index)
  const publishedAt = isoOrUndefined(input.row.date)
  const permalink = redditUrl(input.row.permalink)
  const text = cleanString(input.row.body)
  const title = cleanString(input.row.title) ?? trimPreview(text ?? postId, 120)
  const sourceRecord = createSourceRecord({
    ...sourceBase(
      input,
      'reddit.authored-content',
      `post:${postId}`,
      input.row,
      'content',
      'public'
    )
  })
  const contentId = createRedditContentId('post', postId)

  return [
    sourceRecord,
    ...createSubredditReferenceRecords({
      context: input.context,
      source: input.source,
      sourceRecordId: sourceRecord.deterministicId,
      bucketId: 'reddit.authored-content',
      subreddit: input.row.subreddit,
      privacyClass: 'public'
    }),
    createStagedNode({
      kind: 'content',
      deterministicId: contentId,
      platform: 'reddit',
      bucketId: 'reddit.authored-content',
      source: input.source,
      sourceRecordId: sourceRecord.deterministicId,
      privacyClass: 'public',
      properties: {
        contentKind: 'post',
        platformContentKind: 'post',
        platformContentId: postId,
        canonicalUrl: permalink,
        platformUrl: permalink,
        authorActor: input.selfActorId,
        title,
        textPreview: trimPreview([title, text].filter(Boolean).join('\n\n')),
        searchText: [title, text].filter(Boolean).join('\n\n'),
        mediaKind: mediaKindFromRow(input.row),
        publishedAt,
        observedAt: publishedAt,
        importedAt: input.context.importedAt,
        confidence: cleanString(input.row.id) ? 0.95 : 0.7,
        metadataJson: JSON.stringify({
          subreddit: cleanSubreddit(input.row.subreddit),
          gildings: numberOrUndefined(input.row.gildings),
          externalUrl: cleanUrl(input.row.url),
          hasIpAddress: Boolean(cleanString(input.row.ip))
        })
      }
    })
  ]
}

function createAuthoredCommentRecords(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  row: RedditCsvRow
  index: number
}): StagedSocialRecord[] {
  const commentId = cleanString(input.row.id) ?? contentFallbackId(input.source, input.index)
  const publishedAt = isoOrUndefined(input.row.date)
  const text = cleanString(input.row.body) ?? ''
  const permalink = redditUrl(input.row.permalink)
  const parentId = cleanString(input.row.parent)
  const parentContentId = parentId
    ? createRedditContentId(parentKind(parentId), parentId)
    : undefined
  const sourceRecord = createSourceRecord({
    ...sourceBase(
      input,
      'reddit.authored-content',
      `comment:${commentId}`,
      input.row,
      'content',
      'public'
    )
  })
  const commentContentId = createRedditContentId('comment', commentId)

  return [
    sourceRecord,
    ...createSubredditReferenceRecords({
      context: input.context,
      source: input.source,
      sourceRecordId: sourceRecord.deterministicId,
      bucketId: 'reddit.authored-content',
      subreddit: input.row.subreddit,
      privacyClass: 'public'
    }),
    ...(parentId && parentContentId
      ? [
          createContentReferenceNode({
            context: input.context,
            source: input.source,
            sourceRecordId: sourceRecord.deterministicId,
            bucketId: 'reddit.authored-content',
            targetKind: parentKind(parentId),
            targetId: parentId,
            platformUrl: redditUrl(input.row.link),
            privacyClass: 'public'
          })
        ]
      : []),
    createStagedNode({
      kind: 'content',
      deterministicId: commentContentId,
      platform: 'reddit',
      bucketId: 'reddit.authored-content',
      source: input.source,
      sourceRecordId: sourceRecord.deterministicId,
      privacyClass: 'public',
      properties: {
        contentKind: parentId ? 'reply' : 'comment',
        platformContentKind: 'comment',
        platformContentId: commentId,
        canonicalUrl: permalink,
        platformUrl: permalink,
        authorActor: input.selfActorId,
        title: trimPreview(text, 120),
        textPreview: trimPreview(text),
        searchText: text,
        mediaKind: mediaKindFromRow(input.row),
        parentContent: parentContentId,
        publishedAt,
        observedAt: publishedAt,
        importedAt: input.context.importedAt,
        confidence: cleanString(input.row.id) ? 0.95 : 0.7,
        metadataJson: JSON.stringify({
          subreddit: cleanSubreddit(input.row.subreddit),
          gildings: numberOrUndefined(input.row.gildings),
          link: redditUrl(input.row.link),
          hasIpAddress: Boolean(cleanString(input.row.ip))
        })
      }
    }),
    createStagedNode({
      kind: 'interaction',
      deterministicId: createSocialNodeId('interaction', [
        'reddit',
        input.selfActorId,
        'comment',
        commentContentId
      ]),
      platform: 'reddit',
      bucketId: 'reddit.authored-content',
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
        confidence: 0.95
      }
    })
  ]
}

function createVoteRecords(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  row: RedditCsvRow
  index: number
  targetKind: RedditContentKind
  platformInteractionKind: string
  value?: string
}): StagedSocialRecord[] {
  const targetId = targetIdFromRow(input.row, input.targetKind, input.index)
  const sourceRecord = createSourceRecord({
    ...sourceBase(
      input,
      'reddit.votes',
      `${input.platformInteractionKind}:${targetId}:${input.index}`,
      input.row,
      'interaction',
      'private'
    )
  })
  const targetContentId = createRedditContentId(input.targetKind, targetId)

  return [
    sourceRecord,
    createContentReferenceNode({
      context: input.context,
      source: input.source,
      sourceRecordId: sourceRecord.deterministicId,
      bucketId: 'reddit.votes',
      targetKind: input.targetKind,
      targetId,
      platformUrl: redditUrl(input.row.permalink),
      title: cleanString(input.row.text) ?? targetId,
      privacyClass: 'public'
    }),
    createStagedNode({
      kind: 'interaction',
      deterministicId: createSocialNodeId('interaction', [
        'reddit',
        input.selfActorId,
        input.platformInteractionKind,
        targetContentId,
        input.value,
        input.index
      ]),
      platform: 'reddit',
      bucketId: 'reddit.votes',
      source: input.source,
      sourceRecordId: sourceRecord.deterministicId,
      privacyClass: 'private',
      properties: {
        interactionKind: 'vote',
        platformInteractionKind: input.platformInteractionKind,
        actor: input.selfActorId,
        target: targetContentId,
        targetSchema: 'SocialContent',
        targetTitle: cleanString(input.row.text) ?? targetId,
        value: input.value,
        observedAt: input.context.importedAt,
        importedAt: input.context.importedAt,
        confidence: 0.9,
        metadataJson: JSON.stringify({
          postId: cleanString(input.row.post_id),
          isPrediction: booleanOrUndefined(input.row.is_prediction),
          stakeAmount: cleanString(input.row.stake_amount)
        })
      }
    })
  ]
}

function createSavedItemRecords(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  row: RedditCsvRow
  index: number
  targetKind: RedditContentKind
  interactionKind: SocialInteractionKind
  platformInteractionKind: string
}): StagedSocialRecord[] {
  const targetId = targetIdFromRow(input.row, input.targetKind, input.index)
  const sourceRecord = createSourceRecord({
    ...sourceBase(
      input,
      'reddit.saved-hidden',
      `${input.platformInteractionKind}:${targetId}:${input.index}`,
      input.row,
      'interaction',
      'private'
    )
  })
  const targetContentId = createRedditContentId(input.targetKind, targetId)

  return [
    sourceRecord,
    createContentReferenceNode({
      context: input.context,
      source: input.source,
      sourceRecordId: sourceRecord.deterministicId,
      bucketId: 'reddit.saved-hidden',
      targetKind: input.targetKind,
      targetId,
      platformUrl: redditUrl(input.row.permalink),
      privacyClass: 'public'
    }),
    createStagedNode({
      kind: 'interaction',
      deterministicId: createSocialNodeId('interaction', [
        'reddit',
        input.selfActorId,
        input.platformInteractionKind,
        targetContentId,
        input.index
      ]),
      platform: 'reddit',
      bucketId: 'reddit.saved-hidden',
      source: input.source,
      sourceRecordId: sourceRecord.deterministicId,
      privacyClass: 'private',
      properties: {
        interactionKind: input.interactionKind,
        platformInteractionKind: input.platformInteractionKind,
        actor: input.selfActorId,
        target: targetContentId,
        targetSchema: 'SocialContent',
        targetTitle: targetId,
        observedAt: input.context.importedAt,
        importedAt: input.context.importedAt,
        confidence: 0.9
      }
    })
  ]
}

function createSubredditMembershipRecords(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  selfActorId: string
  row: RedditCsvRow
  index: number
  relationshipKind: string
}): StagedSocialRecord[] {
  const subreddit = cleanSubreddit(input.row.subreddit)
  if (!subreddit) return []

  const actorId = createSubredditActorId(subreddit)
  const collectionId = createSubredditCollectionId(subreddit)
  const sourceRecord = createSourceRecord({
    ...sourceBase(
      input,
      'reddit.subreddits',
      `${input.relationshipKind}:${subreddit}:${input.index}`,
      input.row,
      'interaction',
      'private'
    )
  })

  return [
    sourceRecord,
    createSubredditActor({
      context: input.context,
      source: input.source,
      sourceRecordId: sourceRecord.deterministicId,
      bucketId: 'reddit.subreddits',
      subreddit,
      privacyClass: 'public'
    }),
    createStagedNode({
      kind: 'collection',
      deterministicId: collectionId,
      platform: 'reddit',
      bucketId: 'reddit.subreddits',
      source: input.source,
      sourceRecordId: sourceRecord.deterministicId,
      privacyClass: 'public',
      properties: {
        collectionKind: 'subreddit',
        platformCollectionId: subreddit,
        title: `r/${subreddit}`,
        canonicalUrl: subredditUrl(subreddit),
        observedAt: input.context.importedAt
      }
    }),
    createStagedNode({
      kind: 'interaction',
      deterministicId: createSocialNodeId('interaction', [
        'reddit',
        input.selfActorId,
        input.relationshipKind,
        actorId
      ]),
      platform: 'reddit',
      bucketId: 'reddit.subreddits',
      source: input.source,
      sourceRecordId: sourceRecord.deterministicId,
      privacyClass: 'private',
      properties: {
        interactionKind: 'membership',
        platformInteractionKind: input.relationshipKind,
        actor: input.selfActorId,
        target: actorId,
        targetSchema: 'SocialActor',
        targetTitle: `r/${subreddit}`,
        observedAt: input.context.importedAt,
        importedAt: input.context.importedAt,
        confidence: 0.9
      }
    })
  ]
}

function createChatConversationRecords(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source?: ArchiveEntryRef
  selfActorId: string
  selfHandle?: string
  rows: readonly RedditCsvRow[]
  conversationKey: string
  conversationIndex: number
}): StagedSocialRecord[] {
  if (!input.source) return []
  const source = input.source

  const conversationId = createSocialNodeId('conversation', [
    'reddit',
    'chat',
    input.conversationKey || input.conversationIndex
  ])
  const participantHandles = uniqueStrings(
    input.rows.flatMap((row) => [cleanUsername(row.username)]).filter(Boolean)
  )
  const participantActorIds = [
    input.selfActorId,
    ...participantHandles
      .filter((handle) => handle !== input.selfHandle)
      .map((handle) => createRedditUserActorId(handle))
  ]
  const dates = input.rows
    .map((row) => isoOrUndefined(row.created_at))
    .filter((value): value is string => Boolean(value))
    .sort()
  const sourceRecord = createSourceRecord({
    ...sourceBase(
      { context: input.context, source },
      'reddit.messages',
      `chat:${input.conversationKey || input.conversationIndex}`,
      { rowCount: input.rows.length, firstRow: input.rows[0] },
      'conversation',
      'third-party-private'
    )
  })

  return [
    sourceRecord,
    ...participantHandles.flatMap((handle) =>
      handle === input.selfHandle
        ? []
        : [
            createRedditUserActor({
              context: input.context,
              source,
              sourceRecordId: sourceRecord.deterministicId,
              bucketId: 'reddit.messages',
              username: handle,
              privacyClass: 'third-party-private'
            })
          ]
    ),
    createStagedNode({
      kind: 'conversation',
      deterministicId: conversationId,
      platform: 'reddit',
      bucketId: 'reddit.messages',
      source,
      sourceRecordId: sourceRecord.deterministicId,
      privacyClass: 'third-party-private',
      properties: {
        conversationKind: redditConversationKind(input.rows[0]?.conversation_type),
        platformConversationId: input.conversationKey,
        title:
          cleanString(input.rows[0]?.channel_name) ?? `Reddit chat ${input.conversationIndex + 1}`,
        participantActorIdsJson: JSON.stringify(participantActorIds),
        startedAt: dates[0],
        lastMessageAt: dates.at(-1),
        messageCount: input.rows.length,
        sourceArchive: input.context.archiveId,
        metadataJson: JSON.stringify({
          subreddit: cleanSubreddit(input.rows[0]?.subreddit),
          channelUrl: cleanUrl(input.rows[0]?.channel_url),
          conversationType: cleanString(input.rows[0]?.conversation_type)
        })
      }
    }),
    ...input.rows.map((row, index) =>
      createMessageNode({
        context: input.context,
        source,
        sourceRecordId: sourceRecord.deterministicId,
        bucketId: 'reddit.messages',
        conversationId,
        row,
        index,
        messageId: cleanString(row.message_id) ?? `${input.conversationKey}:${index}`,
        text: cleanString(row.message),
        senderHandle: cleanUsername(row.username),
        selfActorId: input.selfActorId,
        selfHandle: input.selfHandle,
        sentAt: isoOrUndefined(row.created_at),
        privacyClass: 'third-party-private',
        metadata: {
          updatedAt: isoOrUndefined(row.updated_at),
          threadParentMessageId: cleanString(row.thread_parent_message_id)
        }
      })
    )
  ]
}

function createPrivateMessageConversationRecords(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source?: ArchiveEntryRef
  selfActorId: string
  selfHandle?: string
  rows: readonly RedditCsvRow[]
  conversationKey: string
  conversationIndex: number
}): StagedSocialRecord[] {
  if (!input.source) return []
  const source = input.source

  const conversationId = createSocialNodeId('conversation', [
    'reddit',
    'private-message',
    input.conversationKey || input.conversationIndex
  ])
  const participantHandles = uniqueStrings(
    input.rows.flatMap((row) => [cleanUsername(row.from), cleanUsername(row.to)]).filter(Boolean)
  )
  const participantActorIds = [
    input.selfActorId,
    ...participantHandles
      .filter((handle) => handle !== input.selfHandle)
      .map((handle) => createRedditUserActorId(handle))
  ]
  const dates = input.rows
    .map((row) => isoOrUndefined(row.date))
    .filter((value): value is string => Boolean(value))
    .sort()
  const sourceRecord = createSourceRecord({
    ...sourceBase(
      { context: input.context, source },
      'reddit.messages',
      `private-message:${input.conversationKey || input.conversationIndex}`,
      { rowCount: input.rows.length, firstRow: input.rows[0] },
      'conversation',
      'third-party-private'
    )
  })

  return [
    sourceRecord,
    ...participantHandles.flatMap((handle) =>
      handle === input.selfHandle
        ? []
        : [
            createRedditUserActor({
              context: input.context,
              source,
              sourceRecordId: sourceRecord.deterministicId,
              bucketId: 'reddit.messages',
              username: handle,
              privacyClass: 'third-party-private'
            })
          ]
    ),
    createStagedNode({
      kind: 'conversation',
      deterministicId: conversationId,
      platform: 'reddit',
      bucketId: 'reddit.messages',
      source,
      sourceRecordId: sourceRecord.deterministicId,
      privacyClass: 'third-party-private',
      properties: {
        conversationKind: 'dm',
        platformConversationId: input.conversationKey,
        title:
          cleanString(input.rows[0]?.subject) ??
          `Reddit message thread ${input.conversationIndex + 1}`,
        participantActorIdsJson: JSON.stringify(participantActorIds),
        startedAt: dates[0],
        lastMessageAt: dates.at(-1),
        messageCount: input.rows.length,
        sourceArchive: input.context.archiveId
      }
    }),
    ...input.rows.map((row, index) =>
      createMessageNode({
        context: input.context,
        source,
        sourceRecordId: sourceRecord.deterministicId,
        bucketId: 'reddit.messages',
        conversationId,
        row,
        index,
        messageId: cleanString(row.id) ?? `${input.conversationKey}:${index}`,
        text: cleanString(row.body),
        senderHandle: cleanUsername(row.from),
        selfActorId: input.selfActorId,
        selfHandle: input.selfHandle,
        sentAt: isoOrUndefined(row.date),
        privacyClass: 'third-party-private',
        metadata: {
          permalink: redditUrl(row.permalink),
          threadId: cleanString(row.thread_id),
          recipientHandle: cleanUsername(row.to),
          subject: cleanString(row.subject),
          hasIpAddress: Boolean(cleanString(row.ip))
        }
      })
    )
  ]
}

function createMessageNode(input: {
  context: Pick<SocialImportContext, 'importedAt'>
  source: ArchiveEntryRef
  sourceRecordId: string
  bucketId: string
  conversationId: string
  row: RedditCsvRow
  index: number
  messageId: string
  text?: string
  senderHandle?: string
  selfActorId: string
  selfHandle?: string
  sentAt?: string
  privacyClass: SocialPrivacyClass
  metadata?: Record<string, unknown>
}): StagedSocialRecord {
  const senderActor =
    input.senderHandle && input.senderHandle !== input.selfHandle
      ? createRedditUserActorId(input.senderHandle)
      : input.selfActorId

  return createStagedNode({
    kind: 'message',
    deterministicId: createSocialNodeId('message', [
      'reddit',
      input.conversationId,
      input.messageId
    ]),
    platform: 'reddit',
    bucketId: input.bucketId,
    source: input.source,
    sourceRecordId: input.sourceRecordId,
    privacyClass: input.privacyClass,
    properties: {
      messageKind: 'message',
      platformMessageId: input.messageId,
      conversation: input.conversationId,
      senderActor,
      senderHandle: input.senderHandle,
      textPreview: trimPreview(input.text ?? ''),
      searchText: input.text,
      sentAt: input.sentAt,
      importedAt: input.context.importedAt,
      metadataJson: JSON.stringify(input.metadata ?? {})
    }
  })
}

function createContentReferenceNode(input: {
  context: Pick<SocialImportContext, 'importedAt'>
  source: ArchiveEntryRef
  sourceRecordId: string
  bucketId: string
  targetKind: RedditContentKind
  targetId: string
  platformUrl?: string
  title?: string
  privacyClass: SocialPrivacyClass
}): StagedSocialRecord {
  const platformUrl = input.platformUrl ?? redditUrl(input.targetId)

  return createStagedNode({
    kind: 'content',
    deterministicId: createRedditContentId(input.targetKind, input.targetId),
    platform: 'reddit',
    bucketId: input.bucketId,
    source: input.source,
    sourceRecordId: input.sourceRecordId,
    privacyClass: input.privacyClass,
    properties: {
      contentKind: input.targetKind,
      platformContentKind: input.targetKind,
      platformContentId: input.targetId,
      canonicalUrl: platformUrl,
      platformUrl,
      title: input.title ?? input.targetId,
      textPreview: input.title ?? input.targetId,
      searchText: input.title,
      observedAt: input.context.importedAt,
      importedAt: input.context.importedAt,
      confidence: 0.7
    }
  })
}

function createSubredditReferenceRecords(input: {
  context: Pick<SocialImportContext, 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  sourceRecordId: string
  bucketId: string
  subreddit?: string
  privacyClass: SocialPrivacyClass
}): StagedSocialRecord[] {
  const subreddit = cleanSubreddit(input.subreddit)
  if (!subreddit) return []

  return [
    createSubredditActor({
      ...input,
      subreddit,
      privacyClass: input.privacyClass
    })
  ]
}

function createSubredditActor(input: {
  context: Pick<SocialImportContext, 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  sourceRecordId: string
  bucketId: string
  subreddit: string
  privacyClass: SocialPrivacyClass
}): StagedSocialRecord {
  return createStagedNode({
    kind: 'actor',
    deterministicId: createSubredditActorId(input.subreddit),
    platform: 'reddit',
    bucketId: input.bucketId,
    source: input.source,
    sourceRecordId: input.sourceRecordId,
    privacyClass: input.privacyClass,
    properties: {
      actorKind: 'community',
      platformActorId: input.subreddit,
      handle: `r/${input.subreddit}`,
      displayName: `r/${input.subreddit}`,
      profileUrl: subredditUrl(input.subreddit),
      observedBy: input.context.observedBy,
      observedAt: input.context.importedAt
    }
  })
}

function createRedditUserActor(input: {
  context: Pick<SocialImportContext, 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  sourceRecordId: string
  bucketId: string
  username: string
  privacyClass: SocialPrivacyClass
}): StagedSocialRecord {
  return createStagedNode({
    kind: 'actor',
    deterministicId: createRedditUserActorId(input.username),
    platform: 'reddit',
    bucketId: input.bucketId,
    source: input.source,
    sourceRecordId: input.sourceRecordId,
    privacyClass: input.privacyClass,
    properties: {
      actorKind: 'account',
      platformActorId: input.username,
      handle: input.username,
      displayName: input.username,
      profileUrl: userUrl(input.username),
      observedBy: input.context.observedBy,
      observedAt: input.context.importedAt
    }
  })
}

function createRedditSelfActorRecords(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source?: ArchiveEntryRef
  selfActorId: string
  bucketId: string
  privacyClass: SocialPrivacyClass
}): StagedSocialRecord[] {
  if (!input.source) return []

  const sourceRecord = createSourceRecord({
    ...sourceBase(
      { context: input.context, source: input.source },
      input.bucketId,
      'actor:self',
      {},
      'actor',
      input.privacyClass
    )
  })

  return [
    sourceRecord,
    createStagedNode({
      kind: 'actor',
      deterministicId: input.selfActorId,
      platform: 'reddit',
      bucketId: input.bucketId,
      source: input.source,
      sourceRecordId: sourceRecord.deterministicId,
      privacyClass: input.privacyClass,
      properties: {
        actorKind: 'account',
        displayName: 'Reddit User',
        observedBy: input.context.observedBy,
        observedAt: input.context.importedAt,
        isSelf: true
      }
    })
  ]
}

function createFileSummarySourceRecords(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId'>
  file: RedditCsvFile
  bucketId: string
  privacyClass: SocialPrivacyClass
}): StagedSocialRecord[] {
  return [
    createSourceRecord({
      ...sourceBase(
        { context: input.context, source: input.file.source },
        input.bucketId,
        `file:${input.file.source.path}`,
        summarizeCsvFile(input.file),
        metadataSourceKind(input.file.source.path),
        input.privacyClass
      )
    })
  ]
}

async function readBucketCsvFiles(
  context: SocialImportContext,
  bucket: ImportBucket,
  readTextEntry: (path: string) => Promise<string>
): Promise<RedditCsvFile[]> {
  return (
    await Promise.all(
      bucket.entryPaths.map(async (path) => {
        const source = findEntry(context.manifest, path)
        return source ? { source, rows: parseRedditCsv(await readTextEntry(path)) } : undefined
      })
    )
  ).filter((file): file is RedditCsvFile => Boolean(file))
}

function createRedditBuckets(manifest: ArchiveManifest): ImportBucket[] {
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

function hasRedditSignals(manifest: ArchiveManifest): boolean {
  const paths = new Set(manifest.entries.map((entry) => entry.path))
  return (
    paths.has('checkfile.csv') &&
    [
      'comments.csv',
      'posts.csv',
      'post_votes.csv',
      'comment_votes.csv',
      'subscribed_subreddits.csv'
    ].some((path) => paths.has(path))
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
    platform: 'reddit',
    bucketId,
    source: input.source,
    sourceRecordKind,
    sourceRecordId,
    payload,
    privacyClass
  }
}

function requireTextEntry(context: SocialImportContext): (path: string) => Promise<string> {
  if (!context.readTextEntry) {
    throw new Error('Reddit imports require readTextEntry for CSV export files')
  }
  return context.readTextEntry
}

function findEntry(manifest: ArchiveManifest, path: string): ArchiveEntryRef | undefined {
  return manifest.entries.find((entry) => entry.path === path)
}

function summarizeCsvFile(file: RedditCsvFile): Record<string, unknown> {
  return {
    path: file.source.path,
    rowCount: file.rows.length,
    headers: file.rows[0] ? Object.keys(file.rows[0]).sort() : []
  }
}

function metadataSourceKind(
  path: string
): Parameters<typeof createSourceRecord>[0]['sourceRecordKind'] {
  if (/drafts|scheduled_posts/.test(path)) return 'content'
  if (/messages_archive_headers|chat_history|messages_archive/.test(path)) return 'message'
  if (/multireddits/.test(path)) return 'collection'
  return 'account-metadata'
}

function subredditRelationshipKind(path: string): string {
  if (path === 'moderated_subreddits.csv') return 'moderator'
  if (path === 'approved_submitter_subreddits.csv') return 'approved_submitter'
  return 'subscribed'
}

function redditConversationKind(value?: string): 'dm' | 'group-dm' | 'unknown' {
  const normalized = cleanString(value)?.toLowerCase()
  if (!normalized) return 'unknown'
  if (normalized.includes('group') || normalized.includes('channel')) return 'group-dm'
  return 'dm'
}

function targetIdFromRow(row: RedditCsvRow, targetKind: RedditContentKind, index: number): string {
  return (
    cleanString(row.id) ??
    cleanString(row.post_id) ??
    tokenFromUrl(row.permalink) ??
    tokenFromUrl(row.content_link) ??
    `${targetKind}:${index}`
  )
}

function contentFallbackId(source: ArchiveEntryRef, index: number): string {
  return `${source.path}:${index}`
}

function parentKind(parentId: string): RedditContentKind {
  return parentId.startsWith('t3_') ? 'post' : 'comment'
}

function createRedditContentId(kind: RedditContentKind, id: string): string {
  return createSocialNodeId('content', ['reddit', kind, id])
}

function createRedditUserActorId(username: string): string {
  return createSocialNodeId('actor', ['reddit', 'user', normalizeHandle(username)])
}

function createSubredditActorId(subreddit: string): string {
  return createSocialNodeId('actor', ['reddit', 'subreddit', cleanSubreddit(subreddit)])
}

function createSubredditCollectionId(subreddit: string): string {
  return createSocialNodeId('collection', ['reddit', 'subreddit', cleanSubreddit(subreddit)])
}

function inferSelfHandle(files: readonly RedditCsvFile[]): string | undefined {
  const usernames = files
    .filter((file) => file.source.path === 'messages_archive.csv')
    .flatMap((file) => file.rows.flatMap((row) => [cleanUsername(row.from), cleanUsername(row.to)]))
    .filter((value): value is string => Boolean(value))
  if (usernames.length === 0) return undefined

  const counts = usernames.reduce<Record<string, number>>(
    (acc, username) => ({ ...acc, [username]: (acc[username] ?? 0) + 1 }),
    {}
  )
  return Object.entries(counts).sort(([, left], [, right]) => right - left)[0]?.[0]
}

function groupBy<T>(
  items: readonly T[],
  getKey: (item: T) => string | undefined
): Map<string, T[]> {
  return items.reduce((groups, item, index) => {
    const key = getKey(item) || `group:${index}`
    return groups.set(key, [...(groups.get(key) ?? []), item])
  }, new Map<string, T[]>())
}

function uniqueStrings(values: readonly (string | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function cleanString(value?: string | null): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function cleanUsername(value?: string | null): string | undefined {
  const text = cleanString(value)
  if (!text || text === '[deleted]') return undefined
  return normalizeHandle(text)
}

function cleanSubreddit(value?: string | null): string | undefined {
  const text = cleanString(value)
  if (!text) return undefined
  return normalizeHandle(text.replace(/^\/?r\//i, ''))
}

function cleanUrl(value?: string | null): string | undefined {
  const text = cleanString(value)
  if (!text || !/^https?:\/\//i.test(text)) return undefined
  return normalizeUrl(text)
}

function redditUrl(value?: string | null): string | undefined {
  const text = cleanString(value)
  if (!text) return undefined
  if (/^https?:\/\//i.test(text)) return normalizeUrl(text)
  if (text.startsWith('/')) return normalizeUrl(`https://www.reddit.com${text}`)
  return undefined
}

function subredditUrl(subreddit: string): string {
  return `https://www.reddit.com/r/${encodeURIComponent(subreddit)}`
}

function userUrl(username: string): string {
  return `https://www.reddit.com/user/${encodeURIComponent(username)}`
}

function tokenFromUrl(value?: string | null): string | undefined {
  const text = cleanString(value)
  if (!text) return undefined
  const parts = text.split('/').filter(Boolean)
  return parts.at(-1)
}

function mediaKindFromRow(row: RedditCsvRow): string | undefined {
  if (cleanString(row.media)) return 'media'
  if (cleanUrl(row.url)) return 'link'
  return undefined
}

function isoOrUndefined(value?: string): string | undefined {
  const text = cleanString(value)
  if (!text) return undefined
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function numberOrUndefined(value?: string): number | undefined {
  const text = cleanString(value)
  if (!text) return undefined
  const number = Number(text)
  return Number.isFinite(number) ? number : undefined
}

function booleanOrUndefined(value?: string): boolean | undefined {
  const text = cleanString(value)?.toLowerCase()
  if (text === 'true') return true
  if (text === 'false') return false
  return undefined
}

function trimPreview(value: string, maxLength = 5000): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value
}
