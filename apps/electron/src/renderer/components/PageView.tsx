/**
 * Page View - Rich text editor using @xnetjs/react hooks
 *
 * Features:
 * - Collaborative editing via Yjs (BlockNote-based XNetEditor, 0312)
 * - Comment threads sidebar (reads comment nodes; inline text anchors
 *   are retired with the TipTap editor — see exploration 0312)
 * - Real-time presence indicators
 */

import type { SyncStatus } from '@xnetjs/react'
import type { CommentThreadData } from '@xnetjs/ui'
import { PageSchema } from '@xnetjs/data'
import {
  XNetEditor,
  buildTaskMentionSuggestions,
  useImageUpload,
  useFileUpload,
  useFileDownload,
  type PageTaskSnapshot,
  type TaskViewConfig,
  type XNetEditorInstance
} from '@xnetjs/editor/react'
import {
  TaskCollectionEmbed,
  useComments,
  useNode,
  useIdentity,
  usePageTaskSync,
  type PageTaskInput
} from '@xnetjs/react'
import { CommentsSidebar } from '@xnetjs/ui'
import React, { useState, useCallback, useMemo, useRef } from 'react'
import { DocumentHeader } from './DocumentHeader'
import { resolvePageEditorFocusPosition } from './page-editor-focus'
import { PageTasksPanel } from './PageTasksPanel'
import { PresenceAvatars } from './PresenceAvatars'

interface PageViewProps {
  docId: string
  minimalChrome?: boolean
}

type TaskEmbedFilters = Parameters<typeof TaskCollectionEmbed>[0]

/**
 * Map the BlockNote task-view embed config (0312 vocabulary) onto the
 * filters TaskCollectionEmbed expects (the pre-0312 vocabulary). Defaults
 * match the old task-view extension: open tasks, hierarchy on. (Same
 * adapter as the web Editor.)
 */
function toTaskEmbedFilters(
  viewConfig: TaskViewConfig
): Pick<TaskEmbedFilters, 'scope' | 'assignee' | 'dueDate' | 'status' | 'showHierarchy'> {
  const dueMap = {
    overdue: 'overdue',
    today: 'today',
    week: 'next-7-days',
    all: 'any'
  } as const
  const statusMap = { open: 'open', completed: 'done', all: 'all' } as const
  return {
    scope: viewConfig.scope === 'page' ? 'current-page' : 'all',
    assignee: viewConfig.scope === 'assigned' ? 'me' : 'any',
    dueDate: viewConfig.dueDate ? dueMap[viewConfig.dueDate] : 'any',
    status: viewConfig.status ? statusMap[viewConfig.status] : 'open',
    showHierarchy: viewConfig.showHierarchy ?? true
  }
}

export function PageView({ docId, minimalChrome = false }: PageViewProps) {
  const { did } = useIdentity()
  const onImageUpload = useImageUpload()
  const onFileUpload = useFileUpload()
  const onFileDownload = useFileDownload()

  // Page data and Y.Doc
  const {
    data: page,
    doc,
    loading,
    update,
    syncStatus,
    peerCount,
    presence,
    awareness
  } = useNode(PageSchema, docId, {
    createIfMissing: { title: 'Untitled Page' },
    did: did ?? undefined
  })
  const { handleTasksChange } = usePageTaskSync({ pageId: docId })
  // Adapt the editor's checklist snapshot (0312 BlockNote shape — references
  // carry url/title only) to the task projection input.
  const handlePageTasksChange = useCallback(
    (tasks: PageTaskSnapshot[]) => {
      handleTasksChange(
        tasks.map<PageTaskInput>((task) => ({
          ...task,
          references: task.references.map((reference) => ({
            url: reference.url,
            title: reference.title,
            provider: null,
            kind: null,
            refId: null,
            subtitle: null,
            icon: null,
            embedUrl: null,
            metadata: '{}'
          }))
        }))
      )
    },
    [handleTasksChange]
  )
  const mentionSuggestions = useMemo(
    () => buildTaskMentionSuggestions(presence, did),
    [did, presence]
  )

  // ─── Comments (0312: node-backed thread panel only) ──────────────────────────
  //
  // Inline comment anchors (text marks in the document) were retired with the
  // TipTap editor. Threads still live as comment nodes and stay readable and
  // actionable from the sidebar; creating new inline comments returns with the
  // BlockNote ThreadStore spike (0312 Phase 4).

  const {
    threads,
    replyTo,
    resolveThread,
    reopenThread,
    deleteComment,
    editComment,
    unresolvedCount
  } = useComments({ nodeId: docId, anchorType: 'text' })

  const sidebarThreads = useMemo<CommentThreadData[]>(
    () =>
      threads.map((thread) => ({
        root: {
          id: thread.root.id,
          author: thread.root.properties.createdBy,
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
          content: r.properties.content,
          createdAt: r.createdAt,
          edited: r.properties.edited,
          editedAt: r.properties.editedAt,
          replyToUser: r.properties.replyToUser,
          replyToCommentId: r.properties.replyToCommentId
        })),
        resolved: thread.root.properties.resolved
      })),
    [threads]
  )

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const editorRef = useRef<XNetEditorInstance | null>(null)

  const handleEditorReady = useCallback((editor: XNetEditorInstance) => {
    editorRef.current = editor
  }, [])

  const focusEditor = useCallback((position: 'start' | 'end') => {
    const editor = editorRef.current
    if (!editor) return
    const blocks = editor.document
    const target = position === 'start' ? blocks[0] : blocks[blocks.length - 1]
    if (!target) return
    editor.setTextCursorPosition(target, position)
    editor.focus()
  }, [])

  const handleEditorSurfaceMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const { target } = event
      if (!(target instanceof HTMLElement)) return

      const interactiveTarget = target.closest(
        [
          '[contenteditable="true"]',
          'a',
          'button',
          'input',
          'select',
          'textarea',
          '[role="button"]',
          '[data-page-editor-ignore-focus="true"]'
        ].join(',')
      )

      const editorDom = editorRef.current?.domElement
      if (interactiveTarget || !editorDom) {
        return
      }

      event.preventDefault()
      const focusPosition = resolvePageEditorFocusPosition(
        event.clientY,
        editorDom.getBoundingClientRect()
      )
      focusEditor(focusPosition)
    },
    [focusEditor]
  )

  const handleTitleSubmit = useCallback(() => {
    focusEditor('start')
  }, [focusEditor])

  const handleBodyBackspaceAtStart = useCallback(() => {
    const titleInput = titleInputRef.current
    if (!titleInput) return false

    titleInput.focus()
    const titleEnd = titleInput.value.length
    titleInput.setSelectionRange(titleEnd, titleEnd)
    return true
  }, [])

  const handleSidebarSelectThread = useCallback((threadId: string) => {
    setSelectedThreadId((prev) => (prev === threadId ? null : threadId))
  }, [])

  const handleSidebarReply = useCallback(
    (threadId: string, content: string) => {
      void replyTo(threadId, content)
    },
    [replyTo]
  )

  const handleSidebarResolve = useCallback(
    (threadId: string) => {
      void resolveThread(threadId)
    },
    [resolveThread]
  )

  const handleSidebarReopen = useCallback(
    (threadId: string) => {
      void reopenThread(threadId)
    },
    [reopenThread]
  )

  const handleSidebarDelete = useCallback(
    (commentId: string) => {
      void deleteComment(commentId)
    },
    [deleteComment]
  )

  const handleSidebarEdit = useCallback(
    (commentId: string, newContent: string) => {
      void editComment(commentId, newContent)
    },
    [editComment]
  )

  if (loading || !doc) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden"
      data-page-view="true"
      data-page-view-chrome={minimalChrome ? 'minimal' : 'default'}
    >
      <DocumentHeader
        docId={docId}
        docType="page"
        title={page?.title || ''}
        onTitleChange={(title) => update({ title })}
        placeholder="Untitled Page"
        compact={minimalChrome}
        showShareButton={!minimalChrome}
        onTitleSubmit={handleTitleSubmit}
        titleInputRef={titleInputRef}
      >
        {!minimalChrome && <SyncIndicator status={syncStatus} peerCount={peerCount} />}
        {!minimalChrome && unresolvedCount > 0 && (
          <button
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title={`${unresolvedCount} unresolved comment${unresolvedCount !== 1 ? 's' : ''}`}
            onClick={() => setSidebarOpen((prev) => !prev)}
          >
            <span className="text-amber-500">{unresolvedCount}</span>
            <span>comment{unresolvedCount !== 1 ? 's' : ''}</span>
          </button>
        )}
        {!minimalChrome && <PresenceAvatars presence={presence} localDid={did} />}
      </DocumentHeader>

      {/* Editor + Sidebar horizontal layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor */}
        <div
          className="flex-1 min-w-0 overflow-y-auto"
          data-page-editor-surface={minimalChrome ? 'compact' : 'default'}
          onMouseDown={handleEditorSurfaceMouseDown}
        >
          <XNetEditor
            ydoc={doc}
            placeholder="Start typing..."
            awareness={awareness ?? undefined}
            did={did ?? undefined}
            onImageUpload={onImageUpload ?? undefined}
            onFileUpload={onFileUpload ?? undefined}
            onFileDownload={onFileDownload ?? undefined}
            onEditorReady={handleEditorReady}
            onBackspaceAtStart={handleBodyBackspaceAtStart}
            mentionSuggestions={mentionSuggestions}
            onPageTasksChange={handlePageTasksChange}
            taskViewPageId={docId}
            className="min-h-[480px]"
            renderTaskView={({ viewConfig, currentPageId }) => (
              <TaskCollectionEmbed
                currentPageId={currentPageId}
                currentDid={did ?? null}
                {...toTaskEmbedFilters(viewConfig)}
              />
            )}
          />

          <PageTasksPanel pageId={docId} />
        </div>

        {/* Comments Sidebar */}
        <CommentsSidebar
          threads={sidebarThreads}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onSelectThread={handleSidebarSelectThread}
          selectedThreadId={selectedThreadId}
          onReply={handleSidebarReply}
          onResolve={handleSidebarResolve}
          onReopen={handleSidebarReopen}
          onDelete={handleSidebarDelete}
          onEdit={handleSidebarEdit}
        />
      </div>
    </div>
  )
}

function SyncIndicator({ status, peerCount }: { status: SyncStatus; peerCount: number }) {
  const colors: Record<SyncStatus, string> = {
    offline: 'bg-zinc-500',
    connecting: 'bg-amber-400 animate-pulse',
    connected: 'bg-emerald-400',
    error: 'bg-red-500'
  }

  const labels: Record<SyncStatus, string> = {
    offline: 'Offline',
    connecting: 'Connecting...',
    connected: peerCount > 0 ? `${peerCount} peer${peerCount !== 1 ? 's' : ''}` : 'Connected',
    error: 'Sync error'
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground" title={labels[status]}>
      <div className={`w-2 h-2 rounded-full ${colors[status]}`} />
      <span>{labels[status]}</span>
    </div>
  )
}
