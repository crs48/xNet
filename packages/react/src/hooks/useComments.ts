/**
 * useComments - Universal hook for comments on any Node.
 *
 * Following the Universal Social Primitives pattern, this hook works on
 * any Node type (Pages, Tasks, Database records, Canvas, etc.).
 *
 * @example
 * ```tsx
 * // Comments on a page
 * const { threads, addComment, replyTo, resolveThread } = useComments({ nodeId: pageId })
 *
 * // Filter to text anchors only (for editor)
 * const { threads } = useComments({ nodeId: pageId, anchorType: 'text' })
 * ```
 */
import type { NodeState, NodeChangeEvent } from '@xnetjs/data'
import { CommentSchema } from '@xnetjs/data'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNodeStore } from './useNodeStore'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface UseCommentsOptions {
  /** The Node ID to get comments for (any schema) */
  nodeId: string
  /** Optional: filter to specific anchor type */
  anchorType?: 'text' | 'cell' | 'row' | 'column' | 'canvas-position' | 'canvas-object' | 'node'
}

export interface CommentThread {
  /** The root comment (holds anchor data and resolved state) */
  root: CommentNode
  /** Replies to this thread (sorted by Lamport time) */
  replies: CommentNode[]
}

/** Flattened comment node for easier access */
export interface CommentNode {
  id: string
  schemaId: string
  createdAt: number
  lamportTime: number
  wallTime: number
  properties: {
    target: string
    targetSchema?: string
    inReplyTo?: string
    anchorType: string
    anchorData: string
    content: string
    attachments?: string[]
    replyToUser?: string
    replyToCommentId?: string
    resolved: boolean
    resolvedBy?: string
    resolvedAt?: number
    edited: boolean
    editedAt?: number
    createdBy: string
  }
}

export interface AddCommentOptions {
  /** Comment content (GitHub-flavored markdown) */
  content: string
  /** Type of anchor */
  anchorType: 'text' | 'cell' | 'row' | 'column' | 'canvas-position' | 'canvas-object' | 'node'
  /** JSON-encoded anchor data */
  anchorData: string
  /** Schema IRI of the target Node (optimization) */
  targetSchema?: string
}

export interface ReplyContext {
  /** DID of user being replied to (for "replying to @user" UI) */
  replyToUser?: string
  /** Comment ID being referenced (for "in reply to X" display) */
  replyToCommentId?: string
}

export interface UseCommentsResult {
  /** All comments on the target node */
  comments: CommentNode[]
  /** Comments grouped into threads (root + replies) */
  threads: CommentThread[]
  /** Total comment count */
  count: number
  /** Count of unresolved threads */
  unresolvedCount: number
  /** Whether loading */
  loading: boolean
  /** Any error */
  error: Error | null
  /** Add a new root comment */
  addComment: (options: AddCommentOptions) => Promise<string | null>
  /** Reply to a thread */
  replyTo: (
    rootCommentId: string,
    content: string,
    context?: ReplyContext
  ) => Promise<string | null>
  /** Resolve a thread */
  resolveThread: (rootCommentId: string) => Promise<void>
  /** Reopen a resolved thread */
  reopenThread: (rootCommentId: string) => Promise<void>
  /** Delete a comment (soft delete) */
  deleteComment: (commentId: string) => Promise<void>
  /** Delete an entire thread (root + all replies) */
  deleteThread: (rootCommentId: string) => Promise<void>
  /** Edit a comment */
  editComment: (commentId: string, content: string) => Promise<void>
  /** Reload comments */
  reload: () => Promise<void>
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Universal hook for comments on any Node.
 */
export function useComments({ nodeId, anchorType }: UseCommentsOptions): UseCommentsResult {
  const { store, isReady } = useNodeStore()
  const [comments, setComments] = useState<CommentNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Track the query so we can re-run on changes
  const queryRef = useRef({ nodeId, anchorType })
  queryRef.current = { nodeId, anchorType }

  // Load comments
  const loadComments = useCallback(async () => {
    if (!store || !isReady) return

    try {
      setLoading(true)
      setError(null)

      // Get all comments for this schema, then filter in memory
      const nodes = await store.list({
        schemaId: CommentSchema._schemaId
      })

      // Filter to comments targeting our node.
      // Replies (inReplyTo set) are exempt from the anchorType filter because
      // they are created with anchorType 'node' regardless of the root's type.
      const filtered = nodes.filter((n: NodeState) => {
        if (n.properties.target !== queryRef.current.nodeId) return false
        if (
          queryRef.current.anchorType &&
          n.properties.anchorType !== queryRef.current.anchorType &&
          !n.properties.inReplyTo
        ) {
          return false
        }
        return true
      })

      // Convert to CommentNode format
      const commentNodes = filtered.map((n: NodeState) => nodeToComment(n))
      setComments(commentNodes)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
    }
  }, [store, isReady])

  // Initial load
  useEffect(() => {
    loadComments()
  }, [loadComments])

  // Subscribe to store changes
  useEffect(() => {
    if (!store || !isReady) return

    const handleChange = (event: NodeChangeEvent) => {
      // Reload if a comment was changed
      // Check both the node's schemaId and if it targets our node
      if (event.node?.schemaId === CommentSchema._schemaId) {
        // Check if it targets our node
        if (event.node.properties.target === nodeId) {
          loadComments()
        }
      } else if (event.change?.payload?.schemaId === CommentSchema._schemaId) {
        // For cases where node might be null (deleted)
        loadComments()
      }
    }

    const unsubscribe = store.subscribe(handleChange)
    return () => unsubscribe()
  }, [store, isReady, loadComments, nodeId])

  // Group comments into threads (flat threading)
  const threads = useMemo((): CommentThread[] => {
    const threadMap = new Map<string, CommentThread>()

    // First pass: find all root comments (inReplyTo is null/undefined)
    for (const comment of comments) {
      if (!comment.properties.inReplyTo) {
        threadMap.set(comment.id, { root: comment, replies: [] })
      }
    }

    // Second pass: attach replies to their root (flat - all replies point to root)
    for (const comment of comments) {
      const rootId = comment.properties.inReplyTo
      if (rootId) {
        const thread = threadMap.get(rootId)
        if (thread) {
          thread.replies.push(comment)
        }
        // Note: if thread not found, reply is orphaned (root was deleted)
      }
    }

    // Sort replies by Lamport time for consistent ordering across peers
    for (const thread of threadMap.values()) {
      thread.replies.sort((a, b) => a.lamportTime - b.lamportTime)
    }

    return Array.from(threadMap.values())
  }, [comments])

  // Count of unresolved threads
  const unresolvedCount = useMemo(() => {
    return threads.filter((t) => !t.root.properties.resolved).length
  }, [threads])

  // Add a new root comment
  const addComment = useCallback(
    async (options: AddCommentOptions): Promise<string | null> => {
      if (!store || !isReady) return null

      try {
        const node = await store.create({
          schemaId: CommentSchema._schemaId,
          properties: {
            target: nodeId,
            targetSchema: options.targetSchema,
            anchorType: options.anchorType,
            anchorData: options.anchorData,
            content: options.content,
            resolved: false,
            edited: false
          }
        })

        return node.id
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
        return null
      }
    },
    [store, isReady, nodeId]
  )

  // Reply to a thread
  const replyTo = useCallback(
    async (
      rootCommentId: string,
      content: string,
      context?: ReplyContext
    ): Promise<string | null> => {
      if (!store || !isReady) return null

      // Get the root to copy its target info
      const root = threads.find((t) => t.root.id === rootCommentId)?.root
      if (!root) {
        setError(new Error('Thread root not found'))
        return null
      }

      try {
        const node = await store.create({
          schemaId: CommentSchema._schemaId,
          properties: {
            target: nodeId,
            targetSchema: root.properties.targetSchema,
            inReplyTo: rootCommentId, // Always points to root (flat threading)
            anchorType: 'node', // Replies don't need positional anchors
            anchorData: '{}',
            content,
            replyToUser: context?.replyToUser,
            replyToCommentId: context?.replyToCommentId,
            resolved: false,
            edited: false
          }
        })

        return node.id
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
        return null
      }
    },
    [store, isReady, nodeId, threads]
  )

  // Resolve a thread
  const resolveThread = useCallback(
    async (rootCommentId: string): Promise<void> => {
      if (!store || !isReady) return

      try {
        await store.update(rootCommentId, {
          properties: {
            resolved: true,
            resolvedAt: Date.now()
          }
        })
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
      }
    },
    [store, isReady]
  )

  // Reopen a resolved thread
  const reopenThread = useCallback(
    async (rootCommentId: string): Promise<void> => {
      if (!store || !isReady) return

      try {
        await store.update(rootCommentId, {
          properties: {
            resolved: false,
            resolvedBy: null,
            resolvedAt: null
          }
        })
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
      }
    },
    [store, isReady]
  )

  // Delete a comment
  const deleteComment = useCallback(
    async (commentId: string): Promise<void> => {
      if (!store || !isReady) return

      try {
        const thread = threads.find((t) => t.root.id === commentId)
        const isRoot = thread !== undefined

        if (isRoot) {
          if (thread.replies.length > 0) {
            // Root has replies: tombstone to preserve thread structure
            await store.update(commentId, {
              properties: { content: '[deleted]' }
            })
          } else {
            // Root has no replies: safe to fully delete
            await store.delete(commentId)
          }
        } else {
          // Reply: normal soft-delete (never breaks other replies)
          await store.delete(commentId)
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
      }
    },
    [store, isReady, threads]
  )

  // Delete an entire thread
  const deleteThread = useCallback(
    async (rootCommentId: string): Promise<void> => {
      if (!store || !isReady) return

      const thread = threads.find((t) => t.root.id === rootCommentId)
      if (!thread) return

      try {
        // Soft-delete all replies first, then root
        for (const reply of thread.replies) {
          await store.delete(reply.id)
        }
        await store.delete(rootCommentId)
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
      }
    },
    [store, isReady, threads]
  )

  // Edit a comment
  const editComment = useCallback(
    async (commentId: string, content: string): Promise<void> => {
      if (!store || !isReady) return

      try {
        await store.update(commentId, {
          properties: {
            content,
            edited: true,
            editedAt: Date.now()
          }
        })
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
      }
    },
    [store, isReady]
  )

  return {
    comments,
    threads,
    count: comments.length,
    unresolvedCount,
    loading,
    error,
    addComment,
    replyTo,
    resolveThread,
    reopenThread,
    deleteComment,
    deleteThread,
    editComment,
    reload: loadComments
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert NodeState to CommentNode for easier access.
 */
function nodeToComment(node: NodeState): CommentNode {
  // Get Lamport time from the most recent property timestamp
  // NodeState stores timestamps per property (PropertyTimestamp has { lamport: LamportTimestamp, wallTime })
  // LamportTimestamp is { time: number, author: DID }
  const firstTimestamp = Object.values(node.timestamps)[0]
  const lamportTime = firstTimestamp?.lamport?.time ?? 0
  const wallTime = firstTimestamp?.wallTime ?? node.createdAt

  return {
    id: node.id,
    schemaId: node.schemaId,
    createdAt: node.createdAt,
    lamportTime,
    wallTime,
    properties: {
      target: node.properties.target as string,
      targetSchema: node.properties.targetSchema as string | undefined,
      inReplyTo: node.properties.inReplyTo as string | undefined,
      anchorType: node.properties.anchorType as string,
      anchorData: node.properties.anchorData as string,
      content: node.properties.content as string,
      attachments: node.properties.attachments as string[] | undefined,
      replyToUser: node.properties.replyToUser as string | undefined,
      replyToCommentId: node.properties.replyToCommentId as string | undefined,
      resolved: (node.properties.resolved as boolean) ?? false,
      resolvedBy: node.properties.resolvedBy as string | undefined,
      resolvedAt: node.properties.resolvedAt as number | undefined,
      edited: (node.properties.edited as boolean) ?? false,
      editedAt: node.properties.editedAt as number | undefined,
      createdBy: node.createdBy
    }
  }
}
