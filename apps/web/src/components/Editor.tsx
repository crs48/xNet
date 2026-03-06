/**
 * Document editor component
 *
 * Uses the shared @xnetjs/editor package for rich text editing.
 * Supports comment extensions for inline commenting.
 */
import type * as Y from 'yjs'
import {
  RichTextEditor,
  useImageUpload,
  useFileUpload,
  useFileDownload,
  type Editor as TipTapEditor,
  type PageTaskSnapshot,
  type TaskMentionSuggestion,
  type TaskViewConfig,
  type TaskViewEmbedType
} from '@xnetjs/editor/react'
import { TaskCollectionEmbed } from '@xnetjs/react'

interface Props {
  doc: Y.Doc
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  awareness?: any
  did?: string
  onNavigate?: (docId: string) => void
  /** Custom extensions (e.g., comment extensions) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extensions?: any[]
  /** Callback when editor is ready */
  onEditorReady?: (editor: TipTapEditor) => void
  /** People that can be inserted as mentions */
  mentionSuggestions?: TaskMentionSuggestion[]
  /** Callback for page-backed task snapshots */
  onPageTasksChange?: (tasks: PageTaskSnapshot[]) => void
  /** Current page ID for embedded task views */
  pageId?: string | null
  /** Callback for creating a comment */
  onCreateComment?: (anchorData: string) => Promise<string | null>
}

export function Editor({
  doc,
  awareness,
  did,
  onNavigate,
  extensions,
  onEditorReady,
  mentionSuggestions,
  onPageTasksChange,
  pageId,
  onCreateComment
}: Props) {
  const onImageUpload = useImageUpload()
  const onFileUpload = useFileUpload()
  const onFileDownload = useFileDownload()

  return (
    <RichTextEditor
      ydoc={doc}
      field="content"
      placeholder="Start writing..."
      awareness={awareness}
      did={did}
      showToolbar={true}
      toolbarMode="desktop"
      onNavigate={onNavigate}
      onImageUpload={onImageUpload ?? undefined}
      onFileUpload={onFileUpload ?? undefined}
      onFileDownload={onFileDownload ?? undefined}
      extensions={extensions}
      onEditorReady={onEditorReady}
      mentionSuggestions={mentionSuggestions}
      onPageTasksChange={onPageTasksChange}
      taskViewPageId={pageId ?? null}
      renderTaskView={({
        viewConfig,
        currentPageId
      }: {
        viewType: TaskViewEmbedType
        viewConfig: TaskViewConfig
        currentPageId: string | null
      }) => (
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
      onCreateComment={onCreateComment}
    />
  )
}
