/**
 * Moderated comment hooks for public surfaces.
 */

import type {
  AddCommentOptions,
  CommentNode,
  CommentThread,
  ReplyContext,
  UseCommentsOptions,
  UseCommentsResult
} from './useComments'
import type { NodeChangeEvent, NodeState } from '@xnetjs/data'
import { ModerationLabelSchema, PublicInteractionPolicySchema } from '@xnetjs/data'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useComments } from './useComments'
import { useNodeStore } from './useNodeStore'

// ─── Types ──────────────────────────────────────────────────────────────────

export type CommentVisibility = 'visible' | 'collapsed' | 'quarantined' | 'hidden'

export type PublicInteractionMode = 'open' | 'authenticated' | 'trusted' | 'reviewed' | 'closed'

export type PublicInteractionSurface =
  | 'comment'
  | 'reply'
  | 'reaction'
  | 'quote'
  | 'mention'
  | 'communityNote'
  | 'message'
  | 'crawl'
  | 'index'

export type FirstContactMode = 'allow' | 'slow-mode' | 'quarantine' | 'review' | 'block'

export type PublicModerationMode =
  | 'off'
  | 'label-only'
  | 'post-review'
  | 'pre-filter'
  | 'pre-review'

export interface ModerationLabelSummary {
  id: string
  target: string
  value: string
  confidence: number
  sourceWeight: number
  sourceType?: string
  sourceDID?: string
  evidenceRefs?: string
  expiresAt?: number
  createdAt: number
}

export interface PublicInteractionPolicySnapshot {
  id: string
  target: string
  targetSchema?: string
  scope?: string
  commentMode: PublicInteractionMode
  replyMode: PublicInteractionMode
  reactionMode: PublicInteractionMode
  quoteMode: PublicInteractionMode
  mentionMode: PublicInteractionMode
  communityNoteMode: PublicInteractionMode
  messageMode: PublicInteractionMode
  crawlMode: PublicInteractionMode
  indexMode: PublicInteractionMode
  defaultVisibility: CommentVisibility
  firstContactMode: FirstContactMode
  moderationMode: PublicModerationMode
  slowModeSeconds?: number
  maxRootCommentsPerHour?: number
  maxRepliesPerHour?: number
  maxReactionsPerHour?: number
  maxMentionsPerComment?: number
  minimumAccountAgeHours?: number
  minimumReputation?: number
  trustThreshold?: number
  quarantineConfidenceThreshold?: number
  hideConfidenceThreshold?: number
  requiresVerifiedIdentity: boolean
  acceptsPolicySubscriptions: boolean
  policyLists: string[]
  activeLabels: string[]
  maintainers: string[]
  moderators: string[]
  policyPublishers: string[]
  trustedDIDs: string[]
  mutedDIDs: string[]
  blockedDIDs: string[]
  updatedAt: number
  createdAt: number
}

export interface ModeratedCommentNode {
  comment: CommentNode
  visibility: CommentVisibility
  labels: ModerationLabelSummary[]
  reasons: string[]
  visible: boolean
}

export interface ModeratedCommentThread {
  root: ModeratedCommentNode
  replies: ModeratedCommentNode[]
  visibleReplies: ModeratedCommentNode[]
  visible: boolean
  hiddenReplyCount: number
  collapsedReplyCount: number
  quarantinedReplyCount: number
}

export interface InteractionPermission {
  allowed: boolean
  requiresReview: boolean
  mode: PublicInteractionMode
  reasons: string[]
}

export interface ModerationFilterOptions {
  hiddenLabels?: readonly string[]
  collapsedLabels?: readonly string[]
  includeCollapsed?: boolean
  includeQuarantined?: boolean
  includeHidden?: boolean
  minimumLabelConfidence?: number
}

export interface UseModeratedThreadOptions extends ModerationFilterOptions {
  thread: CommentThread | null
  labelIndex?: ReadonlyMap<string, readonly ModerationLabelSummary[]>
  policy?: PublicInteractionPolicySnapshot | null
}

export interface UseVisibleCommentsOptions extends UseCommentsOptions, ModerationFilterOptions {
  viewerDID?: string
  isAuthenticated?: boolean
  isVerified?: boolean
  policy?: PublicInteractionPolicySnapshot | null
}

export interface UseVisibleCommentsResult extends Omit<
  UseCommentsResult,
  'comments' | 'threads' | 'count' | 'unresolvedCount' | 'addComment' | 'replyTo'
> {
  comments: CommentNode[]
  threads: CommentThread[]
  allComments: CommentNode[]
  allThreads: CommentThread[]
  moderatedThreads: ModeratedCommentThread[]
  moderationByCommentId: ReadonlyMap<string, ModeratedCommentNode>
  moderationLabels: ModerationLabelSummary[]
  policy: PublicInteractionPolicySnapshot | null
  policyLoading: boolean
  policyError: Error | null
  count: number
  unresolvedCount: number
  hiddenCount: number
  collapsedCount: number
  quarantinedCount: number
  canAddRootComment: InteractionPermission
  canReply: InteractionPermission
  addComment: (options: AddCommentOptions) => Promise<string | null>
  replyTo: (
    rootCommentId: string,
    content: string,
    context?: ReplyContext
  ) => Promise<string | null>
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const DEFAULT_HIDDEN_COMMENT_LABELS = [
  'spam',
  'scam',
  'malware',
  'impersonation',
  'harassment'
] as const

export const DEFAULT_COLLAPSED_COMMENT_LABELS = [
  'slop',
  'inaccurate',
  'unsupported',
  'stale',
  'synthetic'
] as const

const DEFAULT_HIDE_CONFIDENCE = 0.85
const DEFAULT_COLLAPSE_CONFIDENCE = 0.65
const DEFAULT_PUBLIC_INTERACTION_MODES: Record<PublicInteractionSurface, PublicInteractionMode> = {
  comment: 'authenticated',
  reply: 'authenticated',
  reaction: 'authenticated',
  quote: 'trusted',
  mention: 'trusted',
  communityNote: 'reviewed',
  message: 'authenticated',
  crawl: 'closed',
  index: 'reviewed'
}

// ─── Pure Helpers ───────────────────────────────────────────────────────────

export function summarizeModerationLabel(
  node: NodeState,
  now: number = Date.now()
): ModerationLabelSummary | null {
  const target = asString(node.properties.target)
  const value = asString(node.properties.value)
  const confidence = asNumber(node.properties.confidence)
  const sourceWeight = asNumber(node.properties.sourceWeight) ?? 1
  const expiresAt = asNumber(node.properties.expiresAt)

  if (!target || !value || confidence === undefined) return null
  if (expiresAt !== undefined && expiresAt <= now) return null

  return {
    id: node.id,
    target,
    value,
    confidence,
    sourceWeight,
    sourceType: asString(node.properties.sourceType),
    sourceDID: asString(node.properties.sourceDID),
    evidenceRefs: asString(node.properties.evidenceRefs),
    expiresAt,
    createdAt: node.createdAt
  }
}

export function summarizePublicInteractionPolicy(
  node: NodeState
): PublicInteractionPolicySnapshot | null {
  const target = asString(node.properties.target)
  if (!target) return null

  const updatedAt = asNumber(node.properties.updatedAt) ?? node.updatedAt ?? node.createdAt

  return {
    id: node.id,
    target,
    targetSchema: asString(node.properties.targetSchema),
    scope: asString(node.properties.scope),
    commentMode: asInteractionMode(node.properties.commentMode, 'authenticated'),
    replyMode: asInteractionMode(node.properties.replyMode, 'authenticated'),
    reactionMode: asInteractionMode(node.properties.reactionMode, 'authenticated'),
    quoteMode: asInteractionMode(node.properties.quoteMode, 'trusted'),
    mentionMode: asInteractionMode(node.properties.mentionMode, 'trusted'),
    communityNoteMode: asInteractionMode(node.properties.communityNoteMode, 'reviewed'),
    messageMode: asInteractionMode(node.properties.messageMode, 'authenticated'),
    crawlMode: asInteractionMode(node.properties.crawlMode, 'closed'),
    indexMode: asInteractionMode(node.properties.indexMode, 'reviewed'),
    defaultVisibility: asVisibility(node.properties.defaultVisibility, 'visible'),
    firstContactMode: asFirstContactMode(node.properties.firstContactMode, 'slow-mode'),
    moderationMode: asModerationMode(node.properties.moderationMode, 'post-review'),
    slowModeSeconds: asNumber(node.properties.slowModeSeconds),
    maxRootCommentsPerHour: asNumber(node.properties.maxRootCommentsPerHour),
    maxRepliesPerHour: asNumber(node.properties.maxRepliesPerHour),
    maxReactionsPerHour: asNumber(node.properties.maxReactionsPerHour),
    maxMentionsPerComment: asNumber(node.properties.maxMentionsPerComment),
    minimumAccountAgeHours: asNumber(node.properties.minimumAccountAgeHours),
    minimumReputation: asNumber(node.properties.minimumReputation),
    trustThreshold: asNumber(node.properties.trustThreshold),
    quarantineConfidenceThreshold: asNumber(node.properties.quarantineConfidenceThreshold),
    hideConfidenceThreshold: asNumber(node.properties.hideConfidenceThreshold),
    requiresVerifiedIdentity: asBoolean(node.properties.requiresVerifiedIdentity, false),
    acceptsPolicySubscriptions: asBoolean(node.properties.acceptsPolicySubscriptions, true),
    policyLists: asStringArray(node.properties.policyLists),
    activeLabels: asStringArray(node.properties.activeLabels),
    maintainers: asStringArray(node.properties.maintainers),
    moderators: asStringArray(node.properties.moderators),
    policyPublishers: asStringArray(node.properties.policyPublishers),
    trustedDIDs: asStringArray(node.properties.trustedDIDs),
    mutedDIDs: asStringArray(node.properties.mutedDIDs),
    blockedDIDs: asStringArray(node.properties.blockedDIDs),
    updatedAt,
    createdAt: node.createdAt
  }
}

export function selectActiveInteractionPolicy(
  policies: readonly PublicInteractionPolicySnapshot[]
): PublicInteractionPolicySnapshot | null {
  return (
    [...policies].sort((left, right) => {
      const updatedDelta = right.updatedAt - left.updatedAt
      return updatedDelta !== 0 ? updatedDelta : right.createdAt - left.createdAt
    })[0] ?? null
  )
}

export function selectPublicInteractionMode(
  policy: PublicInteractionPolicySnapshot | null,
  surface: PublicInteractionSurface
): PublicInteractionMode {
  if (!policy) return DEFAULT_PUBLIC_INTERACTION_MODES[surface]

  if (surface === 'comment') return policy.commentMode
  if (surface === 'reply') return policy.replyMode
  if (surface === 'reaction') return policy.reactionMode
  if (surface === 'quote') return policy.quoteMode
  if (surface === 'mention') return policy.mentionMode
  if (surface === 'communityNote') return policy.communityNoteMode
  if (surface === 'message') return policy.messageMode
  if (surface === 'crawl') return policy.crawlMode
  return policy.indexMode
}

export function createModerationLabelIndex(
  labels: readonly ModerationLabelSummary[]
): Map<string, ModerationLabelSummary[]> {
  return labels.reduce((index, label) => {
    const existing = index.get(label.target) ?? []
    index.set(label.target, [...existing, label])
    return index
  }, new Map<string, ModerationLabelSummary[]>())
}

export function evaluateInteractionPermission(
  mode: PublicInteractionMode,
  policy: PublicInteractionPolicySnapshot | null,
  options: {
    viewerDID?: string
    isAuthenticated?: boolean
    isVerified?: boolean
  } = {}
): InteractionPermission {
  const reasons: string[] = []
  const viewerDID = options.viewerDID
  const authenticated = options.isAuthenticated ?? Boolean(viewerDID)
  const trusted = viewerDID !== undefined && policy?.trustedDIDs.includes(viewerDID)
  const privileged =
    viewerDID !== undefined &&
    (policy?.maintainers.includes(viewerDID) ||
      policy?.moderators.includes(viewerDID) ||
      policy?.policyPublishers.includes(viewerDID))

  if (viewerDID !== undefined && policy?.blockedDIDs.includes(viewerDID)) {
    return { allowed: false, requiresReview: false, mode, reasons: ['viewer-blocked'] }
  }

  if (viewerDID !== undefined && policy?.mutedDIDs.includes(viewerDID)) {
    return { allowed: false, requiresReview: false, mode, reasons: ['viewer-muted'] }
  }

  if (policy?.requiresVerifiedIdentity && !options.isVerified && !privileged) {
    reasons.push('verified-identity-required')
  }

  if (mode === 'closed') reasons.push('interaction-closed')
  if (mode === 'authenticated' && !authenticated) reasons.push('authentication-required')
  if (mode === 'trusted' && !trusted && !privileged) reasons.push('trusted-viewer-required')
  if (mode === 'reviewed' && !authenticated && !privileged) {
    reasons.push('authentication-required')
  }

  return {
    allowed: reasons.length === 0,
    requiresReview: mode === 'reviewed',
    mode,
    reasons
  }
}

export function evaluateCommentModeration(
  comment: CommentNode,
  options: {
    labels?: readonly ModerationLabelSummary[]
    policy?: PublicInteractionPolicySnapshot | null
  } & ModerationFilterOptions = {}
): ModeratedCommentNode {
  const policy = options.policy ?? null
  const labels = filterActiveLabels(options.labels ?? [], policy, options.minimumLabelConfidence)
  const reasons: string[] = []

  if (policy?.moderationMode === 'off') {
    return {
      comment,
      visibility: 'visible',
      labels,
      reasons,
      visible: true
    }
  }

  const safeConfidence = maxConfidence(labels, 'safe')
  const hiddenLabels = new Set(options.hiddenLabels ?? DEFAULT_HIDDEN_COMMENT_LABELS)
  const collapsedLabels = new Set(options.collapsedLabels ?? DEFAULT_COLLAPSED_COMMENT_LABELS)
  const hideThreshold = policy?.hideConfidenceThreshold ?? DEFAULT_HIDE_CONFIDENCE
  const collapseThreshold = policy?.quarantineConfidenceThreshold ?? DEFAULT_COLLAPSE_CONFIDENCE

  const hideLabel = labels.find(
    (label) =>
      hiddenLabels.has(label.value) &&
      label.confidence >= hideThreshold &&
      label.confidence > safeConfidence
  )

  if (hideLabel) {
    reasons.push(`label:${hideLabel.value}`)
    return {
      comment,
      visibility: 'hidden',
      labels,
      reasons,
      visible: isVisibilityIncluded('hidden', options)
    }
  }

  const collapseLabel = labels.find(
    (label) =>
      collapsedLabels.has(label.value) &&
      label.confidence >= collapseThreshold &&
      label.confidence > safeConfidence
  )

  if (collapseLabel) {
    reasons.push(`label:${collapseLabel.value}`)
    const visibility = policy?.defaultVisibility === 'quarantined' ? 'quarantined' : 'collapsed'
    return {
      comment,
      visibility,
      labels,
      reasons,
      visible: isVisibilityIncluded(visibility, options)
    }
  }

  const defaultVisibility = policy?.defaultVisibility ?? 'visible'
  return {
    comment,
    visibility: defaultVisibility,
    labels,
    reasons,
    visible: isVisibilityIncluded(defaultVisibility, options)
  }
}

export function moderateThread(
  thread: CommentThread,
  options: {
    labelIndex?: ReadonlyMap<string, readonly ModerationLabelSummary[]>
    policy?: PublicInteractionPolicySnapshot | null
  } & ModerationFilterOptions = {}
): ModeratedCommentThread {
  const labelIndex = options.labelIndex ?? new Map<string, readonly ModerationLabelSummary[]>()
  const root = evaluateCommentModeration(thread.root, {
    ...options,
    labels: labelIndex.get(thread.root.id)
  })
  const replies = thread.replies.map((reply) =>
    evaluateCommentModeration(reply, {
      ...options,
      labels: labelIndex.get(reply.id)
    })
  )
  const visibleReplies = replies.filter((reply) => reply.visible)

  return {
    root,
    replies,
    visibleReplies,
    visible: root.visible,
    hiddenReplyCount: countByVisibility(replies, 'hidden'),
    collapsedReplyCount: countByVisibility(replies, 'collapsed'),
    quarantinedReplyCount: countByVisibility(replies, 'quarantined')
  }
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

export function useModeratedThread({
  thread,
  labelIndex,
  policy,
  hiddenLabels,
  collapsedLabels,
  includeCollapsed,
  includeQuarantined,
  includeHidden,
  minimumLabelConfidence
}: UseModeratedThreadOptions): ModeratedCommentThread | null {
  return useMemo(() => {
    if (!thread) return null
    return moderateThread(thread, {
      labelIndex,
      policy,
      hiddenLabels,
      collapsedLabels,
      includeCollapsed,
      includeQuarantined,
      includeHidden,
      minimumLabelConfidence
    })
  }, [
    thread,
    labelIndex,
    policy,
    hiddenLabels,
    collapsedLabels,
    includeCollapsed,
    includeQuarantined,
    includeHidden,
    minimumLabelConfidence
  ])
}

export function useVisibleComments(options: UseVisibleCommentsOptions): UseVisibleCommentsResult {
  const {
    viewerDID,
    isAuthenticated,
    isVerified,
    policy: providedPolicy,
    hiddenLabels,
    collapsedLabels,
    includeCollapsed,
    includeQuarantined,
    includeHidden,
    minimumLabelConfidence,
    ...commentOptions
  } = options
  const base = useComments(commentOptions)
  const { store, isReady } = useNodeStore()
  const [moderationLabels, setModerationLabels] = useState<ModerationLabelSummary[]>([])
  const [loadedPolicy, setLoadedPolicy] = useState<PublicInteractionPolicySnapshot | null>(null)
  const [policyLoading, setPolicyLoading] = useState(true)
  const [policyError, setPolicyError] = useState<Error | null>(null)

  const commentIds = useMemo(
    () => new Set(base.comments.map((comment) => comment.id)),
    [base.comments]
  )

  const loadModerationState = useCallback(async () => {
    if (!store || !isReady) {
      setPolicyLoading(false)
      return
    }

    try {
      setPolicyLoading(true)
      setPolicyError(null)

      const [labelNodes, policyNodes] = await Promise.all([
        store.list({ schemaId: ModerationLabelSchema._schemaId }),
        store.list({ schemaId: PublicInteractionPolicySchema._schemaId })
      ])

      const labels = labelNodes
        .map((node) => summarizeModerationLabel(node))
        .filter((label): label is ModerationLabelSummary => {
          return label !== null && commentIds.has(label.target)
        })

      const policies = policyNodes
        .map((node) => summarizePublicInteractionPolicy(node))
        .filter((policy): policy is PublicInteractionPolicySnapshot => {
          return policy !== null && policy.target === commentOptions.nodeId
        })

      setModerationLabels(labels)
      setLoadedPolicy(selectActiveInteractionPolicy(policies))
    } catch (err) {
      setPolicyError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setPolicyLoading(false)
    }
  }, [store, isReady, commentIds, commentOptions.nodeId])

  useEffect(() => {
    loadModerationState()
  }, [loadModerationState])

  useEffect(() => {
    if (!store || !isReady) return

    const handleChange = (event: NodeChangeEvent) => {
      const schemaId = event.node?.schemaId ?? event.change?.payload?.schemaId
      if (
        schemaId === ModerationLabelSchema._schemaId ||
        schemaId === PublicInteractionPolicySchema._schemaId
      ) {
        loadModerationState()
      }
    }

    const unsubscribe = store.subscribe(handleChange)
    return () => unsubscribe()
  }, [store, isReady, loadModerationState])

  const policy = providedPolicy === undefined ? loadedPolicy : providedPolicy
  const labelIndex = useMemo(() => createModerationLabelIndex(moderationLabels), [moderationLabels])
  const filterOptions = useMemo(
    () => ({
      hiddenLabels,
      collapsedLabels,
      includeCollapsed,
      includeQuarantined,
      includeHidden,
      minimumLabelConfidence
    }),
    [
      hiddenLabels,
      collapsedLabels,
      includeCollapsed,
      includeQuarantined,
      includeHidden,
      minimumLabelConfidence
    ]
  )

  const moderatedThreads = useMemo(
    () =>
      base.threads.map((thread) =>
        moderateThread(thread, {
          ...filterOptions,
          labelIndex,
          policy
        })
      ),
    [base.threads, filterOptions, labelIndex, policy]
  )

  const moderationByCommentId = useMemo(() => {
    return moderatedThreads.reduce((index, thread) => {
      index.set(thread.root.comment.id, thread.root)
      for (const reply of thread.replies) {
        index.set(reply.comment.id, reply)
      }
      return index
    }, new Map<string, ModeratedCommentNode>())
  }, [moderatedThreads])

  const threads = useMemo(
    () =>
      moderatedThreads
        .filter((thread) => thread.visible)
        .map((thread) => ({
          root: thread.root.comment,
          replies: thread.visibleReplies.map((reply) => reply.comment)
        })),
    [moderatedThreads]
  )

  const comments = useMemo(
    () => threads.flatMap((thread) => [thread.root, ...thread.replies]),
    [threads]
  )

  const canAddRootComment = useMemo(
    () =>
      evaluateInteractionPermission(selectPublicInteractionMode(policy, 'comment'), policy, {
        viewerDID,
        isAuthenticated,
        isVerified
      }),
    [policy, viewerDID, isAuthenticated, isVerified]
  )

  const canReply = useMemo(
    () =>
      evaluateInteractionPermission(selectPublicInteractionMode(policy, 'reply'), policy, {
        viewerDID,
        isAuthenticated,
        isVerified
      }),
    [policy, viewerDID, isAuthenticated, isVerified]
  )

  const addComment = useCallback(
    async (addOptions: AddCommentOptions): Promise<string | null> => {
      if (!canAddRootComment.allowed) {
        setPolicyError(new Error(canAddRootComment.reasons.join(', ') || 'Commenting is closed'))
        return null
      }
      return base.addComment(addOptions)
    },
    [base, canAddRootComment]
  )

  const replyTo = useCallback(
    async (
      rootCommentId: string,
      content: string,
      context?: ReplyContext
    ): Promise<string | null> => {
      if (!canReply.allowed) {
        setPolicyError(new Error(canReply.reasons.join(', ') || 'Replies are closed'))
        return null
      }
      return base.replyTo(rootCommentId, content, context)
    },
    [base, canReply]
  )

  return {
    ...base,
    comments,
    threads,
    allComments: base.comments,
    allThreads: base.threads,
    moderatedThreads,
    moderationByCommentId,
    moderationLabels,
    policy,
    policyLoading,
    policyError,
    count: comments.length,
    unresolvedCount: threads.filter((thread) => !thread.root.properties.resolved).length,
    hiddenCount: countModeratedComments(moderatedThreads, 'hidden'),
    collapsedCount: countModeratedComments(moderatedThreads, 'collapsed'),
    quarantinedCount: countModeratedComments(moderatedThreads, 'quarantined'),
    loading: base.loading || policyLoading,
    error: base.error ?? policyError,
    canAddRootComment,
    canReply,
    addComment,
    replyTo
  }
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

function filterActiveLabels(
  labels: readonly ModerationLabelSummary[],
  policy: PublicInteractionPolicySnapshot | null,
  minimumLabelConfidence: number | undefined
): ModerationLabelSummary[] {
  const activeLabels = new Set(policy?.activeLabels ?? [])
  const minimumConfidence = minimumLabelConfidence ?? 0

  return labels.filter((label) => {
    if (label.confidence < minimumConfidence) return false
    return activeLabels.size === 0 || activeLabels.has(label.value)
  })
}

function maxConfidence(labels: readonly ModerationLabelSummary[], value: string): number {
  return labels
    .filter((label) => label.value === value)
    .reduce((confidence, label) => Math.max(confidence, label.confidence), 0)
}

function countByVisibility(
  comments: readonly ModeratedCommentNode[],
  visibility: CommentVisibility
): number {
  return comments.filter((comment) => comment.visibility === visibility).length
}

function countModeratedComments(
  threads: readonly ModeratedCommentThread[],
  visibility: CommentVisibility
): number {
  return threads.reduce((count, thread) => {
    const rootCount = thread.root.visibility === visibility ? 1 : 0
    return count + rootCount + countByVisibility(thread.replies, visibility)
  }, 0)
}

function isVisibilityIncluded(
  visibility: CommentVisibility,
  options: ModerationFilterOptions
): boolean {
  if (visibility === 'visible') return true
  if (visibility === 'collapsed') return options.includeCollapsed ?? true
  if (visibility === 'quarantined') return options.includeQuarantined ?? false
  return options.includeHidden ?? false
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asInteractionMode(value: unknown, fallback: PublicInteractionMode): PublicInteractionMode {
  return isOneOf(value, ['open', 'authenticated', 'trusted', 'reviewed', 'closed'])
    ? value
    : fallback
}

function asFirstContactMode(value: unknown, fallback: FirstContactMode): FirstContactMode {
  return isOneOf(value, ['allow', 'slow-mode', 'quarantine', 'review', 'block']) ? value : fallback
}

function asModerationMode(value: unknown, fallback: PublicModerationMode): PublicModerationMode {
  return isOneOf(value, ['off', 'label-only', 'post-review', 'pre-filter', 'pre-review'])
    ? value
    : fallback
}

function asVisibility(value: unknown, fallback: CommentVisibility): CommentVisibility {
  return isOneOf(value, ['visible', 'collapsed', 'quarantined', 'hidden']) ? value : fallback
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
}
