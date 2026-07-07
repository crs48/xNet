/**
 * Page View - Rich text editor using @xnetjs/react hooks
 *
 * Features:
 * - Collaborative editing via Yjs
 * - Comment system with inline popover
 *   (state machine shared with web via usePageComments, 0276)
 * - Real-time presence indicators
 */

import type { SyncStatus } from '@xnetjs/react'
import { PageSchema } from '@xnetjs/data'
import {
  EditorSurface,
  buildTaskMentionSuggestions,
  useImageUpload,
  useFileUpload,
  useFileDownload,
  usePageComments
} from '@xnetjs/editor/react'
import {
  TaskCollectionEmbed,
  useNode,
  useIdentity,
  useEditorExtensionsSafe,
  usePluginRegistryOptional,
  usePageTaskSync
} from '@xnetjs/react'
import { CommentPopover, CommentsSidebar, OrphanedThreadList } from '@xnetjs/ui'
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { DocumentHeader } from './DocumentHeader'
import { resolvePageEditorFocusPosition } from './page-editor-focus'
import { PageTasksPanel } from './PageTasksPanel'
import { PresenceAvatars } from './PresenceAvatars'

interface PageViewProps {
  docId: string
  minimalChrome?: boolean
}

type EditorExtensions = NonNullable<React.ComponentProps<typeof EditorSurface>['extensions']>

export function PageView({ docId, minimalChrome = false }: PageViewProps) {
  const { did } = useIdentity()
  const onImageUpload = useImageUpload()
  const onFileUpload = useFileUpload()
  const onFileDownload = useFileDownload()

  // Get editor extensions from plugins (reactive - updates when plugins change)
  // Uses safe version that returns [] if plugin system isn't ready
  const editorContributions = useEditorExtensionsSafe()
  const pluginExtensions = editorContributions.map((c) => c.extension) as EditorExtensions

  // Wait for plugin-contributed editor extensions to be registered before
  // mounting the editor. BundledPluginInstaller installs plugins (like Mermaid)
  // asynchronously. If the editor mounts before Mermaid is registered, Yjs
  // content containing mermaid nodes will crash ProseMirror ("toDOM is not a
  // function"). We gate on editorContributions being populated, which means
  // the plugin's activate() has run and contributions are registered.
  const pluginRegistry = usePluginRegistryOptional()
  const pluginsReady = pluginRegistry ? editorContributions.length > 0 : false

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
  const mentionSuggestions = useMemo(
    () => buildTaskMentionSuggestions(presence, did),
    [did, presence]
  )

  // ─── Comments Integration (shared state machine, 0276) ───────────────────────

  const {
    threads,
    unresolvedCount,
    threadDataMap,
    sidebarThreads,
    currentThread,
    orphanedThreads,
    orphanedCollapsed,
    toggleOrphanedCollapsed,
    popoverState,
    newCommentState,
    editorRef,
    handleEditorReady,
    commentExtensions,
    showThreadPopover,
    handlePopoverMouseEnter,
    handlePopoverMouseLeave,
    handleDismiss,
    handleUpgradeToFull,
    handleReply,
    handleResolve,
    handleReopen,
    handleDelete,
    handleEdit,
    handleCreateComment,
    handleSubmitNewComment,
    handleCancelNewComment,
    handleSidebarSelectThread,
    handleSidebarReply,
    handleSidebarResolve,
    handleSidebarReopen,
    handleSidebarDelete,
    handleSidebarEdit,
    handleDismissOrphaned,
    handleReattachOrphaned
  } = usePageComments({ docId, dismissPopoverOnCaretExit: true })

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const titleInputRef = useRef<HTMLInputElement | null>(null)

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

      if (interactiveTarget || !editorRef.current) {
        return
      }

      event.preventDefault()
      const focusPosition = resolvePageEditorFocusPosition(
        event.clientY,
        editorRef.current.view.dom.getBoundingClientRect()
      )
      editorRef.current.commands.focus(focusPosition)
    },
    [editorRef]
  )

  const handleTitleSubmit = useCallback(() => {
    editorRef.current?.commands.focus('start')
  }, [editorRef])

  const handleBodyBackspaceAtStart = useCallback(() => {
    const titleInput = titleInputRef.current
    if (!titleInput) return false

    titleInput.focus()
    const titleEnd = titleInput.value.length
    titleInput.setSelectionRange(titleEnd, titleEnd)
    return true
  }, [])

  // ─── Sidebar hover highlights (desktop-only affordance) ──────────────────────

  const hoveredThreadRef = useRef<string | null>(null)
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSidebarHoverThread = useCallback((threadId: string) => {
    // Cancel any pending leave — user moved to another thread or re-entered
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }

    // Clear previous thread's highlights if switching threads
    if (hoveredThreadRef.current && hoveredThreadRef.current !== threadId) {
      document.querySelectorAll('.xnet-comment-sidebar-hover').forEach((el) => {
        el.classList.remove('xnet-comment-sidebar-hover')
      })
    }

    hoveredThreadRef.current = threadId

    // Find all mark elements for this thread and add the hover class
    const marks = document.querySelectorAll(`[data-comment-id="${threadId}"]`)
    marks.forEach((el) => el.classList.add('xnet-comment-sidebar-hover'))
    // Scroll the first mark into view
    if (marks.length > 0) {
      marks[0].scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [])

  const handleSidebarLeaveThread = useCallback(() => {
    // Delay removal to avoid flicker from scroll-induced spurious mouseLeave events.
    // If the user re-enters the same thread (or enters another) within the window,
    // handleSidebarHoverThread will cancel this timer.
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
    leaveTimerRef.current = setTimeout(() => {
      hoveredThreadRef.current = null
      document.querySelectorAll('.xnet-comment-sidebar-hover').forEach((el) => {
        el.classList.remove('xnet-comment-sidebar-hover')
      })
    }, 150)
  }, [])

  // Combine plugin extensions with comment extensions
  const allExtensions = useMemo(
    () => [...pluginExtensions, ...commentExtensions],
    [pluginExtensions, commentExtensions]
  )

  // Debug: log when popover should show but thread not found
  useEffect(() => {
    if (popoverState.visible && popoverState.threadId && !currentThread) {
      console.log('[Comments] Popover visible but thread not found yet:', popoverState.threadId)
      console.log(
        '[Comments] Available threads:',
        threads.map((t) => t.root.id)
      )
    }
  }, [popoverState, currentThread, threads])

  const handleSelectOrphaned = useCallback(
    (commentId: string) => {
      // Open the popover for this orphaned comment
      const thread = threadDataMap.get(commentId)
      if (thread) {
        // Since orphaned comments don't have anchor elements, use coordinates
        showThreadPopover(commentId, null) // Will need to position differently
      }
    },
    [threadDataMap, showThreadPopover]
  )

  if (loading || !doc || !pluginsReady) {
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
        <EditorSurface
          surfaceMode="page"
          surfaceDensity={minimalChrome ? 'compact' : 'default'}
          onSurfaceMouseDown={handleEditorSurfaceMouseDown}
          ydoc={doc}
          field="content"
          placeholder="Start typing..."
          showToolbar={true}
          toolbarMode="desktop"
          awareness={awareness ?? undefined}
          did={did ?? undefined}
          onImageUpload={onImageUpload ?? undefined}
          onFileUpload={onFileUpload ?? undefined}
          onFileDownload={onFileDownload ?? undefined}
          extensions={allExtensions}
          onCreateComment={handleCreateComment}
          onEditorReady={handleEditorReady}
          onBackspaceAtStart={handleBodyBackspaceAtStart}
          mentionSuggestions={mentionSuggestions}
          onPageTasksChange={handleTasksChange}
          taskViewPageId={docId}
          className="min-h-[480px]"
          renderTaskView={({ viewConfig, currentPageId }) => (
            <TaskCollectionEmbed
              currentPageId={currentPageId}
              currentDid={did ?? null}
              scope={viewConfig.scope}
              assignee={viewConfig.assignee}
              dueDate={viewConfig.dueDate}
              status={viewConfig.status}
              showHierarchy={viewConfig.showHierarchy}
            />
          )}
        >
          {/* Orphaned Comments Section */}
          {orphanedThreads.length > 0 && (
            <div className="mt-6" data-page-editor-ignore-focus="true">
              <OrphanedThreadList
                orphanedThreads={orphanedThreads}
                collapsed={orphanedCollapsed}
                onToggleCollapse={toggleOrphanedCollapsed}
                onDismiss={handleDismissOrphaned}
                onReattach={handleReattachOrphaned}
                onSelect={handleSelectOrphaned}
              />
            </div>
          )}

          <PageTasksPanel pageId={docId} />
        </EditorSurface>

        {/* Comments Sidebar */}
        <CommentsSidebar
          threads={sidebarThreads}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onSelectThread={handleSidebarSelectThread}
          selectedThreadId={popoverState.threadId}
          onReply={handleSidebarReply}
          onResolve={handleSidebarResolve}
          onReopen={handleSidebarReopen}
          onDelete={handleSidebarDelete}
          onEdit={handleSidebarEdit}
          onHoverThread={handleSidebarHoverThread}
          onLeaveThread={handleSidebarLeaveThread}
        />
      </div>

      {/* Comment Popover */}
      {popoverState.visible &&
        popoverState.anchor &&
        (currentThread ? (
          <CommentPopover
            thread={currentThread}
            anchor={popoverState.anchor}
            mode={popoverState.mode}
            open={popoverState.visible}
            side="right"
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
        ) : (
          <div
            className="fixed z-50 w-64 p-4 rounded-lg border bg-popover text-popover-foreground shadow-lg"
            style={{
              left: popoverState.anchor.getBoundingClientRect().right + 8,
              top: popoverState.anchor.getBoundingClientRect().top
            }}
          >
            <div className="text-sm text-muted-foreground">Loading comment...</div>
          </div>
        ))}

      {/* New Comment Input */}
      {newCommentState?.visible && (
        <NewCommentInput onSubmit={handleSubmitNewComment} onCancel={handleCancelNewComment} />
      )}
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

// ─── New Comment Input ─────────────────────────────────────────────────────────

interface NewCommentInputProps {
  onSubmit: (content: string) => void
  onCancel: () => void
}

function NewCommentInput({ onSubmit, onCancel }: NewCommentInputProps) {
  const [content, setContent] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Focus on mount
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
