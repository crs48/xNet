/**
 * OpenAI ChatGPT export importer.
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
import type { SocialPrivacyClass, SocialSourceRecordKind } from '../schemas'
import {
  createSocialNodeId,
  createSourceRecord,
  createStagedNode,
  normalizeUrl
} from '../import/core'

export const OPENAI_ADAPTER_ID = 'openai'
export const OPENAI_ADAPTER_VERSION = '0.1.0'

type OpenAIBucketPattern = {
  id: string
  label: string
  pattern: RegExp
  description: string
  privacyClass: SocialPrivacyClass
}

type OpenAIUser = {
  id?: string
  email?: string
  phone_number?: string
  birth_year?: number
  chatgpt_plus_user?: boolean
}

type OpenAIConversationFile = {
  source: ArchiveEntryRef
  conversations: readonly OpenAIConversation[]
}

type OpenAIConversation = {
  id?: string
  conversation_id?: string
  title?: string
  create_time?: OpenAITimestamp
  update_time?: OpenAITimestamp
  current_node?: string | null
  mapping?: Record<string, OpenAIConversationNode | null>
  default_model_slug?: string
  conversation_template_id?: string | null
  is_archived?: boolean
  is_do_not_remember?: boolean
  is_read_only?: boolean
  is_starred?: boolean
  is_study_mode?: boolean
  memory_scope?: string | null
  pinned_time?: OpenAITimestamp | null
  plugin_ids?: unknown[]
  voice?: unknown
}

type OpenAIConversationNode = {
  id?: string
  message?: OpenAIMessage | null
  parent?: string | null
  children?: string[]
}

type OpenAIMessage = {
  id?: string
  author?: {
    role?: string
    name?: string | null
  }
  create_time?: OpenAITimestamp | null
  update_time?: OpenAITimestamp | null
  content?: OpenAIMessageContent
  status?: string
  end_turn?: boolean
  weight?: number
  metadata?: Record<string, unknown>
  recipient?: string
  channel?: string
}

type OpenAIMessageContent = {
  content_type?: string
  parts?: unknown[]
  text?: string
  content?: unknown
  thoughts?: unknown[]
  source_analysis_msg_id?: string
}

type OpenAIMessageNode = {
  nodeId: string
  node: OpenAIConversationNode
  message: OpenAIMessage
  index: number
}

type OpenAIFeedback = {
  id?: string
  conversation_id?: string
  message_id?: string
  rating?: string
  content?: string
  create_time?: OpenAITimestamp
  update_time?: OpenAITimestamp
  user_id?: string
  workspace_id?: string | null
}

type OpenAISharedConversation = {
  id?: string
  conversation_id?: string
  title?: string
  is_anonymous?: boolean
}

type OpenAITimestamp = number | string

type OpenAICitationRef = {
  url: string
  title?: string
}

const bucketPatterns: OpenAIBucketPattern[] = [
  {
    id: 'openai.profile',
    label: 'Profile',
    pattern: /^user\.json$/,
    description:
      'ChatGPT account actor. Email address, phone number, and birth year are not copied to canonical actor nodes.',
    privacyClass: 'private'
  },
  {
    id: 'openai.conversations',
    label: 'Conversations',
    pattern: /^conversations(?:-\d+)?\.json$/,
    description:
      'ChatGPT conversations, prompts, assistant responses, citations, and model metadata.',
    privacyClass: 'private'
  },
  {
    id: 'openai.feedback-shares',
    label: 'Feedback And Shared Conversations',
    pattern: /^(message_feedback|shared_conversations)\.json$/,
    description: 'Message feedback ratings and shared ChatGPT conversation links.',
    privacyClass: 'private'
  },
  {
    id: 'openai.assets',
    label: 'Files And Assets',
    pattern: /^(conversation_asset_file_names|library_files)\.json$|^file[-_].+\.dat$/i,
    description: 'Uploaded or generated files and filename metadata referenced by conversations.',
    privacyClass: 'private'
  },
  {
    id: 'openai.rendered-html',
    label: 'Rendered Chat HTML',
    pattern: /^chat\.html$/,
    description: 'Rendered HTML transcript export. Stored as provenance only when selected.',
    privacyClass: 'private'
  },
  {
    id: 'openai.account-metadata',
    label: 'Account Metadata',
    pattern: /^(user_settings|export_manifest)\.json$/,
    description: 'Settings and export manifest metadata excluded by default.',
    privacyClass: 'account-security'
  }
]

export const openaiAdapter: SocialImportAdapter = {
  id: OPENAI_ADAPTER_ID,
  version: OPENAI_ADAPTER_VERSION,
  platform: 'openai',
  detect: (manifest) => (hasOpenAISignals(manifest) ? 0.95 : 0),
  probe: ({ manifest }) => ({
    adapterId: OPENAI_ADAPTER_ID,
    adapterVersion: OPENAI_ADAPTER_VERSION,
    platform: 'openai',
    confidence: hasOpenAISignals(manifest) ? 0.95 : 0,
    buckets: createOpenAIBuckets(manifest),
    warnings: []
  }),
  stage: stageOpenAIArchive
}

export async function* stageOpenAIArchive(
  context: SocialImportContext,
  selection: ImportSelection = {}
): AsyncIterable<StagedSocialRecord> {
  const selectedBuckets = resolveSelectedBuckets(createOpenAIBuckets(context.manifest), selection)
  const userEntry = findEntry(context.manifest, 'user.json')
  const user = userEntry ? await context.readJsonEntry<OpenAIUser>(userEntry.path) : undefined
  const selfActorId = createOpenAISelfActorId(context, user)
  const assistantActorId = createSocialNodeId('actor', ['openai', 'assistant'])

  for (const bucket of selectedBuckets) {
    if (bucket.id === 'openai.profile') {
      if (!userEntry || !user) continue
      yield* mapOpenAIProfile({
        context,
        source: userEntry,
        user,
        selfActorId
      })
      continue
    }

    if (bucket.id === 'openai.conversations') {
      const files = await Promise.all(
        bucket.entryPaths.flatMap((path) => {
          const source = findEntry(context.manifest, path)
          if (!source) return []
          return [
            context
              .readJsonEntry<OpenAIConversation[]>(path)
              .then((conversations): OpenAIConversationFile => ({ source, conversations }))
          ]
        })
      )
      yield* mapOpenAIConversations({
        context,
        files,
        selfActorId,
        assistantActorId
      })
      continue
    }

    if (bucket.id === 'openai.feedback-shares') {
      for (const path of bucket.entryPaths) {
        const source = findEntry(context.manifest, path)
        if (!source) continue
        if (path === 'message_feedback.json') {
          yield* mapOpenAIFeedback({
            context,
            source,
            feedback: await context.readJsonEntry<OpenAIFeedback[]>(path),
            selfActorId
          })
        } else if (path === 'shared_conversations.json') {
          yield* mapOpenAISharedConversations({
            context,
            source,
            shares: await context.readJsonEntry<OpenAISharedConversation[]>(path),
            selfActorId
          })
        }
      }
      continue
    }

    if (bucket.id === 'openai.assets') {
      const assetNames = await readAssetFileNames(context, bucket.entryPaths)
      yield* mapOpenAIAssets({
        context,
        sources: bucket.entryPaths.flatMap((path) => {
          const source = findEntry(context.manifest, path)
          return source ? [source] : []
        }),
        assetFileNames: assetNames
      })
      continue
    }

    if (bucket.id === 'openai.rendered-html' || bucket.id === 'openai.account-metadata') {
      for (const path of bucket.entryPaths) {
        const source = findEntry(context.manifest, path)
        if (!source) continue
        yield createSourceRecord({
          ...sourceBase(
            { context, source },
            bucket.id,
            `${bucket.id}:${path}`,
            summarizeEntry(source),
            bucket.id === 'openai.account-metadata' ? 'account-metadata' : 'unknown',
            bucket.privacyClass
          )
        })
      }
    }
  }
}

export function mapOpenAIProfile(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  user: OpenAIUser
  selfActorId: string
}): StagedSocialRecord[] {
  const sourceRecord = createSourceRecord({
    ...sourceBase(
      input,
      'openai.profile',
      `profile:${input.user.id ?? 'self'}`,
      input.user,
      'actor',
      'private'
    )
  })

  return [
    sourceRecord,
    createStagedNode({
      kind: 'actor',
      deterministicId: input.selfActorId,
      platform: 'openai',
      bucketId: 'openai.profile',
      source: input.source,
      sourceRecordId: sourceRecord.deterministicId,
      privacyClass: 'private',
      properties: {
        actorKind: 'account',
        platformActorId: input.user.id,
        displayName: 'ChatGPT User',
        observedBy: input.context.observedBy,
        observedAt: input.context.importedAt,
        isSelf: true,
        metadataJson: JSON.stringify({
          hasEmailAddress: Boolean(cleanString(input.user.email)),
          hasPhoneNumber: Boolean(cleanString(input.user.phone_number)),
          hasBirthYear: typeof input.user.birth_year === 'number',
          chatgptPlusUser: input.user.chatgpt_plus_user
        })
      }
    })
  ]
}

export function mapOpenAIConversations(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  files: readonly OpenAIConversationFile[]
  selfActorId: string
  assistantActorId: string
}): StagedSocialRecord[] {
  const firstSource = input.files[0]?.source
  if (!firstSource) return []

  const actorSource = createSourceRecord({
    ...sourceBase(
      { context: input.context, source: firstSource },
      'openai.conversations',
      'actors:self-and-assistant',
      {
        fileCount: input.files.length,
        conversationCount: input.files.reduce((total, file) => total + file.conversations.length, 0)
      },
      'actor',
      'private'
    )
  })

  return [
    actorSource,
    createStagedNode({
      kind: 'actor',
      deterministicId: input.selfActorId,
      platform: 'openai',
      bucketId: 'openai.conversations',
      source: firstSource,
      sourceRecordId: actorSource.deterministicId,
      privacyClass: 'private',
      properties: {
        actorKind: 'account',
        platformActorId: 'self',
        displayName: 'Self',
        observedBy: input.context.observedBy,
        observedAt: input.context.importedAt,
        isSelf: true
      }
    }),
    createStagedNode({
      kind: 'actor',
      deterministicId: input.assistantActorId,
      platform: 'openai',
      bucketId: 'openai.conversations',
      source: firstSource,
      sourceRecordId: actorSource.deterministicId,
      privacyClass: 'private',
      properties: {
        actorKind: 'ai-assistant',
        platformActorId: 'chatgpt',
        handle: 'chatgpt',
        displayName: 'ChatGPT',
        observedBy: input.context.observedBy,
        observedAt: input.context.importedAt
      }
    }),
    ...input.files.flatMap((file) =>
      file.conversations.flatMap((conversation, index) =>
        mapOpenAIConversation({
          context: input.context,
          source: file.source,
          conversation,
          index,
          selfActorId: input.selfActorId,
          assistantActorId: input.assistantActorId
        })
      )
    )
  ]
}

export function mapOpenAIFeedback(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'importedAt'>
  source: ArchiveEntryRef
  feedback: readonly OpenAIFeedback[]
  selfActorId: string
}): StagedSocialRecord[] {
  return input.feedback.flatMap((feedback, index) => {
    const sourceRecordId = `feedback:${feedback.id ?? index}`
    const sourceRecord = createSourceRecord({
      ...sourceBase(
        input,
        'openai.feedback-shares',
        sourceRecordId,
        feedback,
        'interaction',
        'private'
      )
    })
    const conversationPlatformId = feedback.conversation_id ?? `unknown:${index}`
    const target = feedback.message_id
      ? createSocialNodeId('message', ['openai', conversationPlatformId, feedback.message_id])
      : createSocialNodeId('conversation', ['openai', conversationPlatformId])
    const observedAt = isoOrUndefined(feedback.create_time)

    return [
      sourceRecord,
      createStagedNode({
        kind: 'interaction',
        deterministicId: createSocialNodeId('interaction', [
          'openai',
          'feedback',
          feedback.id ?? index
        ]),
        platform: 'openai',
        bucketId: 'openai.feedback-shares',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'private',
        properties: {
          interactionKind: 'reaction',
          platformInteractionKind: 'message_feedback',
          actor: input.selfActorId,
          target,
          targetSchema: feedback.message_id ? 'SocialMessage' : 'SocialConversation',
          targetTitle: feedback.rating,
          value: feedback.rating,
          observedAt,
          importedAt: input.context.importedAt,
          confidence: 0.85,
          metadataJson: JSON.stringify({
            conversationId: feedback.conversation_id,
            hasContent: Boolean(cleanString(feedback.content)),
            updateTime: isoOrUndefined(feedback.update_time),
            userIdPresent: Boolean(cleanString(feedback.user_id)),
            workspaceIdPresent: Boolean(cleanString(feedback.workspace_id))
          })
        }
      })
    ]
  })
}

export function mapOpenAISharedConversations(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'importedAt'>
  source: ArchiveEntryRef
  shares: readonly OpenAISharedConversation[]
  selfActorId: string
}): StagedSocialRecord[] {
  return input.shares.flatMap((share, index) => {
    const shareId = share.id ?? `share:${index}`
    const sourceRecord = createSourceRecord({
      ...sourceBase(
        input,
        'openai.feedback-shares',
        `shared-conversation:${shareId}`,
        share,
        'content',
        'private'
      )
    })
    const url = createChatGPTShareUrl(share.id)
    const contentId = createSocialNodeId('content', ['openai', 'shared-conversation', shareId])

    return [
      sourceRecord,
      createStagedNode({
        kind: 'content',
        deterministicId: contentId,
        platform: 'openai',
        bucketId: 'openai.feedback-shares',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'private',
        properties: {
          contentKind: 'link',
          platformContentKind: 'shared_conversation',
          platformContentId: share.id,
          canonicalUrl: url,
          platformUrl: url,
          title: cleanString(share.title) ?? 'Shared ChatGPT conversation',
          importedAt: input.context.importedAt,
          confidence: 0.85,
          metadataJson: JSON.stringify({
            conversationId: share.conversation_id,
            isAnonymous: share.is_anonymous
          })
        }
      }),
      createStagedNode({
        kind: 'interaction',
        deterministicId: createSocialNodeId('interaction', [
          'openai',
          'shared-conversation',
          shareId
        ]),
        platform: 'openai',
        bucketId: 'openai.feedback-shares',
        source: input.source,
        sourceRecordId: sourceRecord.deterministicId,
        privacyClass: 'private',
        properties: {
          interactionKind: 'share',
          platformInteractionKind: 'shared_conversation',
          actor: input.selfActorId,
          target: contentId,
          targetSchema: 'SocialContent',
          targetTitle: cleanString(share.title) ?? url,
          importedAt: input.context.importedAt,
          confidence: 0.85
        }
      })
    ]
  })
}

export function mapOpenAIAssets(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId'>
  sources: readonly ArchiveEntryRef[]
  assetFileNames?: Readonly<Record<string, string>>
}): StagedSocialRecord[] {
  return input.sources.map((source) =>
    createSourceRecord({
      ...sourceBase(
        { context: input.context, source },
        'openai.assets',
        `asset:${source.path}`,
        {
          ...summarizeEntry(source),
          originalFileName: cleanString(input.assetFileNames?.[source.path]),
          assetNameCount:
            source.path === 'conversation_asset_file_names.json'
              ? Object.keys(input.assetFileNames ?? {}).length
              : undefined
        },
        'media',
        'private'
      )
    })
  )
}

function mapOpenAIConversation(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'importedAt'>
  source: ArchiveEntryRef
  conversation: OpenAIConversation
  index: number
  selfActorId: string
  assistantActorId: string
}): StagedSocialRecord[] {
  const conversation = input.conversation
  const platformConversationId = conversation.conversation_id ?? conversation.id ?? input.index
  const conversationId = createSocialNodeId('conversation', ['openai', platformConversationId])
  const messages = collectMessageNodes(conversation)
  const sourceRecord = createSourceRecord({
    ...sourceBase(
      input,
      'openai.conversations',
      `conversation:${platformConversationId}`,
      conversation,
      'conversation',
      'private'
    )
  })

  return [
    sourceRecord,
    createStagedNode({
      kind: 'conversation',
      deterministicId: conversationId,
      platform: 'openai',
      bucketId: 'openai.conversations',
      source: input.source,
      sourceRecordId: sourceRecord.deterministicId,
      privacyClass: 'private',
      properties: {
        conversationKind: 'ai-chat',
        platformConversationId: String(platformConversationId),
        title: cleanString(conversation.title) ?? `ChatGPT conversation ${input.index + 1}`,
        participantActorIdsJson: JSON.stringify([input.selfActorId, input.assistantActorId]),
        startedAt: isoOrUndefined(conversation.create_time),
        lastMessageAt: isoOrUndefined(conversation.update_time),
        messageCount: messages.length,
        starred: Boolean(conversation.is_starred),
        sourceArchive: input.context.archiveId,
        metadataJson: JSON.stringify({
          currentNode: conversation.current_node,
          defaultModelSlug: cleanString(conversation.default_model_slug),
          conversationTemplateId: cleanString(conversation.conversation_template_id),
          isArchived: conversation.is_archived,
          isDoNotRemember: conversation.is_do_not_remember,
          isReadOnly: conversation.is_read_only,
          isStudyMode: conversation.is_study_mode,
          memoryScope: cleanString(conversation.memory_scope),
          pinnedAt: isoOrUndefined(conversation.pinned_time),
          pluginCount: conversation.plugin_ids?.length ?? 0,
          hasVoice: Boolean(conversation.voice)
        })
      }
    }),
    ...messages.flatMap((messageNode) =>
      mapOpenAIMessage({
        context: input.context,
        source: input.source,
        conversation,
        conversationId,
        platformConversationId: String(platformConversationId),
        sourceRecordId: sourceRecord.deterministicId,
        messageNode,
        selfActorId: input.selfActorId,
        assistantActorId: input.assistantActorId
      })
    )
  ]
}

function mapOpenAIMessage(input: {
  context: Pick<SocialImportContext, 'importedAt'>
  source: ArchiveEntryRef
  conversation: OpenAIConversation
  conversationId: string
  platformConversationId: string
  sourceRecordId: string
  messageNode: OpenAIMessageNode
  selfActorId: string
  assistantActorId: string
}): StagedSocialRecord[] {
  const message = input.messageNode.message
  const role = cleanString(message.author?.role) ?? 'unknown'
  const senderActor = role === 'user' ? input.selfActorId : input.assistantActorId
  const messagePlatformId = message.id ?? input.messageNode.nodeId
  const messageId = createSocialNodeId('message', [
    'openai',
    input.platformConversationId,
    messagePlatformId
  ])
  const sentAt = isoOrUndefined(message.create_time)
  const text = collectOpenAIContentText(message.content)
  const citations = extractOpenAICitations(message.metadata)

  const messageRecord = createStagedNode({
    kind: 'message',
    deterministicId: messageId,
    platform: 'openai',
    bucketId: 'openai.conversations',
    source: input.source,
    sourceRecordId: input.sourceRecordId,
    privacyClass: 'private',
    properties: {
      messageKind: openAIMessageKind(role),
      platformMessageId: messagePlatformId,
      conversation: input.conversationId,
      senderActor,
      senderHandle: role,
      parentMessage: input.messageNode.node.parent
        ? createSocialNodeId('message', [
            'openai',
            input.platformConversationId,
            input.messageNode.node.parent
          ])
        : undefined,
      model:
        cleanString(readRecordString(message.metadata, 'model_slug')) ??
        input.conversation.default_model_slug,
      textPreview: trimPreview(text ?? ''),
      searchText: text,
      attachmentRefsJson: JSON.stringify(summarizeOpenAIAttachments(message)),
      externalRefsJson: JSON.stringify(citations.map((citation) => citation.url)),
      sentAt,
      importedAt: input.context.importedAt,
      metadataJson: JSON.stringify({
        contentType: message.content?.content_type,
        contentSummary: summarizeContent(message.content),
        status: cleanString(message.status),
        recipient: cleanString(message.recipient),
        channel: cleanString(message.channel),
        endTurn: message.end_turn,
        weight: message.weight,
        updateTime: isoOrUndefined(message.update_time),
        metadataKeys: Object.keys(message.metadata ?? {}).sort(),
        contentReferenceCount: Array.isArray(message.metadata?.content_references)
          ? message.metadata.content_references.length
          : 0,
        searchResultGroupCount: Array.isArray(message.metadata?.search_result_groups)
          ? message.metadata.search_result_groups.length
          : 0,
        isAsyncTaskResultMessage: Boolean(message.metadata?.is_async_task_result_message),
        asyncTaskTitle: cleanString(readRecordString(message.metadata, 'async_task_title'))
      })
    }
  })

  return [
    messageRecord,
    ...citations.flatMap((citation, index) =>
      createCitationRecords({
        context: input.context,
        source: input.source,
        sourceRecordId: input.sourceRecordId,
        citation,
        index,
        messageId,
        senderActor,
        sentAt
      })
    )
  ]
}

function createCitationRecords(input: {
  context: Pick<SocialImportContext, 'importedAt'>
  source: ArchiveEntryRef
  sourceRecordId: string
  citation: OpenAICitationRef
  index: number
  messageId: string
  senderActor: string
  sentAt?: string
}): StagedSocialRecord[] {
  const contentId = createSocialNodeId('content', ['openai', 'citation', input.citation.url])

  return [
    createStagedNode({
      kind: 'content',
      deterministicId: contentId,
      platform: 'openai',
      bucketId: 'openai.conversations',
      source: input.source,
      sourceRecordId: input.sourceRecordId,
      privacyClass: 'private',
      properties: {
        contentKind: 'link',
        platformContentKind: 'citation',
        platformContentId: input.citation.url,
        canonicalUrl: input.citation.url,
        platformUrl: input.citation.url,
        title: input.citation.title ?? input.citation.url,
        observedAt: input.sentAt,
        importedAt: input.context.importedAt,
        confidence: 0.8
      }
    }),
    createStagedNode({
      kind: 'interaction',
      deterministicId: createSocialNodeId('interaction', [
        'openai',
        'citation',
        input.messageId,
        input.citation.url,
        input.index
      ]),
      platform: 'openai',
      bucketId: 'openai.conversations',
      source: input.source,
      sourceRecordId: input.sourceRecordId,
      privacyClass: 'private',
      properties: {
        interactionKind: 'cited',
        platformInteractionKind: 'web_citation',
        actor: input.senderActor,
        target: contentId,
        targetSchema: 'SocialContent',
        targetTitle: input.citation.title ?? input.citation.url,
        observedAt: input.sentAt,
        importedAt: input.context.importedAt,
        confidence: 0.8
      }
    })
  ]
}

function createOpenAIBuckets(manifest: ArchiveManifest): ImportBucket[] {
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
        recordCount: entryPaths.length,
        privacyClass: bucket.privacyClass,
        defaultSelected: false,
        ignoredReason: `Disabled by default because this bucket is ${bucket.privacyClass}.`
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

function hasOpenAISignals(manifest: ArchiveManifest): boolean {
  const paths = new Set(manifest.entries.map((entry) => entry.path))
  const hasConversationShard = manifest.entries.some((entry) =>
    /^conversations(?:-\d+)?\.json$/.test(entry.path)
  )
  return paths.has('user.json') && (hasConversationShard || paths.has('export_manifest.json'))
}

function findEntry(manifest: ArchiveManifest, path: string): ArchiveEntryRef | undefined {
  return manifest.entries.find((entry) => entry.path === path)
}

function createOpenAISelfActorId(context: SocialImportContext, user?: OpenAIUser): string {
  return createSocialNodeId('actor', [
    'openai',
    'self',
    context.observedBy ?? user?.id ?? context.archiveId
  ])
}

function sourceBase(
  input: {
    context: Pick<SocialImportContext, 'archiveId' | 'importRunId'>
    source: ArchiveEntryRef
  },
  bucketId: string,
  sourceRecordId: string,
  payload: unknown,
  sourceRecordKind: SocialSourceRecordKind,
  privacyClass: SocialPrivacyClass
): Parameters<typeof createSourceRecord>[0] {
  return {
    archiveId: input.context.archiveId,
    importRunId: input.context.importRunId,
    platform: 'openai',
    bucketId,
    source: input.source,
    sourceRecordKind,
    sourceRecordId,
    payload,
    privacyClass
  }
}

function collectMessageNodes(conversation: OpenAIConversation): OpenAIMessageNode[] {
  return Object.entries(conversation.mapping ?? {})
    .flatMap(([nodeId, node], index): OpenAIMessageNode[] => {
      if (!node?.message) return []
      return [{ nodeId, node, message: node.message, index }]
    })
    .sort((left, right) => {
      const leftTime = timestampNumber(left.message.create_time)
      const rightTime = timestampNumber(right.message.create_time)
      if (leftTime !== rightTime) return leftTime - rightTime
      return left.index - right.index
    })
}

function openAIMessageKind(role: string): 'prompt' | 'ai-response' | 'system' | 'unknown' {
  if (role === 'user') return 'prompt'
  if (role === 'assistant') return 'ai-response'
  if (role === 'system' || role === 'tool') return 'system'
  return 'unknown'
}

function collectOpenAIContentText(content?: OpenAIMessageContent): string | undefined {
  if (!content) return undefined
  const parts = [
    ...collectTextFromValue(content.parts),
    ...collectTextFromValue(content.text),
    ...collectTextFromValue(content.content),
    ...collectTextFromValue(content.thoughts)
  ]
  return cleanString(parts.join('\n'))
}

function collectTextFromValue(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(collectTextFromValue)
  if (!value || typeof value !== 'object') return []

  const record = value as Record<string, unknown>
  return ['text', 'content', 'transcript']
    .flatMap((key) => collectTextFromValue(record[key]))
    .filter(Boolean)
}

function extractOpenAICitations(metadata?: Record<string, unknown>): OpenAICitationRef[] {
  const candidates = [
    ...extractCitationRecordList(metadata?.content_references),
    ...extractSearchResultGroups(metadata?.search_result_groups)
  ]
  const seen = new Set<string>()
  return candidates.filter((citation) => {
    if (seen.has(citation.url)) return false
    seen.add(citation.url)
    return true
  })
}

function extractCitationRecordList(value: unknown): OpenAICitationRef[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const record = asRecord(item)
    const url = cleanUrl(readRecordString(record, 'url') ?? readRecordString(record, 'href'))
    if (!url) return []
    return [
      {
        url,
        title: cleanString(readRecordString(record, 'title'))
      }
    ]
  })
}

function extractSearchResultGroups(value: unknown): OpenAICitationRef[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((group) => {
    const entries = asRecord(group).entries
    if (!Array.isArray(entries)) return []
    return entries.flatMap((entry) => {
      const record = asRecord(entry)
      const url = cleanUrl(readRecordString(record, 'url'))
      if (!url) return []
      return [
        {
          url,
          title: cleanString(readRecordString(record, 'title'))
        }
      ]
    })
  })
}

function summarizeOpenAIAttachments(message: OpenAIMessage): Array<Record<string, unknown>> {
  const metadata = message.metadata ?? {}
  const attachmentValues = [
    ...arrayFromUnknown(metadata.attachments),
    ...arrayFromUnknown(metadata.files)
  ]

  return attachmentValues.map((attachment) => {
    const record = asRecord(attachment)
    return {
      id: cleanString(readRecordString(record, 'id')),
      name: cleanString(
        readRecordString(record, 'name') ??
          readRecordString(record, 'file_name') ??
          readRecordString(record, 'filename')
      ),
      mimeType: cleanString(readRecordString(record, 'mime_type')),
      size: typeof record.size === 'number' ? record.size : undefined,
      keys: Object.keys(record).sort()
    }
  })
}

function summarizeContent(content?: OpenAIMessageContent): Record<string, unknown> {
  return {
    type: content?.content_type,
    partCount: Array.isArray(content?.parts) ? content.parts.length : 0,
    thoughtCount: Array.isArray(content?.thoughts) ? content.thoughts.length : 0,
    textLength: collectOpenAIContentText(content)?.length ?? 0,
    keys: content ? Object.keys(content).sort() : []
  }
}

function summarizeEntry(source: ArchiveEntryRef): Record<string, unknown> {
  return {
    path: source.path,
    byteSize: source.byteSize,
    sha256: source.sha256
  }
}

async function readAssetFileNames(
  context: SocialImportContext,
  entryPaths: readonly string[]
): Promise<Record<string, string>> {
  if (!entryPaths.includes('conversation_asset_file_names.json')) return {}
  return context.readJsonEntry<Record<string, string>>('conversation_asset_file_names.json')
}

function createChatGPTShareUrl(id?: string): string | undefined {
  const text = cleanString(id)
  return text ? `https://chatgpt.com/share/${encodeURIComponent(text)}` : undefined
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function arrayFromUnknown(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readRecordString(
  record: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const value = record?.[key]
  return typeof value === 'string' ? value : undefined
}

function cleanString(value?: string | null): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function cleanUrl(value?: string | null): string | undefined {
  const text = cleanString(value)
  if (!text || !/^https?:\/\//i.test(text)) return undefined
  return normalizeUrl(text)
}

function isoOrUndefined(value?: OpenAITimestamp | null): string | undefined {
  const millis = timestampNumber(value)
  if (!Number.isFinite(millis)) return undefined
  const date = new Date(millis)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function timestampNumber(value?: OpenAITimestamp | null): number {
  if (typeof value === 'number') return value > 1_000_000_000_000 ? value : value * 1000
  const text = cleanString(value)
  if (!text) return Number.POSITIVE_INFINITY
  const numeric = Number(text)
  if (Number.isFinite(numeric)) {
    return numeric > 1_000_000_000_000 ? numeric : numeric * 1000
  }
  const parsed = new Date(text).getTime()
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed
}

function trimPreview(value: string, maxLength = 5000): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value
}
