/**
 * XNetThreadStore (0321) — BlockNote inline comments over the 0276
 * node-backed comment system.
 *
 * BlockNote splits comments the way xNet wants: only the ANCHOR is a mark
 * in the document (synced through the content-v4 fragment with the text it
 * annotates); thread CONTENT lives in this ThreadStore. Here that content
 * is the same LWW-log comment nodes the right panel reads (useComments),
 * so threads keep surviving without the doc open and keep flowing through
 * sync/authz like any other node.
 *
 * Body mapping is text-only v1: BlockNote `CommentBody` (Block JSON) is
 * flattened to the comment node's plain-text `content` on write and
 * rebuilt as a single paragraph on read.
 */
import { DefaultThreadStoreAuth, ThreadStore } from '@blocknote/core/comments'
import type { CommentBody, CommentData, ThreadData } from '@blocknote/core/comments'
import { blockInlineText, type BlockLike } from '../doc-utils'

/** Structural mirror of @xnetjs/react's CommentThread (0276). */
export interface XNetCommentNode {
  id: string
  createdAt: number
  properties: {
    content: string
    createdBy: string
    resolved: boolean
    resolvedBy?: string
    resolvedAt?: number
    edited: boolean
    editedAt?: number
  }
}

export interface XNetCommentThread {
  root: XNetCommentNode
  replies: XNetCommentNode[]
}

/**
 * The 0276 CRUD surface the host wires in (from useComments /
 * usePageComments). Functions are read through this object on every call,
 * so the host can hand in a mutable ref-backed adapter.
 */
export interface XNetThreadStoreHost {
  addComment(options: {
    content: string
    anchorType: 'text'
    anchorData: string
  }): Promise<string | null>
  replyTo(threadId: string, content: string): Promise<unknown>
  editComment(commentId: string, content: string): Promise<unknown>
  deleteComment(commentId: string): Promise<unknown>
  resolveThread(threadId: string): Promise<unknown>
  reopenThread(threadId: string): Promise<unknown>
}

/** Flatten a BlockNote comment body (Block JSON) to plain text (v1). */
export function commentBodyToText(body: CommentBody): string {
  if (typeof body === 'string') return body
  if (!Array.isArray(body)) return ''
  return (body as BlockLike[])
    .map((block) => blockInlineText(block))
    .filter(Boolean)
    .join('\n')
}

/** Rebuild a plain-text comment as a single-paragraph BlockNote body (v1). */
export function textToCommentBody(text: string): CommentBody {
  return [
    {
      type: 'paragraph',
      content: text ? [{ type: 'text', text, styles: {} }] : []
    }
  ]
}

function toCommentData(node: XNetCommentNode): CommentData {
  return {
    type: 'comment',
    id: node.id,
    userId: node.properties.createdBy,
    createdAt: new Date(node.createdAt),
    updatedAt: new Date(node.properties.editedAt ?? node.createdAt),
    reactions: [],
    metadata: {},
    body: textToCommentBody(node.properties.content)
  }
}

/** Convert a 0276 thread (root + replies) to BlockNote's ThreadData. */
export function toThreadData(thread: XNetCommentThread): ThreadData {
  const comments = [thread.root, ...thread.replies].map(toCommentData)
  const updatedAt = new Date(Math.max(...comments.map((comment) => comment.updatedAt.getTime())))
  return {
    type: 'thread',
    id: thread.root.id,
    createdAt: new Date(thread.root.createdAt),
    updatedAt,
    comments,
    resolved: thread.root.properties.resolved,
    ...(thread.root.properties.resolvedAt
      ? { resolvedUpdatedAt: new Date(thread.root.properties.resolvedAt) }
      : {}),
    ...(thread.root.properties.resolvedBy ? { resolvedBy: thread.root.properties.resolvedBy } : {}),
    metadata: {}
  }
}

/**
 * 0276 auth on top of BlockNote's default policy: reactions are not
 * supported in v1, so the affordances are hidden outright.
 */
export class XNetThreadStoreAuth extends DefaultThreadStoreAuth {
  canAddReaction(): boolean {
    return false
  }

  canDeleteReaction(): boolean {
    return false
  }
}

export class XNetThreadStore extends ThreadStore {
  private host: XNetThreadStoreHost
  private userId: string
  private threads = new Map<string, ThreadData>()
  private subscribers = new Set<(threads: Map<string, ThreadData>) => void>()

  constructor(host: XNetThreadStoreHost, userId: string, auth: XNetThreadStoreAuth) {
    super(auth)
    this.host = host
    this.userId = userId
  }

  /** Anchors come from BlockNote's default TipTap comment mark. */
  addThreadToDocument = undefined

  /**
   * Push the latest live thread list (from the host's reactive comment
   * query) into the store and notify BlockNote's UI.
   */
  setThreads(threads: readonly XNetCommentThread[]): void {
    const next = new Map<string, ThreadData>()
    for (const thread of threads) {
      next.set(thread.root.id, toThreadData(thread))
    }
    this.threads = next
    for (const subscriber of this.subscribers) {
      subscriber(this.threads)
    }
  }

  async createThread(options: {
    initialComment: { body: CommentBody; metadata?: unknown }
    metadata?: unknown
  }): Promise<ThreadData> {
    const content = commentBodyToText(options.initialComment.body)
    const id = await this.host.addComment({
      content,
      anchorType: 'text',
      anchorData: JSON.stringify({ source: 'blocknote' })
    })
    if (!id) {
      throw new Error('Failed to create comment thread')
    }
    const now = new Date()
    const created: ThreadData = {
      type: 'thread',
      id,
      createdAt: now,
      updatedAt: now,
      comments: [
        {
          type: 'comment',
          id,
          userId: this.userId,
          createdAt: now,
          updatedAt: now,
          reactions: [],
          metadata: {},
          body: options.initialComment.body
        }
      ],
      resolved: false,
      metadata: {}
    }
    // Optimistic: the live query will overwrite with node-backed data.
    this.threads.set(id, created)
    for (const subscriber of this.subscribers) subscriber(this.threads)
    return created
  }

  async addComment(options: {
    comment: { body: CommentBody; metadata?: unknown }
    threadId: string
  }): Promise<CommentData> {
    const content = commentBodyToText(options.comment.body)
    await this.host.replyTo(options.threadId, content)
    const now = new Date()
    return {
      type: 'comment',
      id: `pending-${options.threadId}-${now.getTime()}`,
      userId: this.userId,
      createdAt: now,
      updatedAt: now,
      reactions: [],
      metadata: {},
      body: options.comment.body
    }
  }

  async updateComment(options: {
    comment: { body: CommentBody; metadata?: unknown }
    threadId: string
    commentId: string
  }): Promise<void> {
    await this.host.editComment(options.commentId, commentBodyToText(options.comment.body))
  }

  async deleteComment(options: { threadId: string; commentId: string }): Promise<void> {
    await this.host.deleteComment(options.commentId)
  }

  async deleteThread(options: { threadId: string }): Promise<void> {
    const thread = this.threads.get(options.threadId)
    if (thread) {
      // Replies first, then the root (mirrors the 0276 panel behavior).
      for (const comment of thread.comments.slice(1)) {
        await this.host.deleteComment(comment.id)
      }
    }
    await this.host.deleteComment(options.threadId)
  }

  async resolveThread(options: { threadId: string }): Promise<void> {
    await this.host.resolveThread(options.threadId)
  }

  async unresolveThread(options: { threadId: string }): Promise<void> {
    await this.host.reopenThread(options.threadId)
  }

  async addReaction(): Promise<void> {
    throw new Error('Reactions are not supported yet (0321 v1)')
  }

  async deleteReaction(): Promise<void> {
    throw new Error('Reactions are not supported yet (0321 v1)')
  }

  getThread(threadId: string): ThreadData {
    const thread = this.threads.get(threadId)
    if (!thread) {
      throw new Error(`Thread not found: ${threadId}`)
    }
    return thread
  }

  getThreads(): Map<string, ThreadData> {
    return this.threads
  }

  subscribe(cb: (threads: Map<string, ThreadData>) => void): () => void {
    this.subscribers.add(cb)
    return () => this.subscribers.delete(cb)
  }
}
