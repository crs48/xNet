# 05: Editor Integration

> ProseMirror plugin for comment interactions + optional sidebar

**Duration:** 2-3 days  
**Dependencies:** [02-comment-mark.md](./02-comment-mark.md), [03-anchoring.md](./03-anchoring.md), [04-comment-popover.md](./04-comment-popover.md)

## Overview

The editor integration connects the CommentMark, anchoring logic, and popover UI into a cohesive experience. A ProseMirror plugin handles click/hover events on comment marks, and the popover appears inline.

```mermaid
flowchart TB
    subgraph "Editor Layer"
        PM[ProseMirror Plugin]
        MARK[CommentMark]
        BUBBLE[Bubble Menu<br/>"Comment" action]
    end

    subgraph "State Management"
        HOOK[useCommentPopover]
        STORE[useNodes query<br/>CommentThread + Comments]
    end

    subgraph "UI Layer"
        POPOVER[CommentPopover]
        SIDEBAR[CommentSidebar<br/>optional]
    end

    PM -->|"click/hover on mark"| HOOK
    BUBBLE -->|"create thread"| STORE
    HOOK --> POPOVER
    STORE --> POPOVER
    STORE --> SIDEBAR
```

## Implementation

### Comment Plugin (ProseMirror)

```typescript
// packages/editor/src/extensions/comment-plugin.ts

import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Extension } from '@tiptap/core'

export interface CommentPluginOptions {
  onClickComment: (threadId: string, anchorEl: HTMLElement) => void
  onHoverComment: (threadId: string, anchorEl: HTMLElement) => void
  onLeaveComment: () => void
  onCreateComment: (from: number, to: number) => void
}

export const CommentPlugin = Extension.create<CommentPluginOptions>({
  name: 'commentPlugin',

  addOptions() {
    return {
      onClickComment: () => {},
      onHoverComment: () => {},
      onLeaveComment: () => {},
      onCreateComment: () => {}
    }
  },

  addProseMirrorPlugins() {
    const options = this.options

    return [
      new Plugin({
        key: new PluginKey('commentInteractions'),

        props: {
          handleClick(view, pos, event) {
            const target = event.target as HTMLElement
            const commentSpan = target.closest('[data-comment]') as HTMLElement

            if (commentSpan) {
              const threadId = commentSpan.getAttribute('data-thread-id')
              if (threadId) {
                options.onClickComment(threadId, commentSpan)
                return true
              }
            }
            return false
          },

          handleDOMEvents: {
            mouseover(view, event) {
              const target = event.target as HTMLElement
              const commentSpan = target.closest('[data-comment]') as HTMLElement

              if (commentSpan) {
                const threadId = commentSpan.getAttribute('data-thread-id')
                if (threadId) {
                  options.onHoverComment(threadId, commentSpan)
                }
              }
              return false
            },

            mouseout(view, event) {
              const target = event.target as HTMLElement
              const relatedTarget = event.relatedTarget as HTMLElement | null

              // Only fire leave if we're leaving comment spans entirely
              if (target.closest('[data-comment]') && !relatedTarget?.closest('[data-comment]')) {
                options.onLeaveComment()
              }
              return false
            }
          },

          // Add selected class to the active comment mark
          decorations(state) {
            // This would be populated by the plugin state when a comment is focused
            return DecorationSet.empty
          }
        }
      })
    ]
  }
})
```

### Comment Creation Flow

```typescript
// packages/editor/src/comments/create-comment.ts

import { Editor } from '@tiptap/core'
import { NodeStore } from '@xnet/data'
import { captureTextAnchor } from './text-anchor'
import { encodeAnchor } from '@xnet/data'

export interface CreateCommentOptions {
  editor: Editor
  store: NodeStore
  targetNodeId: string // The Page/Document node this editor is editing
  content: string // Initial comment text
}

/**
 * Create a comment thread on the current text selection.
 * 1. Captures Yjs RelativePosition anchor
 * 2. Creates CommentThread node
 * 3. Creates initial Comment node
 * 4. Applies CommentMark to selection
 */
export async function createTextComment({
  editor,
  store,
  targetNodeId,
  content
}: CreateCommentOptions): Promise<{ threadId: string; commentId: string } | null> {
  // 1. Capture anchor from current selection
  const anchor = captureTextAnchor(editor)
  if (!anchor) return null

  // 2. Create thread
  const thread = await store.create({
    schemaId: 'xnet://xnet.dev/CommentThread',
    properties: {
      targetNodeId,
      anchorType: 'text',
      anchorData: encodeAnchor(anchor),
      resolved: false
    }
  })

  // 3. Create initial comment
  const comment = await store.create({
    schemaId: 'xnet://xnet.dev/Comment',
    properties: {
      threadId: thread.id,
      content,
      edited: false
    }
  })

  // 4. Apply mark to selection
  editor.chain().focus().setComment(thread.id).run()

  return { threadId: thread.id, commentId: comment.id }
}
```

### React Integration Hook

```typescript
// packages/react/src/hooks/useDocumentComments.ts

import { useMemo, useCallback } from 'react'
import { useNodes, useNodeStore } from './useNodes'
import { CommentThread, Comment, decodeAnchor, TextAnchor } from '@xnet/data'

interface UseDocumentCommentsOptions {
  /** The document Node ID to get comments for */
  documentId: string
}

export function useDocumentComments({ documentId }: UseDocumentCommentsOptions) {
  const store = useNodeStore()

  // Query all threads targeting this document
  const threads = useNodes<CommentThread>({
    schemaId: 'xnet://xnet.dev/CommentThread',
    filter: { targetNodeId: documentId }
  })

  // Query all comments (we'll group by thread)
  const allComments = useNodes<Comment>({
    schemaId: 'xnet://xnet.dev/Comment'
  })

  // Group comments by thread
  const commentsByThread = useMemo(() => {
    const map = new Map<string, Comment[]>()
    for (const comment of allComments) {
      const threadId = comment.properties.threadId as string
      if (!map.has(threadId)) map.set(threadId, [])
      map.get(threadId)!.push(comment)
    }
    // Sort each thread's comments by creation time
    for (const [, comments] of map) {
      comments.sort(
        (a, b) => (a.properties.createdAt as number) - (b.properties.createdAt as number)
      )
    }
    return map
  }, [allComments])

  // Thread actions
  const createReply = useCallback(
    async (threadId: string, content: string) => {
      await store.create({
        schemaId: 'xnet://xnet.dev/Comment',
        properties: { threadId, content, edited: false }
      })
    },
    [store]
  )

  const resolveThread = useCallback(
    async (threadId: string) => {
      await store.update(threadId, {
        properties: { resolved: true, resolvedAt: Date.now() }
      })
    },
    [store]
  )

  const reopenThread = useCallback(
    async (threadId: string) => {
      await store.update(threadId, {
        properties: { resolved: false, resolvedBy: null, resolvedAt: null }
      })
    },
    [store]
  )

  const deleteComment = useCallback(
    async (commentId: string) => {
      await store.delete(commentId)
    },
    [store]
  )

  const editComment = useCallback(
    async (commentId: string, content: string) => {
      await store.update(commentId, {
        properties: { content, edited: true, editedAt: Date.now() }
      })
    },
    [store]
  )

  return {
    threads,
    commentsByThread,
    createReply,
    resolveThread,
    reopenThread,
    deleteComment,
    editComment
  }
}
```

### Bubble Menu "Comment" Action

Add a "Comment" button to the existing bubble menu that appears on text selection:

```typescript
// packages/editor/src/components/BubbleMenuCommentAction.tsx

import React, { useState } from 'react'
import { Editor } from '@tiptap/core'
import { createTextComment } from '../comments/create-comment'

interface Props {
  editor: Editor
  targetNodeId: string
  store: NodeStore
}

export function BubbleMenuCommentAction({ editor, targetNodeId, store }: Props) {
  const [isCreating, setIsCreating] = useState(false)
  const [commentText, setCommentText] = useState('')

  const handleCreate = async () => {
    if (!commentText.trim()) return

    await createTextComment({
      editor,
      store,
      targetNodeId,
      content: commentText.trim()
    })

    setCommentText('')
    setIsCreating(false)
  }

  if (isCreating) {
    return (
      <div className="bubble-menu-comment-input">
        <textarea
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="Add a comment..."
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleCreate()
            if (e.key === 'Escape') setIsCreating(false)
          }}
        />
        <button onClick={handleCreate} disabled={!commentText.trim()}>
          Comment
        </button>
      </div>
    )
  }

  return (
    <button
      className="bubble-menu-action"
      onClick={() => setIsCreating(true)}
      title="Add comment"
    >
      💬
    </button>
  )
}
```

### Optional Sidebar

The sidebar is a secondary navigation tool for reviewing all threads at once:

```typescript
// packages/editor/src/components/CommentSidebar.tsx

import React from 'react'
import { CommentThread, Comment, decodeAnchor, TextAnchor } from '@xnet/data'

interface CommentSidebarProps {
  threads: CommentThread[]
  commentsByThread: Map<string, Comment[]>
  onSelectThread: (threadId: string) => void
  showResolved?: boolean
}

export function CommentSidebar({
  threads,
  commentsByThread,
  onSelectThread,
  showResolved = false
}: CommentSidebarProps) {
  const filteredThreads = threads.filter((t) =>
    showResolved || !(t.properties.resolved as boolean)
  )

  return (
    <div className="comment-sidebar">
      <div className="comment-sidebar__header">
        <h3>Comments ({filteredThreads.length})</h3>
      </div>
      <div className="comment-sidebar__list">
        {filteredThreads.map((thread) => {
          const comments = commentsByThread.get(thread.id) ?? []
          const firstComment = comments[0]
          const anchor = thread.properties.anchorType === 'text'
            ? decodeAnchor<TextAnchor>(thread.properties.anchorData as string)
            : null

          return (
            <div
              key={thread.id}
              className="comment-sidebar__item"
              onClick={() => onSelectThread(thread.id)}
            >
              {anchor?.quotedText && (
                <div className="comment-sidebar__quote">
                  "{anchor.quotedText}"
                </div>
              )}
              {firstComment && (
                <div className="comment-sidebar__preview">
                  {firstComment.properties.content as string}
                </div>
              )}
              <div className="comment-sidebar__meta">
                {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
                {thread.properties.resolved && ' · Resolved'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

## Keyboard Shortcuts

| Shortcut           | Action                                     |
| ------------------ | ------------------------------------------ |
| `Cmd+Shift+M`      | Create comment on selection                |
| `Escape`           | Dismiss popover                            |
| `Cmd+Enter`        | Submit reply                               |
| `Tab` (in popover) | Move focus between reply input and actions |

## Checklist

- [ ] Create CommentPlugin extension (click/hover handlers)
- [ ] Implement createTextComment flow (anchor → thread → comment → mark)
- [ ] Create useDocumentComments hook
- [ ] Add "Comment" action to bubble menu
- [ ] Create CommentSidebar component
- [ ] Wire up editor ↔ popover ↔ store
- [ ] Add keyboard shortcuts
- [ ] Handle mark restoration on document open
- [ ] Tests pass

---

[Back to README](./README.md) | [Previous: Comment Popover](./04-comment-popover.md) | [Next: Database Comments](./06-database-comments.md)
