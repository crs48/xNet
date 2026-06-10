/**
 * Grok export importer.
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
  getBucketDefaultSelected
} from '../import/core'

export const GROK_ADAPTER_ID = 'grok'
export const GROK_ADAPTER_VERSION = '0.1.0'

type GrokBackendExport = {
  conversations?: GrokConversationExport[]
  media_posts?: GrokMediaPostExport[]
  projects?: GrokProjectExport[]
  tasks?: GrokTaskExport[]
}

type GrokConversationExport = {
  conversation?: {
    id?: string
    title?: string
    create_time?: string
    modify_time?: string
    starred?: boolean
    temporary?: boolean
    asset_ids?: string[]
    media_types?: string[]
    root_asset_id?: string
    task_result_id?: string
  }
  responses?: Array<{
    response?: {
      _id?: string
      conversation_id?: string
      create_time?: string
      message?: string
      metadata?: Record<string, unknown> | null
      model?: string
      sender?: string
    }
    share_link?: string
  }>
}

type GrokMediaPostExport = {
  id?: string
  create_time?: string
  link?: string
  media_type?: string
  original_prompt?: string
  user_id?: string
}

type GrokProjectExport = {
  id?: string
  title?: string
  name?: string
  create_time?: string
}

type GrokTaskExport = {
  id?: string
  title?: string
  create_time?: string
  [key: string]: unknown
}

const bucketPatterns: Array<{ id: string; label: string; pattern: RegExp; description: string }> = [
  {
    id: 'grok.conversations',
    label: 'Conversations',
    pattern: /prod-grok-backend\.json$/,
    description:
      'AI conversations, prompts, responses, citations, projects, tasks, and media post records.'
  },
  {
    id: 'grok.assets',
    label: 'Assets',
    pattern: /prod-mc-asset-server\/.*\/(content|thumbnail|[^/]+\.(webp|png|jpe?g))$/i,
    description: 'Generated media and attachment blobs referenced by Grok records.'
  },
  {
    id: 'grok.account-metadata',
    label: 'Account Metadata',
    pattern: /prod-mc-auth-mgmt-api\.json$/,
    description: 'Auth/session/team metadata excluded by default.'
  },
  {
    id: 'grok.billing',
    label: 'Billing',
    pattern: /prod-mc-billing\.json$/,
    description: 'Billing metadata excluded by default.'
  }
]

export const grokAdapter: SocialImportAdapter = {
  id: GROK_ADAPTER_ID,
  version: GROK_ADAPTER_VERSION,
  platform: 'grok',
  detect: (manifest) => (hasGrokSignals(manifest) ? 0.95 : 0),
  probe: ({ manifest }) => ({
    adapterId: GROK_ADAPTER_ID,
    adapterVersion: GROK_ADAPTER_VERSION,
    platform: 'grok',
    confidence: hasGrokSignals(manifest) ? 0.95 : 0,
    buckets: createGrokBuckets(manifest),
    warnings: []
  }),
  stage: stageGrokArchive
}

export async function* stageGrokArchive(
  context: SocialImportContext,
  selection: ImportSelection = {}
): AsyncIterable<StagedSocialRecord> {
  const selectedBuckets = resolveSelectedBuckets(createGrokBuckets(context.manifest), selection)
  for (const bucket of selectedBuckets) {
    for (const path of bucket.entryPaths) {
      const source = findEntry(context.manifest, path)
      if (!source) continue

      if (bucket.id === 'grok.conversations') {
        const backend = await context.readJsonEntry<GrokBackendExport>(path)
        yield* mapGrokBackend({ context, source, input: backend })
      } else if (bucket.id === 'grok.assets') {
        yield createSourceRecord({
          archiveId: context.archiveId,
          importRunId: context.importRunId,
          platform: 'grok',
          bucketId: 'grok.assets',
          source,
          sourceRecordKind: 'media',
          sourceRecordId: `asset:${path}`,
          payload: { path, byteSize: source.byteSize, sha256: source.sha256 },
          privacyClass: 'private'
        })
      }
    }
  }
}

export function mapGrokBackend(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  input: GrokBackendExport
}): StagedSocialRecord[] {
  const selfActorId = createSocialNodeId('actor', [
    'grok',
    'self',
    input.context.observedBy ?? input.context.archiveId
  ])
  const assistantActorId = createSocialNodeId('actor', ['grok', 'assistant'])
  const actorSource = createSourceRecord({
    ...sourceBase(input, 'grok.conversations', 'actors:self-and-assistant', {}, 'actor', 'private')
  })

  return [
    actorSource,
    createStagedNode({
      kind: 'actor',
      deterministicId: selfActorId,
      platform: 'grok',
      bucketId: 'grok.conversations',
      source: input.source,
      sourceRecordId: actorSource.deterministicId,
      privacyClass: 'private',
      properties: {
        actorKind: 'person',
        platformActorId: 'self',
        displayName: 'Self',
        observedBy: input.context.observedBy,
        observedAt: input.context.importedAt,
        isSelf: true
      }
    }),
    createStagedNode({
      kind: 'actor',
      deterministicId: assistantActorId,
      platform: 'grok',
      bucketId: 'grok.conversations',
      source: input.source,
      sourceRecordId: actorSource.deterministicId,
      privacyClass: 'private',
      properties: {
        actorKind: 'ai-assistant',
        platformActorId: 'grok',
        handle: 'grok',
        displayName: 'Grok',
        observedBy: input.context.observedBy,
        observedAt: input.context.importedAt
      }
    }),
    ...(input.input.conversations ?? []).flatMap((conversation, index) =>
      mapGrokConversation({ ...input, conversation, index, selfActorId, assistantActorId })
    ),
    ...(input.input.media_posts ?? []).flatMap((mediaPost, index) =>
      mapGrokMediaPost({ ...input, mediaPost, index, selfActorId })
    ),
    ...(input.input.projects ?? []).flatMap((project, index) =>
      mapGrokProject({ ...input, project, index, selfActorId })
    ),
    ...(input.input.tasks ?? []).flatMap((task, index) =>
      mapGrokTask({ ...input, task, index, selfActorId })
    )
  ]
}

function mapGrokConversation(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  conversation: GrokConversationExport
  index: number
  selfActorId: string
  assistantActorId: string
}): StagedSocialRecord[] {
  const conversation = input.conversation.conversation ?? {}
  const responses = input.conversation.responses ?? []
  const sourceRecordId = `conversation:${conversation.id ?? input.index}`
  const sourceRecord = createSourceRecord({
    ...sourceBase(
      input,
      'grok.conversations',
      sourceRecordId,
      input.conversation,
      'conversation',
      'private'
    )
  })
  const conversationId = createSocialNodeId('conversation', [
    'grok',
    conversation.id ?? input.index
  ])

  return [
    sourceRecord,
    createStagedNode({
      kind: 'conversation',
      deterministicId: conversationId,
      platform: 'grok',
      bucketId: 'grok.conversations',
      source: input.source,
      sourceRecordId: sourceRecord.deterministicId,
      privacyClass: 'private',
      properties: {
        conversationKind: 'ai-chat',
        platformConversationId: conversation.id,
        title: conversation.title,
        participantActorIdsJson: JSON.stringify([input.selfActorId, input.assistantActorId]),
        startedAt: conversation.create_time,
        lastMessageAt: conversation.modify_time,
        messageCount: responses.length,
        starred: Boolean(conversation.starred),
        temporary: Boolean(conversation.temporary),
        metadataJson: JSON.stringify({
          assetIds: conversation.asset_ids ?? [],
          mediaTypes: conversation.media_types ?? [],
          rootAssetId: conversation.root_asset_id,
          taskResultId: conversation.task_result_id
        })
      }
    }),
    ...responses.flatMap((responseWrapper, responseIndex) => {
      const response = responseWrapper.response ?? {}
      const sender = normalizeGrokSender(response.sender)
      const messageKind = sender === 'human' ? 'prompt' : 'ai-response'
      const senderActor = sender === 'human' ? input.selfActorId : input.assistantActorId
      const messageId = createSocialNodeId('message', [
        'grok',
        conversationId,
        response._id ?? responseIndex
      ])
      const text = response.message ?? ''
      const citations = extractGrokCitations(response.metadata)
      return [
        createStagedNode({
          kind: 'message',
          deterministicId: messageId,
          platform: 'grok',
          bucketId: 'grok.conversations',
          source: input.source,
          sourceRecordId: sourceRecord.deterministicId,
          privacyClass: 'private',
          properties: {
            messageKind,
            platformMessageId: response._id,
            conversation: conversationId,
            senderActor,
            senderHandle: sender,
            model: response.model,
            textPreview: trimPreview(text),
            searchText: text,
            externalRefsJson: JSON.stringify(citations),
            sentAt: response.create_time,
            importedAt: input.context.importedAt,
            metadataJson: JSON.stringify({
              sender: response.sender,
              shareLink: responseWrapper.share_link,
              metadataKeys: response.metadata ? Object.keys(response.metadata) : []
            })
          }
        }),
        createStagedNode({
          kind: 'interaction',
          deterministicId: createSocialNodeId('interaction', [
            'grok',
            senderActor,
            messageKind,
            messageId
          ]),
          platform: 'grok',
          bucketId: 'grok.conversations',
          source: input.source,
          sourceRecordId: sourceRecord.deterministicId,
          privacyClass: 'private',
          properties: {
            interactionKind: messageKind === 'prompt' ? 'prompt' : 'generation',
            platformInteractionKind: messageKind,
            actor: senderActor,
            target: messageId,
            targetSchema: 'SocialMessage',
            targetTitle: conversation.title,
            observedAt: response.create_time,
            importedAt: input.context.importedAt,
            confidence: 0.95
          }
        }),
        ...citations.map((citation, citationIndex) =>
          createStagedNode({
            kind: 'interaction',
            deterministicId: createSocialNodeId('interaction', [
              'grok',
              messageId,
              'cited',
              citation.url,
              citationIndex
            ]),
            platform: 'grok',
            bucketId: 'grok.conversations',
            source: input.source,
            sourceRecordId: sourceRecord.deterministicId,
            privacyClass: 'private',
            properties: {
              interactionKind: 'cited',
              platformInteractionKind: 'web_citation',
              actor: input.assistantActorId,
              target: messageId,
              targetSchema: 'SocialMessage',
              targetTitle: citation.title ?? citation.url,
              value: citation.url,
              observedAt: response.create_time,
              importedAt: input.context.importedAt,
              confidence: 0.7
            }
          })
        )
      ]
    })
  ]
}

function mapGrokMediaPost(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'importedAt'>
  source: ArchiveEntryRef
  mediaPost: GrokMediaPostExport
  index: number
  selfActorId: string
}): StagedSocialRecord[] {
  const sourceRecordId = `media-post:${input.mediaPost.id ?? input.index}`
  const sourceRecord = createSourceRecord({
    ...sourceBase(
      input,
      'grok.conversations',
      sourceRecordId,
      input.mediaPost,
      'content',
      'private'
    )
  })
  const contentId = createSocialNodeId('content', [
    'grok',
    'media-post',
    input.mediaPost.id ?? input.index
  ])

  return [
    sourceRecord,
    createStagedNode({
      kind: 'content',
      deterministicId: contentId,
      platform: 'grok',
      bucketId: 'grok.conversations',
      source: input.source,
      sourceRecordId: sourceRecord.deterministicId,
      privacyClass: 'private',
      properties: {
        contentKind: 'generated-media',
        platformContentKind: 'media_post',
        platformContentId: input.mediaPost.id,
        canonicalUrl: input.mediaPost.link,
        platformUrl: input.mediaPost.link,
        authorActor: input.selfActorId,
        title: input.mediaPost.original_prompt,
        textPreview: trimPreview(input.mediaPost.original_prompt ?? ''),
        searchText: input.mediaPost.original_prompt,
        mediaKind: input.mediaPost.media_type,
        observedAt: input.mediaPost.create_time,
        publishedAt: input.mediaPost.create_time,
        importedAt: input.context.importedAt,
        metadataJson: JSON.stringify(input.mediaPost)
      }
    })
  ]
}

function mapGrokProject(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'importedAt'>
  source: ArchiveEntryRef
  project: GrokProjectExport
  index: number
  selfActorId: string
}): StagedSocialRecord[] {
  const sourceRecordId = `project:${input.project.id ?? input.index}`
  const sourceRecord = createSourceRecord({
    ...sourceBase(
      input,
      'grok.conversations',
      sourceRecordId,
      input.project,
      'collection',
      'private'
    )
  })
  const collectionId = createSocialNodeId('collection', [
    'grok',
    'project',
    input.project.id ?? input.index
  ])

  return [
    sourceRecord,
    createStagedNode({
      kind: 'collection',
      deterministicId: collectionId,
      platform: 'grok',
      bucketId: 'grok.conversations',
      source: input.source,
      sourceRecordId: sourceRecord.deterministicId,
      privacyClass: 'private',
      properties: {
        collectionKind: 'project',
        platformCollectionId: input.project.id,
        title: input.project.title ?? input.project.name ?? 'Grok Project',
        ownerActor: input.selfActorId,
        observedAt: input.project.create_time ?? input.context.importedAt,
        metadataJson: JSON.stringify(input.project)
      }
    })
  ]
}

function mapGrokTask(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'importedAt'>
  source: ArchiveEntryRef
  task: GrokTaskExport
  index: number
  selfActorId: string
}): StagedSocialRecord[] {
  const sourceRecordId = `task:${input.task.id ?? input.index}`
  const sourceRecord = createSourceRecord({
    ...sourceBase(input, 'grok.conversations', sourceRecordId, input.task, 'content', 'private')
  })
  const contentId = createSocialNodeId('content', ['grok', 'task', input.task.id ?? input.index])

  return [
    sourceRecord,
    createStagedNode({
      kind: 'content',
      deterministicId: contentId,
      platform: 'grok',
      bucketId: 'grok.conversations',
      source: input.source,
      sourceRecordId: sourceRecord.deterministicId,
      privacyClass: 'private',
      properties: {
        contentKind: 'unknown',
        platformContentKind: 'task',
        platformContentId: input.task.id,
        authorActor: input.selfActorId,
        title: input.task.title,
        textPreview: trimPreview(input.task.title ?? ''),
        observedAt: String(input.task.create_time ?? input.context.importedAt),
        importedAt: input.context.importedAt,
        metadataJson: JSON.stringify(input.task)
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
    platform: 'grok',
    bucketId,
    source: input.source,
    sourceRecordKind,
    sourceRecordId,
    payload,
    privacyClass
  }
}

function createGrokBuckets(manifest: ArchiveManifest): ImportBucket[] {
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

function hasGrokSignals(manifest: ArchiveManifest): boolean {
  return manifest.entries.some((entry) =>
    /prod-grok-backend\.json|prod-mc-asset-server/.test(entry.path)
  )
}

function findEntry(manifest: ArchiveManifest, path: string): ArchiveEntryRef | undefined {
  return manifest.entries.find((entry) => entry.path === path)
}

function normalizeGrokSender(sender?: string): 'human' | 'assistant' {
  const normalized = sender?.trim().toLowerCase()
  return normalized === 'human' ? 'human' : 'assistant'
}

function extractGrokCitations(metadata: Record<string, unknown> | null | undefined): Array<{
  url?: string
  title?: string
}> {
  if (!metadata) return []
  const candidateValues = [
    metadata.web_search_results,
    metadata.search_results,
    metadata.citations,
    metadata.references
  ]
  return candidateValues.flatMap((candidate) => {
    if (!Array.isArray(candidate)) return []
    return candidate.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const record = item as Record<string, unknown>
      const url = stringValue(record.url) ?? stringValue(record.link)
      if (!url) return []
      return [{ url, title: stringValue(record.title) }]
    })
  })
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function trimPreview(value: string): string {
  return value.length > 5000 ? `${value.slice(0, 4997)}...` : value
}
