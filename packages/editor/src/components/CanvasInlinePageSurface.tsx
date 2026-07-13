import type { CanvasNode } from '@xnetjs/canvas'
import { useCanvasThemeTokens } from '@xnetjs/canvas'
import { PageSchema } from '@xnetjs/data'
import { TaskCollectionEmbed, useIdentity, useNode, usePageTaskSync } from '@xnetjs/react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PageTaskSnapshot } from '../blocknote/doc-utils'
import { XNetEditor } from '../blocknote/XNetEditor'
import type { TaskViewConfig } from '../blocknote/host-context'
import type { TaskMentionSuggestion } from '../blocknote/specs/mention'
import { useFileDownload } from '../hooks/useFileDownload'
import { useFileUpload } from '../hooks/useFileUpload'
import { useImageUpload } from '../hooks/useImageUpload'
import { buildTaskMentionSuggestions } from '../utils/taskMentionSuggestions'

/** Map the 0312 task-view vocabulary onto TaskCollectionEmbed's filters
 * (same adapter the web/electron hosts use). */
function toTaskEmbedFilters(viewConfig: TaskViewConfig): {
  scope: 'current-page' | 'all'
  assignee: 'me' | 'any'
  dueDate: 'overdue' | 'today' | 'next-7-days' | 'any'
  status: 'open' | 'done' | 'all'
  showHierarchy: boolean
} {
  const dueMap = { overdue: 'overdue', today: 'today', week: 'next-7-days', all: 'any' } as const
  const statusMap = { open: 'open', completed: 'done', all: 'all' } as const
  return {
    scope: viewConfig.scope === 'page' ? 'current-page' : 'all',
    assignee: viewConfig.scope === 'assigned' ? 'me' : 'any',
    dueDate: viewConfig.dueDate ? dueMap[viewConfig.dueDate] : 'any',
    status: viewConfig.status ? statusMap[viewConfig.status] : 'open',
    showHierarchy: viewConfig.showHierarchy ?? true
  }
}

type CanvasInlinePageSurfaceProps = {
  node: CanvasNode
  docId: string
  variant: 'page' | 'note'
  mode?: 'inline' | 'peek'
  onOpenDocument?: (docId: string) => void
  onSourceNodeMutated?: () => void
}

function useStableTitle(
  initialTitle: string,
  onCommit: (title: string) => Promise<void>,
  onMutationCommitted?: () => void
) {
  const [localTitle, setLocalTitle] = useState(initialTitle)
  const isEditingRef = useRef(false)
  const hasPendingMutationRef = useRef(false)

  useEffect(() => {
    if (!isEditingRef.current) {
      setLocalTitle(initialTitle)
    }
  }, [initialTitle])

  const handleChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextTitle = event.target.value
      setLocalTitle(nextTitle)
      hasPendingMutationRef.current = true
      await onCommit(nextTitle)
    },
    [onCommit]
  )

  const handleFocus = useCallback(() => {
    isEditingRef.current = true
  }, [])

  const handleBlur = useCallback(() => {
    isEditingRef.current = false
    if (hasPendingMutationRef.current) {
      hasPendingMutationRef.current = false
      onMutationCommitted?.()
    }
    setLocalTitle(initialTitle)
  }, [initialTitle, onMutationCommitted])

  return {
    localTitle,
    handleChange,
    handleFocus,
    handleBlur
  }
}

export function CanvasInlinePageSurface({
  node,
  docId,
  variant,
  mode = 'inline',
  onOpenDocument,
  onSourceNodeMutated
}: CanvasInlinePageSurfaceProps): React.ReactElement {
  const theme = useCanvasThemeTokens()
  const { did } = useIdentity()
  const onImageUpload = useImageUpload()
  const onFileUpload = useFileUpload()
  const onFileDownload = useFileDownload()
  const { handleTasksChange } = usePageTaskSync({ pageId: docId })
  const handlePageTasksChange = useCallback(
    (tasks: PageTaskSnapshot[]) =>
      handleTasksChange(
        tasks.map((task) => ({
          ...task,
          references: task.references.map((ref) => ({
            url: ref.url,
            title: ref.title,
            provider: null,
            kind: null,
            refId: null,
            subtitle: null,
            icon: null,
            embedUrl: null,
            metadata: '{}'
          }))
        }))
      ),
    [handleTasksChange]
  )
  const {
    data: page,
    doc,
    loading,
    update,
    awareness,
    presence
  } = useNode(PageSchema, docId, {
    createIfMissing: {
      title:
        (node.alias ?? (node.properties.title as string) ?? 'Untitled Page').trim() ||
        'Untitled Page'
    },
    did: did ?? undefined
  })

  const mentionSuggestions = useMemo<TaskMentionSuggestion[]>(
    () => buildTaskMentionSuggestions(presence, did),
    [did, presence]
  )
  const handleOpenDocument = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      onOpenDocument?.(docId)
    },
    [docId, onOpenDocument]
  )
  const title = page?.title ?? node.alias ?? (node.properties.title as string) ?? 'Untitled Page'
  const commitTitle = useCallback(
    async (nextTitle: string) => update({ title: nextTitle }),
    [update]
  )
  const { localTitle, handleChange, handleFocus, handleBlur } = useStableTitle(
    title,
    commitTitle,
    onSourceNodeMutated
  )

  return (
    <div
      className={`flex h-full flex-col border border-border/60 bg-background shadow-lg shadow-black/5 ${
        mode === 'peek' ? 'rounded-[28px] shadow-2xl shadow-black/10' : 'rounded-[22px]'
      }`}
      data-canvas-page-surface="true"
      data-canvas-page-surface-mode={mode}
      data-canvas-page-variant={variant}
      data-canvas-source-id={docId}
      data-canvas-editing-surface="true"
      data-canvas-object-id={node.id}
      data-canvas-theme={theme.mode}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="min-w-0 flex-1">
          <input
            type="text"
            value={localTitle}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={variant === 'note' ? 'Untitled Note' : 'Untitled Page'}
            className="w-full border-none bg-transparent text-base font-semibold text-foreground outline-none placeholder:text-muted-foreground"
            data-canvas-interactive="true"
            data-canvas-page-title="true"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {variant === 'note' ? 'Note' : 'Page'}
          </span>
          <button
            type="button"
            className="rounded-full border border-border/60 bg-background px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
            onClick={handleOpenDocument}
            data-canvas-interactive="true"
            data-canvas-page-open="true"
          >
            Open
          </button>
        </div>
      </div>

      <div
        className="flex-1 overflow-auto px-4 pb-4 pt-3"
        data-canvas-interactive="true"
        data-canvas-page-editor="true"
      >
        {loading || !doc ? (
          <div className="flex h-full min-h-[140px] items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/30 text-sm text-muted-foreground">
            Loading page surface...
          </div>
        ) : (
          <XNetEditor
            ydoc={doc}
            placeholder={variant === 'note' ? 'Write a note...' : 'Start writing...'}
            className="min-h-full [&_.ProseMirror]:select-text [&_[contenteditable='true']]:select-text"
            awareness={awareness ?? undefined}
            did={did ?? undefined}
            onImageUpload={onImageUpload ?? undefined}
            onFileUpload={onFileUpload ?? undefined}
            onFileDownload={onFileDownload ?? undefined}
            mentionSuggestions={mentionSuggestions}
            onPageTasksChange={handlePageTasksChange}
            taskViewPageId={docId}
            renderTaskView={({ viewConfig, currentPageId }) => (
              <TaskCollectionEmbed
                currentPageId={currentPageId}
                currentDid={did ?? null}
                {...toTaskEmbedFilters(viewConfig)}
              />
            )}
          />
        )}
      </div>
    </div>
  )
}
