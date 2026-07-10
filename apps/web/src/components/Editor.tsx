/**
 * Document editor component
 *
 * Uses the shared @xnetjs/editor package for rich text editing.
 * Supports comment extensions for inline commenting.
 */
import type { JSX } from 'react'
import type * as Y from 'yjs'
import { normalizeTagName } from '@xnetjs/data'
import {
  RichTextEditor,
  useImageUpload,
  useFileUpload,
  useFileDownload,
  type Editor as TipTapEditor,
  type HashtagSuggestion,
  type PageTaskSnapshot,
  type TaskMentionSuggestion,
  type TaskViewConfig,
  type TaskViewEmbedType,
  type WikilinkTarget
} from '@xnetjs/editor/react'
import { TaskCollectionEmbed } from '@xnetjs/react'
import { useLinkPreviewResolver } from '../hooks/useLinkPreviewResolver'

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
  /** Workspace tags offered by the inline '#' picker (0169) */
  hashtagSuggestions?: HashtagSuggestion[]
  /** Create a Tag node for a new hashtag name */
  onCreateHashtag?: (name: string) => Promise<HashtagSuggestion | null>
  /** Linkable workspace nodes offered by the `[[` typeahead (0170) */
  linkTargets?: WikilinkTarget[]
  /** Create a page for an unmatched `[[` query */
  onCreateLinkTarget?: (title: string) => Promise<WikilinkTarget | null>
  /** Structured tags write-through: pill ids whenever the set changes */
  onTagsChange?: (tagIds: string[]) => void
  /** Callback for page-backed task snapshots */
  onPageTasksChange?: (tasks: PageTaskSnapshot[]) => void
  /** Current page ID for embedded task views */
  pageId?: string | null
  /** Callback for creating a comment */
  onCreateComment?: (anchorData: string) => Promise<string | null>
  /** Additional class for the editor container */
  className?: string
  /** Backspace in an empty first block (e.g. return focus to the title) */
  onBackspaceAtStart?: () => boolean | void
}

export function Editor({
  doc,
  awareness,
  did,
  onNavigate,
  extensions,
  onEditorReady,
  mentionSuggestions,
  hashtagSuggestions,
  onCreateHashtag,
  linkTargets,
  onCreateLinkTarget,
  onTagsChange,
  onPageTasksChange,
  pageId,
  onCreateComment,
  className,
  onBackspaceAtStart
}: Props): JSX.Element {
  const onImageUpload = useImageUpload()
  const onFileUpload = useFileUpload()
  const onFileDownload = useFileDownload()
  const resolveLinkPreview = useLinkPreviewResolver()

  return (
    <RichTextEditor
      ydoc={doc}
      field="content"
      placeholder="Start writing..."
      className={className}
      onBackspaceAtStart={onBackspaceAtStart}
      awareness={awareness}
      did={did}
      showToolbar={true}
      // Auto-detect (exploration 0196): the editor-ux-state machine picks
      // the floating bubble menu on pointer/desktop and the keyboard-aware
      // fixed bottom toolbar on touch/narrow widths. Previously hardcoded
      // to "desktop", which disabled the entire mobile toolbar path.
      toolbarMode="auto"
      onNavigate={onNavigate}
      onImageUpload={onImageUpload ?? undefined}
      onFileUpload={onFileUpload ?? undefined}
      onFileDownload={onFileDownload ?? undefined}
      resolveLinkPreview={resolveLinkPreview}
      extensions={extensions}
      onEditorReady={onEditorReady}
      mentionSuggestions={mentionSuggestions}
      hashtagSuggestions={hashtagSuggestions}
      onCreateHashtag={onCreateHashtag}
      normalizeHashtagName={normalizeTagName}
      linkTargets={linkTargets}
      onCreateLinkTarget={onCreateLinkTarget}
      onTagsChange={onTagsChange}
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
