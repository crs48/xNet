/**
 * PageView - editor with comment system (extracted from the doc route
 * for 0166 so the workbench ViewHost can mount it directly).
 *
 * Features:
 * - Collaborative editing via Yjs
 * - Comment system with inline popover and sidebar
 * - Real-time presence indicators
 */
import { useNavigate } from '@tanstack/react-router'
import { PageSchema } from '@xnetjs/data'
import { CommentMark, CommentPlugin, restoreCommentMarks } from '@xnetjs/editor/extensions'
import { buildTaskMentionSuggestions, type Editor } from '@xnetjs/editor/react'
import { useNode, useComments, useIdentity, usePageTaskSync } from '@xnetjs/react'
import {
  CommentPopover,
  CommentsSidebar,
  OrphanedThreadList,
  getNodeTransfer,
  hasNodeTransfer,
  type CommentThreadData,
  type OrphanedThread
} from '@xnetjs/ui'
import { MessageSquare } from 'lucide-react'
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  revealContextSection,
  useContextPanel,
  type ContextPanelSection
} from '../workbench/context-panel'
import { navigateToNode } from '../workbench/navigation'
import { useWorkbench, type TabNodeType } from '../workbench/state'
import { BacklinksPanel } from './BacklinksPanel'
import { Editor as EditorComponent } from './Editor'
import { PageTasksPanel } from './PageTasksPanel'
import { PresenceAvatars } from './PresenceAvatars'
import { ShareButton } from './ShareButton'

// ─── Comment Popover State ──────────────────────────────────────────────────────

interface PopoverState {
  visible: boolean
  mode: 'preview' | 'full'
  threadId: string | null
  anchor: HTMLElement | null
}

const INITIAL_POPOVER_STATE: PopoverState = {
  visible: false,
  mode: 'preview',
  threadId: null,
  anchor: null
}

/** State for creating a new comment (before submission) */
interface NewCommentState {
  visible: boolean
  anchorData: string
  selectionFrom: number
  selectionTo: number
}

/** Render the loading / error placeholders, or null when ready. */
function pageLoadPlaceholder(
  loading: boolean,
  error: Error | null,
  ready: boolean
): JSX.Element | null {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading document...
      </div>
    )
  }
  if (error) {
    return <div className="text-center p-6 text-danger">Error: {error.message}</div>
  }
  if (!ready) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading...
      </div>
    )
  }
  return null
}

function lookupThread(
  threadDataMap: Map<string, CommentThreadData>,
  threadId: string | null
): CommentThreadData | null {
  if (!threadId) return null
  return threadDataMap.get(threadId) ?? null
}

export function PageView({ docId }: { docId: string }) {
  const navigate = useNavigate()
  const { identity } = useIdentity()
  const did = identity?.did

  // Load document with Y.Doc, sync, presence, and auto-create
  const {
    data: page,
    doc,
    update,
    loading,
    error,
    syncStatus,
    peerCount,
    presence,
    awareness,
    isDirty,
    lastSavedAt
  } = useNode(PageSchema, docId, {
    createIfMissing: { title: 'Untitled' },
    did: did ?? undefined
  })
  const { handleTasksChange } = usePageTaskSync({ pageId: docId })

  // Keep the workbench tab title in sync with the page title (0166).
  const pageTitle = page?.title
  useEffect(() => {
    if (pageTitle) useWorkbench.getState().setTabTitle(docId, pageTitle)
  }, [docId, pageTitle])

  // Editing promotes a preview tab to a permanent one (0166).
  useEffect(() => {
    if (isDirty) useWorkbench.getState().promoteTab(`page:${docId}`)
  }, [isDirty, docId])
  const mentionSuggestions = useMemo(
    () => buildTaskMentionSuggestions(presence, did),
    [did, presence]
  )

  // ─── Comments Integration ─────────────────────────────────────────────────────

  const {
    threads,
    addComment,
    replyTo,
    resolveThread,
    reopenThread,
    deleteComment,
    editComment,
    unresolvedCount
  } = useComments({ nodeId: docId, anchorType: 'text' })

  // Popover state for comment interactions
  const [popoverState, setPopoverState] = useState<PopoverState>(INITIAL_POPOVER_STATE)
  const [newCommentState, setNewCommentState] = useState<NewCommentState | null>(null)
  const [orphanedIds, setOrphanedIds] = useState<string[]>([])
  const [orphanedCollapsed, setOrphanedCollapsed] = useState(false)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const marksRestoredRef = useRef(false)
  const [editorReady, setEditorReady] = useState(false)

  // Track hover state for mark and popover
  const markHoveredRef = useRef(false)
  const popoverHoveredRef = useRef(false)

  // Reset mark restoration state when switching documents
  useEffect(() => {
    marksRestoredRef.current = false
    editorRef.current = null
    setEditorReady(false)
  }, [docId])

  // Handle editor ready - store ref and trigger mark restoration
  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor
    setEditorReady(true)
  }, [])

  // Restore comment marks when editor is ready and threads are loaded
  useEffect(() => {
    if (!editorRef.current || marksRestoredRef.current || threads.length === 0) return

    const commentsToRestore = threads.map((t) => ({
      id: t.root.id,
      properties: {
        anchorType: t.root.properties.anchorType,
        anchorData: t.root.properties.anchorData,
        resolved: t.root.properties.resolved
      }
    }))

    const { resolved, orphaned } = restoreCommentMarks(editorRef.current, commentsToRestore)

    if (resolved.length > 0 || orphaned.length > 0) {
      marksRestoredRef.current = true
      setOrphanedIds(orphaned)
      console.log(`[Comments] Restored ${resolved.length} marks, ${orphaned.length} orphaned`)
    }
  }, [threads, editorReady])

  // Build orphaned threads list for display
  const orphanedThreads = useMemo((): OrphanedThread[] => {
    const result: OrphanedThread[] = []

    for (const id of orphanedIds) {
      const thread = threads.find((t) => t.root.id === id)
      if (!thread) continue

      // Parse anchor data to get context
      let context: string | undefined
      try {
        const anchor = JSON.parse(thread.root.properties.anchorData)
        context = anchor.quotedText
      } catch {
        // Ignore parse errors
      }

      result.push({
        comment: {
          id: thread.root.id,
          author: thread.root.properties.createdBy,
          authorDisplayName: undefined,
          content: thread.root.properties.content,
          createdAt: thread.root.createdAt,
          replyCount: thread.replies.length
        },
        reason: 'text-deleted',
        context
      })
    }

    return result
  }, [orphanedIds, threads])

  // Convert threads to format expected by CommentPopover/CommentsSidebar
  const threadDataMap = useMemo(() => {
    const map = new Map<string, CommentThreadData>()
    for (const thread of threads) {
      map.set(thread.root.id, {
        root: {
          id: thread.root.id,
          author: thread.root.properties.createdBy,
          authorDisplayName: undefined,
          content: thread.root.properties.content,
          createdAt: thread.root.createdAt,
          edited: thread.root.properties.edited,
          editedAt: thread.root.properties.editedAt,
          replyToUser: thread.root.properties.replyToUser,
          replyToCommentId: thread.root.properties.replyToCommentId
        },
        replies: thread.replies.map((r) => ({
          id: r.id,
          author: r.properties.createdBy,
          authorDisplayName: undefined,
          content: r.properties.content,
          createdAt: r.createdAt,
          edited: r.properties.edited,
          editedAt: r.properties.editedAt,
          replyToUser: r.properties.replyToUser,
          replyToCommentId: r.properties.replyToCommentId
        })),
        resolved: thread.root.properties.resolved
      })
    }
    return map
  }, [threads])

  // ─── Popover Handlers ─────────────────────────────────────────────────────────

  const isCaretInComment = useCallback((): boolean => {
    const editor = editorRef.current
    if (!editor) return false
    const { from } = editor.state.selection
    const resolved = editor.state.doc.resolve(from)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return resolved.marks().some((m: any) => m.type.name === 'comment')
  }, [])

  const scheduleDismiss = useCallback(() => {
    if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current)
    dismissTimeoutRef.current = setTimeout(() => {
      if (!markHoveredRef.current && !popoverHoveredRef.current && !isCaretInComment()) {
        setPopoverState(INITIAL_POPOVER_STATE)
      }
    }, 200)
  }, [isCaretInComment])

  const handleClickComment = useCallback((commentId: string, anchorEl: HTMLElement) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current)
    setPopoverState((prev) => {
      if (prev.visible && prev.mode === 'full' && prev.threadId === commentId) return prev
      return { visible: true, mode: 'full', threadId: commentId, anchor: anchorEl }
    })
  }, [])

  const handleHoverComment = useCallback((commentId: string, anchorEl: HTMLElement) => {
    markHoveredRef.current = true
    if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current)
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    hoverTimeoutRef.current = setTimeout(() => {
      setPopoverState((prev) => {
        if (prev.visible && prev.threadId === commentId) return prev
        return { visible: true, mode: 'full', threadId: commentId, anchor: anchorEl }
      })
    }, 300)
  }, [])

  const handleLeaveComment = useCallback(() => {
    markHoveredRef.current = false
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    scheduleDismiss()
  }, [scheduleDismiss])

  const handlePopoverMouseEnter = useCallback(() => {
    popoverHoveredRef.current = true
    if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current)
  }, [])

  const handlePopoverMouseLeave = useCallback(() => {
    popoverHoveredRef.current = false
    scheduleDismiss()
  }, [scheduleDismiss])

  const handleDismiss = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current)
    markHoveredRef.current = false
    popoverHoveredRef.current = false
    setPopoverState(INITIAL_POPOVER_STATE)
  }, [])

  const handleUpgradeToFull = useCallback(() => {
    setPopoverState((prev) => ({ ...prev, mode: 'full' }))
  }, [])

  // ─── Comment Actions ──────────────────────────────────────────────────────────

  const handleReply = useCallback(
    async (content: string) => {
      if (!popoverState.threadId) return
      await replyTo(popoverState.threadId, content)
    },
    [popoverState.threadId, replyTo]
  )

  const handleResolve = useCallback(async () => {
    if (!popoverState.threadId) return
    await resolveThread(popoverState.threadId)
    editorRef.current?.commands.setCommentResolved(popoverState.threadId, true)
  }, [popoverState.threadId, resolveThread])

  const handleReopen = useCallback(async () => {
    if (!popoverState.threadId) return
    await reopenThread(popoverState.threadId)
    editorRef.current?.commands.setCommentResolved(popoverState.threadId, false)
  }, [popoverState.threadId, reopenThread])

  const handleDelete = useCallback(
    async (commentId: string) => {
      await deleteComment(commentId)
      const thread = threadDataMap.get(popoverState.threadId || '')
      if (thread && commentId === thread.root.id && thread.replies.length === 0) {
        const editor = editorRef.current
        if (editor) {
          const { tr, doc: editorDoc } = editor.state
          const markType = editor.schema.marks.comment
          if (markType) {
            editorDoc.descendants((node, pos) => {
              node.marks.forEach((mark) => {
                if (mark.type === markType && mark.attrs.commentId === commentId) {
                  tr.removeMark(pos, pos + node.nodeSize, mark)
                }
              })
            })
            editor.view.dispatch(tr)
          }
        }
        handleDismiss()
      }
    },
    [deleteComment, threadDataMap, popoverState.threadId, handleDismiss]
  )

  const handleEdit = useCallback(
    async (commentId: string, newContent: string) => {
      await editComment(commentId, newContent)
    },
    [editComment]
  )

  // Handler for initiating comment creation from toolbar
  const handleCreateComment = useCallback(async (anchorData: string): Promise<string | null> => {
    if (!editorRef.current) return null
    const { from, to } = editorRef.current.state.selection
    if (from === to) return null

    setNewCommentState({
      visible: true,
      anchorData,
      selectionFrom: from,
      selectionTo: to
    })
    return null
  }, [])

  // Handler for submitting a new comment
  const handleSubmitNewComment = useCallback(
    async (content: string) => {
      if (!newCommentState || !content.trim() || !editorRef.current) return

      const commentId = await addComment({
        content: content.trim(),
        anchorType: 'text',
        anchorData: newCommentState.anchorData,
        targetSchema: PageSchema.schema['@id']
      })

      if (commentId) {
        editorRef.current
          .chain()
          .focus()
          .setTextSelection({
            from: newCommentState.selectionFrom,
            to: newCommentState.selectionTo
          })
          .setComment(commentId)
          .run()

        const showPopover = () => {
          const markEl = document.querySelector(
            `[data-comment-id="${commentId}"]`
          ) as HTMLElement | null
          if (markEl) {
            setPopoverState({
              visible: true,
              mode: 'full',
              threadId: commentId,
              anchor: markEl
            })
          }
        }
        setTimeout(showPopover, 50)
        setTimeout(showPopover, 200)
      }

      setNewCommentState(null)
    },
    [newCommentState, addComment]
  )

  const handleCancelNewComment = useCallback(() => {
    setNewCommentState(null)
  }, [])

  // ─── Sidebar Handlers ─────────────────────────────────────────────────────────

  const handleSidebarSelectThread = useCallback((threadId: string) => {
    const markEl = document.querySelector(`[data-comment-id="${threadId}"]`) as HTMLElement | null
    if (markEl) {
      markEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setPopoverState({
        visible: true,
        mode: 'full',
        threadId,
        anchor: markEl
      })
    }
  }, [])

  const handleSidebarReply = useCallback(
    async (threadId: string, content: string) => {
      await replyTo(threadId, content)
    },
    [replyTo]
  )

  const handleSidebarResolve = useCallback(
    async (threadId: string) => {
      await resolveThread(threadId)
      editorRef.current?.commands.setCommentResolved(threadId, true)
    },
    [resolveThread]
  )

  const handleSidebarReopen = useCallback(
    async (threadId: string) => {
      await reopenThread(threadId)
      editorRef.current?.commands.setCommentResolved(threadId, false)
    },
    [reopenThread]
  )

  const handleSidebarDelete = useCallback(
    async (commentId: string) => {
      await deleteComment(commentId)
    },
    [deleteComment]
  )

  const handleSidebarEdit = useCallback(
    async (commentId: string, newContent: string) => {
      await editComment(commentId, newContent)
    },
    [editComment]
  )

  // ─── Orphaned Comment Handlers ─────────────────────────────────────────────────

  const handleDismissOrphaned = useCallback(
    async (commentId: string) => {
      // Delete the orphaned thread entirely
      const thread = threads.find((t) => t.root.id === commentId)
      if (thread) {
        // Delete replies first, then root
        for (const reply of thread.replies) {
          await deleteComment(reply.id)
        }
        await deleteComment(commentId)
      }
      // Remove from orphaned list
      setOrphanedIds((prev) => prev.filter((id) => id !== commentId))
    },
    [threads, deleteComment]
  )

  const handleReattachOrphaned = useCallback((commentId: string) => {
    // For now, just log - reattachment requires selecting new text
    console.log(`[Comments] Reattach not yet implemented for ${commentId}`)
  }, [])

  const handleSelectOrphaned = useCallback(
    (commentId: string) => {
      // Open the right panel for this orphaned comment
      const thread = threadDataMap.get(commentId)
      if (thread) {
        // Since orphaned comments don't have anchor elements, open the
        // comments section in the context panel instead
        revealContextSection('page-comments')
      }
    },
    [threadDataMap]
  )

  // ─── Comment Extensions ───────────────────────────────────────────────────────

  const commentExtensions = useMemo(
    () => [
      CommentMark,
      CommentPlugin.configure({
        onClickComment: handleClickComment,
        onHoverComment: handleHoverComment,
        onLeaveComment: handleLeaveComment
      })
    ],
    [handleClickComment, handleHoverComment, handleLeaveComment]
  )

  // Get the current thread for the popover
  const currentThread = lookupThread(threadDataMap, popoverState.threadId)
  const sidebarThreads = useMemo(() => Array.from(threadDataMap.values()), [threadDataMap])

  // ─── Context Panel Sections (0166) ──────────────────────────────────────────
  // Properties, comments, and backlinks live in the shared Right Panel,
  // contextual to this tab, instead of being embedded in the view.

  const contextSections = useMemo<ContextPanelSection[]>(() => {
    if (!page) return []
    return [
      {
        id: 'page-properties',
        title: 'Properties',
        content: (
          <div className="flex flex-col gap-3 p-3 text-xs text-ink-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink-3">ID</span>
              <span className="truncate font-mono text-[11px]" title={docId}>
                {docId}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink-3">Sync</span>
              <span className="font-mono text-[11px]">
                {syncStatus}
                {peerCount > 0 ? ` · ${peerCount} peers` : ''}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink-3">Saved</span>
              <span className="font-mono text-[11px]">
                {isDirty
                  ? 'saving…'
                  : lastSavedAt
                    ? new Date(lastSavedAt).toLocaleTimeString()
                    : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink-3">Presence</span>
              <PresenceAvatars presence={presence} />
            </div>
            <div className="pt-1">
              <ShareButton docId={docId} docType="page" />
            </div>
          </div>
        )
      },
      {
        id: 'page-comments',
        title: 'Comments',
        badge: unresolvedCount,
        content: (
          <CommentsSidebar
            className="w-full border-l-0 bg-transparent"
            threads={sidebarThreads}
            open
            onClose={() => useWorkbench.getState().setPanelOpen('right', false)}
            onSelectThread={handleSidebarSelectThread}
            selectedThreadId={popoverState.threadId}
            onReply={handleSidebarReply}
            onResolve={handleSidebarResolve}
            onReopen={handleSidebarReopen}
            onDelete={handleSidebarDelete}
            onEdit={handleSidebarEdit}
          />
        )
      },
      {
        id: 'page-backlinks',
        title: 'Backlinks',
        content: (
          <div className="p-3">
            <BacklinksPanel docId={docId} />
          </div>
        )
      }
    ]
  }, [
    page,
    docId,
    syncStatus,
    peerCount,
    isDirty,
    lastSavedAt,
    presence,
    unresolvedCount,
    sidebarThreads,
    popoverState.threadId,
    handleSidebarSelectThread,
    handleSidebarReply,
    handleSidebarResolve,
    handleSidebarReopen,
    handleSidebarDelete,
    handleSidebarEdit
  ])

  useContextPanel(`page:${docId}`, contextSections)

  // Handle wikilink navigation. Reference chips created by node drops
  // encode non-page targets as xnet://<type>/<id> (0166).
  const handleNavigate = (targetDocId: string) => {
    const match = targetDocId.match(/^xnet:\/\/([a-z]+)\/(.+)$/)
    if (match) {
      navigateToNode(navigate, match[1] as TabNodeType, match[2])
      return
    }
    navigate({ to: '/doc/$docId', params: { docId: targetDocId } })
  }

  // Dropping any node onto the editor inserts a reference chip (a
  // wikilink mark) at the drop point — a reference, never a copy.
  const handleEditorDragOver = (event: React.DragEvent) => {
    if (hasNodeTransfer(event)) event.preventDefault()
  }

  const handleEditorDrop = (event: React.DragEvent) => {
    const transfer = getNodeTransfer(event)
    if (!transfer) return
    event.preventDefault()
    event.stopPropagation()
    const editor = editorRef.current
    if (!editor) return
    const title = transfer.title || 'Untitled'
    const href =
      transfer.nodeType === 'page'
        ? transfer.nodeId
        : `xnet://${transfer.nodeType}/${transfer.nodeId}`
    const pos =
      editor.view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ??
      editor.state.selection.to
    editor
      .chain()
      .focus()
      .insertContentAt(pos, {
        type: 'text',
        text: title,
        marks: [{ type: 'wikilink', attrs: { href, title } }]
      })
      .run()
  }

  const placeholder = pageLoadPlaceholder(loading, error, Boolean(page && doc))
  if (placeholder) {
    return placeholder
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden -m-6">
      <PageViewHeader
        title={page!.title || ''}
        onTitleChange={(title) => update({ title })}
        unresolvedCount={unresolvedCount}
        presence={presence}
        docId={docId}
        isDirty={isDirty}
        lastSavedAt={lastSavedAt}
        syncStatus={syncStatus}
        peerCount={peerCount}
      />

      {/* Editor + Sidebar horizontal layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor */}
        <div
          className="flex-1 overflow-auto px-6 py-4"
          onDragOverCapture={handleEditorDragOver}
          onDropCapture={handleEditorDrop}
        >
          <div className="max-w-3xl mx-auto">
            <EditorComponent
              doc={doc!}
              awareness={awareness}
              did={did}
              pageId={docId}
              onNavigate={handleNavigate}
              extensions={commentExtensions}
              onEditorReady={handleEditorReady}
              mentionSuggestions={mentionSuggestions}
              onPageTasksChange={handleTasksChange}
              onCreateComment={handleCreateComment}
            />

            <PageOrphanedComments
              orphanedThreads={orphanedThreads}
              collapsed={orphanedCollapsed}
              onToggleCollapse={() => setOrphanedCollapsed((prev) => !prev)}
              onDismiss={handleDismissOrphaned}
              onReattach={handleReattachOrphaned}
              onSelect={handleSelectOrphaned}
            />

            <PageTasksPanel pageId={docId} />
          </div>
        </div>
      </div>

      <PageCommentPopoverOverlay
        popoverState={popoverState}
        thread={currentThread ?? null}
        onReply={handleReply}
        onResolve={handleResolve}
        onReopen={handleReopen}
        onDelete={handleDelete}
        onEdit={handleEdit}
        onDismiss={handleDismiss}
        onUpgradeToFull={handleUpgradeToFull}
        onMouseEnter={handlePopoverMouseEnter}
        onMouseLeave={handlePopoverMouseLeave}
      />

      <PageNewCommentOverlay
        state={newCommentState}
        onSubmit={handleSubmitNewComment}
        onCancel={handleCancelNewComment}
      />
    </div>
  )
}

// ─── Header ────────────────────────────────────────────────────────────────────

function SaveStatusIndicator({
  isDirty,
  lastSavedAt
}: {
  isDirty: boolean
  lastSavedAt: number | null
}) {
  const title = lastSavedAt
    ? `Last saved: ${new Date(lastSavedAt).toLocaleTimeString()}`
    : 'Not saved yet'
  if (isDirty) {
    return (
      <div className="text-xs text-muted-foreground" title={title}>
        <span className="text-amber-500">Saving...</span>
      </div>
    )
  }
  if (!lastSavedAt) return null
  return (
    <div className="text-xs text-muted-foreground" title={title}>
      <span className="text-success">Saved</span>
    </div>
  )
}

function SyncStatusIndicator({ syncStatus, peerCount }: { syncStatus: string; peerCount: number }) {
  const connected = syncStatus === 'connected'
  return (
    <div
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
      title={connected ? `Connected (${peerCount} peers)` : syncStatus}
    >
      <span
        className={`w-2 h-2 rounded-full transition-colors ${
          connected ? 'bg-success' : 'bg-muted-foreground'
        }`}
      />
      {peerCount > 0 && <span className="text-xs font-medium">{peerCount}</span>}
    </div>
  )
}

function CommentCountBadge({ unresolvedCount }: { unresolvedCount: number }) {
  if (unresolvedCount === 0) return null
  return (
    <button
      className="flex items-center gap-1.5 px-2 py-1 text-xs text-ink-2 hover:text-ink-1 bg-surface-2 rounded-md transition-colors"
      title={`${unresolvedCount} unresolved comment${unresolvedCount !== 1 ? 's' : ''}`}
      onClick={() => revealContextSection('page-comments')}
    >
      <MessageSquare size={14} />
      <span>{unresolvedCount}</span>
    </button>
  )
}

interface PageViewHeaderProps {
  title: string
  onTitleChange: (title: string) => void
  unresolvedCount: number
  presence: Parameters<typeof PresenceAvatars>[0]['presence']
  docId: string
  isDirty: boolean
  lastSavedAt: number | null
  syncStatus: string
  peerCount: number
}

function PageViewHeader({
  title,
  onTitleChange,
  unresolvedCount,
  presence,
  docId,
  isDirty,
  lastSavedAt,
  syncStatus,
  peerCount
}: PageViewHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-secondary">
      <input
        type="text"
        className="text-xl font-semibold border-none bg-transparent text-foreground flex-1 outline-none placeholder:text-muted-foreground"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Untitled"
      />
      <CommentCountBadge unresolvedCount={unresolvedCount} />
      <PresenceAvatars presence={presence} />
      <ShareButton docId={docId} docType="page" />
      <SaveStatusIndicator isDirty={isDirty} lastSavedAt={lastSavedAt} />
      <SyncStatusIndicator syncStatus={syncStatus} peerCount={peerCount} />
    </div>
  )
}

// ─── Comment overlays ──────────────────────────────────────────────────────────

function PageOrphanedComments({
  orphanedThreads,
  collapsed,
  onToggleCollapse,
  onDismiss,
  onReattach,
  onSelect
}: {
  orphanedThreads: OrphanedThread[]
  collapsed: boolean
  onToggleCollapse: () => void
  onDismiss: (commentId: string) => void
  onReattach: (commentId: string) => void
  onSelect: (commentId: string) => void
}) {
  if (orphanedThreads.length === 0) return null
  return (
    <div className="mt-6">
      <OrphanedThreadList
        orphanedThreads={orphanedThreads}
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
        onDismiss={onDismiss}
        onReattach={onReattach}
        onSelect={onSelect}
      />
    </div>
  )
}

interface PageCommentPopoverOverlayProps {
  popoverState: PopoverState
  thread: CommentThreadData | null
  onReply: (content: string) => Promise<void>
  onResolve: () => Promise<void>
  onReopen: () => Promise<void>
  onDelete: (commentId: string) => Promise<void>
  onEdit: (commentId: string, content: string) => Promise<void>
  onDismiss: () => void
  onUpgradeToFull: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}

function PageCommentPopoverOverlay({
  popoverState,
  thread,
  ...handlers
}: PageCommentPopoverOverlayProps) {
  if (!popoverState.visible || !popoverState.anchor || !thread) return null
  return (
    <CommentPopover
      thread={thread}
      anchor={popoverState.anchor}
      mode={popoverState.mode}
      open={popoverState.visible}
      side="right"
      {...handlers}
    />
  )
}

function PageNewCommentOverlay({
  state,
  onSubmit,
  onCancel
}: {
  state: NewCommentState | null
  onSubmit: (content: string) => void
  onCancel: () => void
}) {
  if (!state?.visible) return null
  return <NewCommentInput onSubmit={onSubmit} onCancel={onCancel} />
}

// ─── New Comment Input ─────────────────────────────────────────────────────────

interface NewCommentInputProps {
  onSubmit: (content: string) => void
  onCancel: () => void
}

function NewCommentInput({ onSubmit, onCancel }: NewCommentInputProps) {
  const [content, setContent] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleSubmit = () => {
    if (content.trim()) {
      onSubmit(content)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="w-80 rounded-lg border bg-popover text-popover-foreground shadow-lg p-4">
        <div className="text-sm font-medium mb-2">Add Comment</div>
        <textarea
          ref={textareaRef}
          className="w-full p-2 text-sm rounded border bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring min-h-[80px]"
          placeholder="Write a comment..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="flex justify-end gap-2 mt-3">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded border hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!content.trim()}
            className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Comment
          </button>
        </div>
        <div className="text-xs text-muted-foreground mt-2">
          Press Cmd+Enter to submit, Esc to cancel
        </div>
      </div>
    </div>
  )
}
