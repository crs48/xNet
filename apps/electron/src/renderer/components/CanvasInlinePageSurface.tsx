import type { CanvasNode } from '@xnetjs/canvas'
import type { TaskMentionSuggestion } from '@xnetjs/editor/react'
import { useCanvasThemeTokens } from '@xnetjs/canvas'
import { PageSchema } from '@xnetjs/data'
import {
  RichTextEditor,
  buildTaskMentionSuggestions,
  useFileDownload,
  useFileUpload,
  useImageUpload
} from '@xnetjs/editor/react'
import {
  TaskCollectionEmbed,
  useEditorExtensionsSafe,
  useIdentity,
  useNode,
  usePageTaskSync,
  usePluginRegistryOptional
} from '@xnetjs/react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type CanvasInlinePageSurfaceProps = {
  node: CanvasNode
  docId: string
  variant: 'page' | 'note'
  mode?: 'inline' | 'peek'
  onOpenDocument?: (docId: string) => void
  onSourceNodeMutated?: () => void
}

type EditorExtensions = NonNullable<React.ComponentProps<typeof RichTextEditor>['extensions']>

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
  const editorContributions = useEditorExtensionsSafe()
  const pluginRegistry = usePluginRegistryOptional()
  const pluginsReady = !pluginRegistry || editorContributions.length > 0
  const pluginExtensions = useMemo(
    () => editorContributions.map((contribution) => contribution.extension) as EditorExtensions,
    [editorContributions]
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
      className={`flex h-full flex-col border border-border/60 bg-background/95 shadow-lg shadow-black/5 ${
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
        {loading || !doc || !pluginsReady ? (
          <div className="flex h-full min-h-[140px] items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/30 text-sm text-muted-foreground">
            Loading page surface...
          </div>
        ) : (
          <RichTextEditor
            ydoc={doc}
            field="content"
            placeholder={variant === 'note' ? 'Write a note...' : 'Start writing...'}
            showToolbar={false}
            toolbarMode="desktop"
            className="min-h-full [&_.ProseMirror]:select-text [&_[contenteditable='true']]:select-text"
            awareness={awareness ?? undefined}
            did={did ?? undefined}
            onImageUpload={onImageUpload ?? undefined}
            onFileUpload={onFileUpload ?? undefined}
            onFileDownload={onFileDownload ?? undefined}
            extensions={pluginExtensions}
            mentionSuggestions={mentionSuggestions}
            onPageTasksChange={handleTasksChange}
            taskViewPageId={docId}
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
          />
        )}
      </div>
    </div>
  )
}
