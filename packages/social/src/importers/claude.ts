/**
 * Claude export importer.
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
  normalizeUrl
} from '../import/core'

export const CLAUDE_ADAPTER_ID = 'claude'
export const CLAUDE_ADAPTER_VERSION = '0.1.0'

type ClaudeBucketPattern = {
  id: string
  label: string
  pattern: RegExp
  description: string
  privacyClass: SocialPrivacyClass
}

type ClaudeUser = {
  uuid?: string
  full_name?: string
  email_address?: string
  verified_phone_number?: string
}

type ClaudeConversation = {
  uuid?: string
  name?: string
  summary?: string
  created_at?: string
  updated_at?: string
  account?: { uuid?: string }
  chat_messages?: ClaudeMessage[]
}

type ClaudeMessage = {
  uuid?: string
  text?: string
  content?: ClaudeContentBlock[]
  sender?: 'human' | 'assistant' | string
  created_at?: string
  updated_at?: string
  attachments?: ClaudeAttachment[]
  files?: ClaudeFileRef[]
  parent_message_uuid?: string | null
}

type ClaudeContentBlock = {
  type?: string
  text?: string
  citations?: ClaudeCitation[]
  start_timestamp?: string
  stop_timestamp?: string
  name?: string | null
  integration_name?: string | null
  input?: unknown
  content?: unknown
  structured_content?: unknown
  is_error?: boolean
}

type ClaudeCitation = {
  uuid?: string
  start_index?: number
  end_index?: number
  details?: {
    type?: string
    url?: string
    [key: string]: unknown
  }
}

type ClaudeAttachment = {
  file_name?: string
  file_size?: number
  file_type?: string
  extracted_content?: string
}

type ClaudeFileRef = {
  file_uuid?: string
  file_name?: string
}

type ClaudeProject = {
  uuid?: string
  name?: string
  description?: string
  is_private?: boolean
  is_starter_project?: boolean
  prompt_template?: string
  created_at?: string
  updated_at?: string
  creator?: {
    uuid?: string
    full_name?: string
  }
  docs?: ClaudeProjectDoc[]
}

type ClaudeProjectDoc = {
  uuid?: string
  filename?: string
  content?: string
  created_at?: string
}

const bucketPatterns: ClaudeBucketPattern[] = [
  {
    id: 'claude.profile',
    label: 'Profile',
    pattern: /^users\.json$/,
    description:
      'Self account actor. Email address and phone number are not copied to canonical actor nodes.',
    privacyClass: 'private'
  },
  {
    id: 'claude.conversations',
    label: 'Conversations',
    pattern: /^conversations\.json$/,
    description: 'Claude conversations, prompts, assistant responses, citations, and tool blocks.',
    privacyClass: 'private'
  },
  {
    id: 'claude.files',
    label: 'Files And Attachments',
    pattern: /^conversations\.json$/,
    description: 'File and attachment metadata referenced by Claude conversations.',
    privacyClass: 'private'
  },
  {
    id: 'claude.projects',
    label: 'Projects',
    pattern: /^projects\/[^/]+\.json$/,
    description: 'Claude projects and project knowledge documents.',
    privacyClass: 'private'
  }
]

export const claudeAdapter: SocialImportAdapter = {
  id: CLAUDE_ADAPTER_ID,
  version: CLAUDE_ADAPTER_VERSION,
  platform: 'claude',
  detect: (manifest) => (hasClaudeSignals(manifest) ? 0.95 : 0),
  probe: ({ manifest }) => ({
    adapterId: CLAUDE_ADAPTER_ID,
    adapterVersion: CLAUDE_ADAPTER_VERSION,
    platform: 'claude',
    confidence: hasClaudeSignals(manifest) ? 0.95 : 0,
    buckets: createClaudeBuckets(manifest),
    warnings: []
  }),
  stage: stageClaudeArchive
}

export async function* stageClaudeArchive(
  context: SocialImportContext,
  selection: ImportSelection = {}
): AsyncIterable<StagedSocialRecord> {
  const selectedBuckets = resolveSelectedBuckets(createClaudeBuckets(context.manifest), selection)
  const userEntry = findEntry(context.manifest, 'users.json')
  const users = userEntry ? await context.readJsonEntry<ClaudeUser[]>(userEntry.path) : []
  const selfActorId = createClaudeSelfActorId(context, users[0])
  const assistantActorId = createSocialNodeId('actor', ['claude', 'assistant'])

  for (const bucket of selectedBuckets) {
    if (bucket.id === 'claude.profile') {
      if (!userEntry) continue
      yield* mapClaudeProfile({
        context,
        source: userEntry,
        users,
        selfActorId
      })
      continue
    }

    if (bucket.id === 'claude.conversations' || bucket.id === 'claude.files') {
      const source = findEntry(context.manifest, 'conversations.json')
      if (!source) continue
      const conversations = await context.readJsonEntry<ClaudeConversation[]>(source.path)
      if (bucket.id === 'claude.conversations') {
        yield* mapClaudeConversations({
          context,
          source,
          conversations,
          selfActorId,
          assistantActorId
        })
      } else {
        yield* mapClaudeFiles({
          context,
          source,
          conversations
        })
      }
      continue
    }

    if (bucket.id === 'claude.projects') {
      for (const path of bucket.entryPaths) {
        const source = findEntry(context.manifest, path)
        if (!source) continue
        yield* mapClaudeProject({
          context,
          source,
          project: await context.readJsonEntry<ClaudeProject>(path),
          selfActorId
        })
      }
    }
  }
}

export function mapClaudeProfile(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  users: readonly ClaudeUser[]
  selfActorId: string
}): StagedSocialRecord[] {
  const user = input.users[0] ?? {}
  const sourceRecord = createSourceRecord({
    ...sourceBase(
      input,
      'claude.profile',
      `profile:${user.uuid ?? 'self'}`,
      user,
      'actor',
      'private'
    )
  })

  return [
    sourceRecord,
    createStagedNode({
      kind: 'actor',
      deterministicId: input.selfActorId,
      platform: 'claude',
      bucketId: 'claude.profile',
      source: input.source,
      sourceRecordId: sourceRecord.deterministicId,
      privacyClass: 'private',
      properties: {
        actorKind: 'account',
        platformActorId: user.uuid,
        displayName: cleanString(user.full_name) ?? 'Claude User',
        observedBy: input.context.observedBy,
        observedAt: input.context.importedAt,
        isSelf: true,
        metadataJson: JSON.stringify({
          hasEmailAddress: Boolean(cleanString(user.email_address)),
          hasVerifiedPhoneNumber: Boolean(cleanString(user.verified_phone_number))
        })
      }
    })
  ]
}

export function mapClaudeConversations(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  conversations: readonly ClaudeConversation[]
  selfActorId: string
  assistantActorId: string
}): StagedSocialRecord[] {
  const actorSource = createSourceRecord({
    ...sourceBase(
      input,
      'claude.conversations',
      'actors:self-and-assistant',
      {},
      'actor',
      'private'
    )
  })

  return [
    actorSource,
    createStagedNode({
      kind: 'actor',
      deterministicId: input.selfActorId,
      platform: 'claude',
      bucketId: 'claude.conversations',
      source: input.source,
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
      platform: 'claude',
      bucketId: 'claude.conversations',
      source: input.source,
      sourceRecordId: actorSource.deterministicId,
      privacyClass: 'private',
      properties: {
        actorKind: 'ai-assistant',
        platformActorId: 'claude',
        handle: 'claude',
        displayName: 'Claude',
        observedBy: input.context.observedBy,
        observedAt: input.context.importedAt
      }
    }),
    ...input.conversations.flatMap((conversation, index) =>
      mapClaudeConversation({ ...input, conversation, index })
    )
  ]
}

function mapClaudeConversation(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  conversation: ClaudeConversation
  index: number
  selfActorId: string
  assistantActorId: string
}): StagedSocialRecord[] {
  const conversation = input.conversation
  const messages = conversation.chat_messages ?? []
  const sourceRecord = createSourceRecord({
    ...sourceBase(
      input,
      'claude.conversations',
      `conversation:${conversation.uuid ?? input.index}`,
      conversation,
      'conversation',
      'private'
    )
  })
  const conversationId = createSocialNodeId('conversation', [
    'claude',
    conversation.uuid ?? input.index
  ])

  return [
    sourceRecord,
    createStagedNode({
      kind: 'conversation',
      deterministicId: conversationId,
      platform: 'claude',
      bucketId: 'claude.conversations',
      source: input.source,
      sourceRecordId: sourceRecord.deterministicId,
      privacyClass: 'private',
      properties: {
        conversationKind: 'ai-chat',
        platformConversationId: conversation.uuid,
        title: cleanString(conversation.name) ?? `Claude conversation ${input.index + 1}`,
        participantActorIdsJson: JSON.stringify([input.selfActorId, input.assistantActorId]),
        startedAt: isoOrUndefined(conversation.created_at),
        lastMessageAt: isoOrUndefined(conversation.updated_at),
        messageCount: messages.length,
        sourceArchive: input.context.archiveId,
        metadataJson: JSON.stringify({
          accountUuid: conversation.account?.uuid,
          hasSummary: Boolean(cleanString(conversation.summary))
        })
      }
    }),
    ...messages.flatMap((message, messageIndex) =>
      mapClaudeMessage({
        ...input,
        conversationId,
        sourceRecordId: sourceRecord.deterministicId,
        message,
        messageIndex
      })
    )
  ]
}

function mapClaudeMessage(input: {
  context: Pick<SocialImportContext, 'importedAt'>
  source: ArchiveEntryRef
  conversationId: string
  sourceRecordId: string
  message: ClaudeMessage
  messageIndex: number
  selfActorId: string
  assistantActorId: string
}): StagedSocialRecord[] {
  const senderActor =
    input.message.sender === 'assistant' ? input.assistantActorId : input.selfActorId
  const sentAt = isoOrUndefined(input.message.created_at)
  const text = cleanString(input.message.text) ?? collectTextBlocks(input.message.content)
  const messageId = createSocialNodeId('message', [
    'claude',
    input.conversationId,
    input.message.uuid ?? input.messageIndex
  ])
  const citationUrls = extractCitationUrls(input.message.content)
  const contentBlockSummary = summarizeContentBlocks(input.message.content)
  const attachmentSummary = summarizeAttachments(input.message.attachments)
  const fileSummary = summarizeFiles(input.message.files)
  const messageRecord = createStagedNode({
    kind: 'message',
    deterministicId: messageId,
    platform: 'claude',
    bucketId: 'claude.conversations',
    source: input.source,
    sourceRecordId: input.sourceRecordId,
    privacyClass: 'private',
    properties: {
      messageKind: claudeMessageKind(input.message.sender),
      platformMessageId: input.message.uuid,
      conversation: input.conversationId,
      senderActor,
      senderHandle: input.message.sender,
      parentMessage: input.message.parent_message_uuid
        ? createSocialNodeId('message', [
            'claude',
            input.conversationId,
            input.message.parent_message_uuid
          ])
        : undefined,
      textPreview: trimPreview(text ?? ''),
      searchText: text,
      attachmentRefsJson: JSON.stringify([...attachmentSummary, ...fileSummary]),
      externalRefsJson: JSON.stringify(citationUrls),
      sentAt,
      importedAt: input.context.importedAt,
      metadataJson: JSON.stringify({
        contentBlockSummary,
        attachmentCount: input.message.attachments?.length ?? 0,
        fileCount: input.message.files?.length ?? 0,
        updatedAt: isoOrUndefined(input.message.updated_at)
      })
    }
  })

  return [
    messageRecord,
    ...citationUrls.flatMap((url, index) =>
      createCitationRecords({
        input,
        url,
        index,
        messageId,
        senderActor,
        sentAt
      })
    )
  ]
}

function createCitationRecords(input: {
  input: {
    context: Pick<SocialImportContext, 'importedAt'>
    source: ArchiveEntryRef
    sourceRecordId: string
  }
  url: string
  index: number
  messageId: string
  senderActor: string
  sentAt?: string
}): StagedSocialRecord[] {
  const contentId = createSocialNodeId('content', ['claude', 'citation', input.url])

  return [
    createStagedNode({
      kind: 'content',
      deterministicId: contentId,
      platform: 'claude',
      bucketId: 'claude.conversations',
      source: input.input.source,
      sourceRecordId: input.input.sourceRecordId,
      privacyClass: 'private',
      properties: {
        contentKind: 'link',
        platformContentKind: 'citation',
        platformContentId: input.url,
        canonicalUrl: input.url,
        platformUrl: input.url,
        title: input.url,
        observedAt: input.sentAt,
        importedAt: input.input.context.importedAt,
        confidence: 0.8
      }
    }),
    createStagedNode({
      kind: 'interaction',
      deterministicId: createSocialNodeId('interaction', [
        'claude',
        'citation',
        input.messageId,
        input.url,
        input.index
      ]),
      platform: 'claude',
      bucketId: 'claude.conversations',
      source: input.input.source,
      sourceRecordId: input.input.sourceRecordId,
      privacyClass: 'private',
      properties: {
        interactionKind: 'cited',
        platformInteractionKind: 'citation',
        actor: input.senderActor,
        target: contentId,
        targetSchema: 'SocialContent',
        targetTitle: input.url,
        observedAt: input.sentAt,
        importedAt: input.input.context.importedAt,
        confidence: 0.8
      }
    })
  ]
}

export function mapClaudeFiles(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId'>
  source: ArchiveEntryRef
  conversations: readonly ClaudeConversation[]
}): StagedSocialRecord[] {
  return input.conversations.flatMap((conversation, conversationIndex) =>
    (conversation.chat_messages ?? []).flatMap((message, messageIndex) => [
      ...(message.attachments ?? []).map((attachment, attachmentIndex) =>
        createSourceRecord({
          ...sourceBase(
            input,
            'claude.files',
            `attachment:${conversation.uuid ?? conversationIndex}:${message.uuid ?? messageIndex}:${attachmentIndex}`,
            sanitizeAttachment(attachment),
            'media',
            'private'
          )
        })
      ),
      ...(message.files ?? []).map((file, fileIndex) =>
        createSourceRecord({
          ...sourceBase(
            input,
            'claude.files',
            `file:${conversation.uuid ?? conversationIndex}:${message.uuid ?? messageIndex}:${file.file_uuid ?? fileIndex}`,
            sanitizeFile(file),
            'media',
            'private'
          )
        })
      )
    ])
  )
}

export function mapClaudeProject(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  project: ClaudeProject
  selfActorId: string
}): StagedSocialRecord[] {
  const project = input.project
  const projectId = createSocialNodeId('collection', [
    'claude',
    'project',
    project.uuid ?? input.source.path
  ])
  const sourceRecord = createSourceRecord({
    ...sourceBase(
      input,
      'claude.projects',
      `project:${project.uuid ?? input.source.path}`,
      project,
      'collection',
      'private'
    )
  })

  return [
    sourceRecord,
    createStagedNode({
      kind: 'collection',
      deterministicId: projectId,
      platform: 'claude',
      bucketId: 'claude.projects',
      source: input.source,
      sourceRecordId: sourceRecord.deterministicId,
      privacyClass: 'private',
      properties: {
        collectionKind: 'project',
        platformCollectionId: project.uuid,
        title: cleanString(project.name) ?? 'Claude Project',
        ownerActor: input.selfActorId,
        itemCount: project.docs?.length ?? 0,
        observedAt: isoOrUndefined(project.updated_at) ?? input.context.importedAt,
        metadataJson: JSON.stringify({
          description: cleanString(project.description),
          isPrivate: project.is_private,
          isStarterProject: project.is_starter_project,
          hasPromptTemplate: Boolean(cleanString(project.prompt_template)),
          creatorUuid: project.creator?.uuid,
          creatorName: cleanString(project.creator?.full_name),
          createdAt: isoOrUndefined(project.created_at)
        })
      }
    }),
    ...(project.docs ?? []).flatMap((doc, index) =>
      createProjectDocRecords({
        input,
        doc,
        index,
        projectId,
        sourceRecordId: sourceRecord.deterministicId
      })
    )
  ]
}

function createProjectDocRecords(input: {
  input: {
    context: Pick<SocialImportContext, 'importedAt'>
    source: ArchiveEntryRef
  }
  doc: ClaudeProjectDoc
  index: number
  projectId: string
  sourceRecordId: string
}): StagedSocialRecord[] {
  const docId = createSocialNodeId('content', [
    'claude',
    'project-doc',
    input.doc.uuid ?? input.doc.filename ?? input.index
  ])
  const createdAt = isoOrUndefined(input.doc.created_at)
  const title = cleanString(input.doc.filename) ?? `Project document ${input.index + 1}`
  const text = cleanString(input.doc.content)

  return [
    createStagedNode({
      kind: 'content',
      deterministicId: docId,
      platform: 'claude',
      bucketId: 'claude.projects',
      source: input.input.source,
      sourceRecordId: input.sourceRecordId,
      privacyClass: 'private',
      properties: {
        contentKind: 'transcript',
        platformContentKind: 'project_doc',
        platformContentId: input.doc.uuid,
        title,
        textPreview: trimPreview(text ?? ''),
        searchText: text,
        publishedAt: createdAt,
        importedAt: input.input.context.importedAt,
        confidence: 0.85,
        metadataJson: JSON.stringify({
          filename: title,
          contentLength: text?.length ?? 0
        })
      }
    }),
    createStagedNode({
      kind: 'collection-item',
      deterministicId: createSocialNodeId('collection-item', ['claude', input.projectId, docId]),
      platform: 'claude',
      bucketId: 'claude.projects',
      source: input.input.source,
      sourceRecordId: input.sourceRecordId,
      privacyClass: 'private',
      properties: {
        collection: input.projectId,
        item: docId,
        itemSchema: 'SocialContent',
        sortKey: String(input.index).padStart(8, '0'),
        addedAt: createdAt
      }
    })
  ]
}

function createClaudeBuckets(manifest: ArchiveManifest): ImportBucket[] {
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

function hasClaudeSignals(manifest: ArchiveManifest): boolean {
  const paths = new Set(manifest.entries.map((entry) => entry.path))
  return paths.has('conversations.json') && paths.has('users.json')
}

function findEntry(manifest: ArchiveManifest, path: string): ArchiveEntryRef | undefined {
  return manifest.entries.find((entry) => entry.path === path)
}

function createClaudeSelfActorId(context: SocialImportContext, user?: ClaudeUser): string {
  return createSocialNodeId('actor', [
    'claude',
    'self',
    context.observedBy ?? user?.uuid ?? context.archiveId
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
  sourceRecordKind: Parameters<typeof createSourceRecord>[0]['sourceRecordKind'],
  privacyClass: Parameters<typeof createSourceRecord>[0]['privacyClass']
): Parameters<typeof createSourceRecord>[0] {
  return {
    archiveId: input.context.archiveId,
    importRunId: input.context.importRunId,
    platform: 'claude',
    bucketId,
    source: input.source,
    sourceRecordKind,
    sourceRecordId,
    payload,
    privacyClass
  }
}

function claudeMessageKind(sender?: string): 'prompt' | 'ai-response' | 'system' {
  if (sender === 'human') return 'prompt'
  if (sender === 'assistant') return 'ai-response'
  return 'system'
}

function collectTextBlocks(blocks?: readonly ClaudeContentBlock[]): string | undefined {
  const text = (blocks ?? [])
    .flatMap((block) =>
      block.type === 'text' || block.type === 'thinking' ? [block.text ?? ''] : []
    )
    .filter(Boolean)
    .join('\n')
  return cleanString(text)
}

function extractCitationUrls(blocks?: readonly ClaudeContentBlock[]): string[] {
  const urls = (blocks ?? []).flatMap((block) =>
    (block.citations ?? []).flatMap((citation) => {
      const url = cleanUrl(citation.details?.url)
      return url ? [url] : []
    })
  )
  return [...new Set(urls)]
}

function summarizeContentBlocks(
  blocks?: readonly ClaudeContentBlock[]
): Array<Record<string, unknown>> {
  return (blocks ?? []).map((block) => ({
    type: block.type,
    startTimestamp: isoOrUndefined(block.start_timestamp),
    stopTimestamp: isoOrUndefined(block.stop_timestamp),
    citationCount: block.citations?.length ?? 0,
    name: cleanString(block.name ?? undefined),
    integrationName: cleanString(block.integration_name ?? undefined),
    inputShape: describeShape(block.input),
    contentShape: describeShape(block.content),
    structuredContentShape: describeShape(block.structured_content),
    isError: block.is_error
  }))
}

function summarizeAttachments(
  attachments?: readonly ClaudeAttachment[]
): Array<Record<string, unknown>> {
  return (attachments ?? []).map(sanitizeAttachment)
}

function summarizeFiles(files?: readonly ClaudeFileRef[]): Array<Record<string, unknown>> {
  return (files ?? []).map(sanitizeFile)
}

function sanitizeAttachment(attachment: ClaudeAttachment): Record<string, unknown> {
  return {
    fileName: cleanString(attachment.file_name),
    fileSize: attachment.file_size,
    fileType: cleanString(attachment.file_type),
    extractedContentLength: cleanString(attachment.extracted_content)?.length ?? 0
  }
}

function sanitizeFile(file: ClaudeFileRef): Record<string, unknown> {
  return {
    fileUuid: file.file_uuid,
    fileName: cleanString(file.file_name)
  }
}

function describeShape(value: unknown): unknown {
  if (Array.isArray(value)) return { type: 'array', length: value.length }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return {
      type: 'object',
      keys: Object.keys(record).sort(),
      properties: Object.fromEntries(
        Object.entries(record)
          .slice(0, 12)
          .map(([key, child]) => [
            key,
            Array.isArray(child) ? `array(${child.length})` : typeof child
          ])
      )
    }
  }
  return value === null ? { type: 'null' } : { type: typeof value }
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

function isoOrUndefined(value?: string): string | undefined {
  const text = cleanString(value)
  if (!text) return undefined
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function trimPreview(value: string, maxLength = 5000): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value
}
