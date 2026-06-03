/**
 * Policy-filtered counters for public reactions and replies.
 */

import type {
  InteractionPermission,
  ModerationFilterOptions,
  ModerationLabelSummary,
  PublicInteractionPolicySnapshot
} from './useModeratedComments'
import type { NodeChangeEvent, NodeState } from '@xnetjs/data'
import { ModerationLabelSchema, ReactionSchema } from '@xnetjs/data'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createModerationLabelIndex,
  evaluateInteractionPermission,
  summarizeModerationLabel,
  useVisibleComments
} from './useModeratedComments'
import { useNodeStore } from './useNodeStore'

const DEFAULT_HIDDEN_REACTION_LABELS = [
  'spam',
  'scam',
  'malware',
  'impersonation',
  'harassment'
] as const

// ─── Types ──────────────────────────────────────────────────────────────────

export type ReactionType = 'like' | 'repost' | 'bookmark' | 'emoji'

export interface ReactionNode {
  id: string
  target: string
  targetSchema?: string
  reactionType: ReactionType
  reactor: string
  emoji?: string
  annotation?: string
  createdAt: number
  createdBy: string
}

export interface ReactionCounterSnapshot {
  likes: number
  reposts: number
  bookmarks: number
  emoji: number
  replies: number
  totalReactions: number
  total: number
}

export interface UsePolicyFilteredReactionCountersOptions extends ModerationFilterOptions {
  nodeId: string
  targetSchema?: string
  viewerDID?: string
  isAuthenticated?: boolean
  isVerified?: boolean
  policy?: PublicInteractionPolicySnapshot | null
}

export interface AddReactionOptions {
  reactionType: ReactionType
  emoji?: string
  annotation?: string
}

export interface UsePolicyFilteredReactionCountersResult {
  reactions: ReactionNode[]
  visibleReactions: ReactionNode[]
  counts: ReactionCounterSnapshot
  rawCounts: ReactionCounterSnapshot
  hiddenReactionCount: number
  loading: boolean
  error: Error | null
  policy: PublicInteractionPolicySnapshot | null
  canReact: InteractionPermission
  canRepost: InteractionPermission
  addReaction: (options: AddReactionOptions) => Promise<string | null>
  removeReaction: (reactionId: string) => Promise<void>
  toggleReaction: (options: AddReactionOptions) => Promise<string | null>
  reload: () => Promise<void>
}

// ─── Pure Helpers ───────────────────────────────────────────────────────────

export function summarizeReactionNode(node: NodeState): ReactionNode | null {
  const target = asString(node.properties.target)
  const reactionType = asReactionType(node.properties.reactionType)
  const reactor = asString(node.properties.reactor)

  if (!target || !reactionType || !reactor) return null

  return {
    id: node.id,
    target,
    targetSchema: asString(node.properties.targetSchema),
    reactionType,
    reactor,
    emoji: asString(node.properties.emoji),
    annotation: asString(node.properties.annotation),
    createdAt: node.createdAt,
    createdBy: node.createdBy
  }
}

export function isReactionVisible(
  reaction: ReactionNode,
  labels: readonly ModerationLabelSummary[],
  policy: PublicInteractionPolicySnapshot | null,
  options: ModerationFilterOptions = {}
): boolean {
  if (policy?.blockedDIDs.includes(reaction.reactor)) return false
  if (policy?.mutedDIDs.includes(reaction.reactor)) return false
  if (policy?.moderationMode === 'off') return true
  if (policy?.defaultVisibility === 'hidden' && !(options.includeHidden ?? false)) return false
  if (policy?.defaultVisibility === 'quarantined' && !(options.includeQuarantined ?? false)) {
    return false
  }

  const activeLabels = new Set(policy?.activeLabels ?? [])
  const hiddenLabels = new Set(options.hiddenLabels ?? DEFAULT_HIDDEN_REACTION_LABELS)
  const hideThreshold = policy?.hideConfidenceThreshold ?? 0.85
  const safeConfidence = labels
    .filter((label) => label.value === 'safe')
    .reduce((confidence, label) => Math.max(confidence, label.confidence), 0)

  return !labels.some((label) => {
    if (activeLabels.size > 0 && !activeLabels.has(label.value)) return false
    if (!hiddenLabels.has(label.value)) return false
    return label.confidence >= hideThreshold && label.confidence > safeConfidence
  })
}

export function dedupeReactions(reactions: readonly ReactionNode[]): ReactionNode[] {
  const byActorAndType = reactions.reduce((index, reaction) => {
    const key = [reaction.reactionType, reaction.reactor, reaction.emoji ?? ''].join(':')
    const existing = index.get(key)
    if (!existing || reaction.createdAt >= existing.createdAt) {
      index.set(key, reaction)
    }
    return index
  }, new Map<string, ReactionNode>())

  return Array.from(byActorAndType.values())
}

export function createReactionCounterSnapshot(
  reactions: readonly ReactionNode[],
  replies: number
): ReactionCounterSnapshot {
  const unique = dedupeReactions(reactions)
  const countType = (reactionType: ReactionType) => {
    return unique.filter((reaction) => reaction.reactionType === reactionType).length
  }
  const totalReactions = unique.length

  return {
    likes: countType('like'),
    reposts: countType('repost'),
    bookmarks: countType('bookmark'),
    emoji: countType('emoji'),
    replies,
    totalReactions,
    total: totalReactions + replies
  }
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function usePolicyFilteredReactionCounters({
  nodeId,
  targetSchema,
  viewerDID,
  isAuthenticated,
  isVerified,
  policy: providedPolicy,
  hiddenLabels,
  collapsedLabels,
  includeCollapsed,
  includeQuarantined,
  includeHidden,
  minimumLabelConfidence
}: UsePolicyFilteredReactionCountersOptions): UsePolicyFilteredReactionCountersResult {
  const { store, isReady } = useNodeStore()
  const visibleComments = useVisibleComments({
    nodeId,
    viewerDID,
    isAuthenticated,
    isVerified,
    policy: providedPolicy,
    hiddenLabels,
    collapsedLabels,
    includeCollapsed,
    includeQuarantined,
    includeHidden,
    minimumLabelConfidence
  })
  const [reactions, setReactions] = useState<ReactionNode[]>([])
  const [labels, setLabels] = useState<ModerationLabelSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const policy = providedPolicy === undefined ? visibleComments.policy : providedPolicy

  const loadReactions = useCallback(async () => {
    if (!store || !isReady) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      const [reactionNodes, labelNodes] = await Promise.all([
        store.list({ schemaId: ReactionSchema._schemaId }),
        store.list({ schemaId: ModerationLabelSchema._schemaId })
      ])

      const nextReactions = reactionNodes
        .map((node) => summarizeReactionNode(node))
        .filter((reaction): reaction is ReactionNode => {
          return reaction !== null && reaction.target === nodeId
        })
      const reactionIds = new Set(nextReactions.map((reaction) => reaction.id))
      const nextLabels = labelNodes
        .map((node) => summarizeModerationLabel(node))
        .filter((label): label is ModerationLabelSummary => {
          return label !== null && reactionIds.has(label.target)
        })

      setReactions(nextReactions)
      setLabels(nextLabels)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
    }
  }, [store, isReady, nodeId])

  useEffect(() => {
    loadReactions()
  }, [loadReactions])

  useEffect(() => {
    if (!store || !isReady) return

    const handleChange = (event: NodeChangeEvent) => {
      const schemaId = event.node?.schemaId ?? event.change?.payload?.schemaId
      if (schemaId === ReactionSchema._schemaId || schemaId === ModerationLabelSchema._schemaId) {
        loadReactions()
      }
    }

    const unsubscribe = store.subscribe(handleChange)
    return () => unsubscribe()
  }, [store, isReady, loadReactions])

  const labelIndex = useMemo(() => createModerationLabelIndex(labels), [labels])
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

  const visibleReactions = useMemo(() => {
    return reactions.filter((reaction) =>
      isReactionVisible(reaction, labelIndex.get(reaction.id) ?? [], policy, filterOptions)
    )
  }, [reactions, labelIndex, policy, filterOptions])

  const canReact = useMemo(
    () =>
      evaluateInteractionPermission(policy?.reactionMode ?? 'open', policy, {
        viewerDID,
        isAuthenticated,
        isVerified
      }),
    [policy, viewerDID, isAuthenticated, isVerified]
  )
  const canRepost = useMemo(
    () =>
      evaluateInteractionPermission(policy?.quoteMode ?? 'open', policy, {
        viewerDID,
        isAuthenticated,
        isVerified
      }),
    [policy, viewerDID, isAuthenticated, isVerified]
  )

  const counts = useMemo(
    () => createReactionCounterSnapshot(visibleReactions, visibleComments.count),
    [visibleReactions, visibleComments.count]
  )
  const rawCounts = useMemo(
    () => createReactionCounterSnapshot(reactions, visibleComments.allComments.length),
    [reactions, visibleComments.allComments.length]
  )

  const addReaction = useCallback(
    async (options: AddReactionOptions): Promise<string | null> => {
      if (!store || !isReady || !viewerDID) return null

      const permission = options.reactionType === 'repost' ? canRepost : canReact
      if (!permission.allowed) {
        setError(new Error(permission.reasons.join(', ') || 'Reactions are closed'))
        return null
      }

      try {
        const node = await store.create({
          schemaId: ReactionSchema._schemaId,
          properties: {
            target: nodeId,
            targetSchema,
            reactionType: options.reactionType,
            reactor: viewerDID,
            emoji: options.emoji,
            annotation: options.annotation
          }
        })

        return node.id
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
        return null
      }
    },
    [store, isReady, viewerDID, canRepost, canReact, nodeId, targetSchema]
  )

  const removeReaction = useCallback(
    async (reactionId: string): Promise<void> => {
      if (!store || !isReady) return

      try {
        await store.delete(reactionId)
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
      }
    },
    [store, isReady]
  )

  const toggleReaction = useCallback(
    async (options: AddReactionOptions): Promise<string | null> => {
      const existing = reactions.find((reaction) => {
        return (
          reaction.reactor === viewerDID &&
          reaction.reactionType === options.reactionType &&
          (reaction.emoji ?? '') === (options.emoji ?? '')
        )
      })

      if (existing) {
        await removeReaction(existing.id)
        return null
      }

      return addReaction(options)
    },
    [reactions, viewerDID, removeReaction, addReaction]
  )

  return {
    reactions,
    visibleReactions,
    counts,
    rawCounts,
    hiddenReactionCount: reactions.length - visibleReactions.length,
    loading: loading || visibleComments.loading,
    error: error ?? visibleComments.error,
    policy,
    canReact,
    canRepost,
    addReaction,
    removeReaction,
    toggleReaction,
    reload: loadReactions
  }
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function asReactionType(value: unknown): ReactionType | undefined {
  return isOneOf(value, ['like', 'repost', 'bookmark', 'emoji']) ? value : undefined
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
}
