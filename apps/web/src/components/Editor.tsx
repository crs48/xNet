/**
 * Document editor component
 *
 * Uses the shared @xnetjs/editor package (BlockNote-based XNetEditor,
 * exploration 0312) for rich text editing.
 */
import { useCallback, type JSX } from 'react'
import type * as Y from 'yjs'
import { normalizeTagName } from '@xnetjs/data'
import {
  XNetEditor,
  useImageUpload,
  useFileUpload,
  useFileDownload,
  type HashtagSuggestion,
  type PageTaskSnapshot,
  type TaskMentionSuggestion,
  type TaskViewConfig,
  type TaskViewEmbedType,
  type WikilinkTarget,
  type XNetEditorCommentsHost,
  type XNetEditorInstance
} from '@xnetjs/editor/react'
import { TaskCollectionEmbed, useNodeStore } from '@xnetjs/react'
import { useLinkPreviewResolver } from '../hooks/useLinkPreviewResolver'
import { DatabaseEmbed } from './DatabaseEmbed'
import { useDatabaseViewPicker } from './DatabaseViewPicker'
import { PageEmbedPreview } from './PageEmbedPreview'

type TaskEmbedFilters = Parameters<typeof TaskCollectionEmbed>[0]

/**
 * Map the BlockNote task-view embed config (0312 vocabulary) onto the
 * filters TaskCollectionEmbed expects (the pre-0312 vocabulary). Defaults
 * match the old task-view extension: open tasks, hierarchy on.
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

interface Props {
  doc: Y.Doc
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  awareness?: any
  did?: string
  onNavigate?: (docId: string) => void
  /** Callback when editor is ready */
  onEditorReady?: (editor: XNetEditorInstance) => void
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
  /** Inline comments host (0321): 0276 CRUD + live threads + resolveUsers */
  comments?: XNetEditorCommentsHost
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
  onEditorReady,
  mentionSuggestions,
  hashtagSuggestions,
  onCreateHashtag,
  linkTargets,
  onCreateLinkTarget,
  onTagsChange,
  onPageTasksChange,
  pageId,
  comments,
  className,
  onBackspaceAtStart
}: Props): JSX.Element {
  const onImageUpload = useImageUpload()
  const onFileUpload = useFileUpload()
  const onFileDownload = useFileDownload()
  const resolveLinkPreview = useLinkPreviewResolver()

  // 0346 Phase 1: live embeds. Database views render through the
  // ViewRegistry; page embeds render a summary-tier transclusion; the
  // `/view of…` slash command opens the registry-enumerated picker.
  const { pick: pickDatabaseView, dialog: databaseViewPickerDialog } = useDatabaseViewPicker()
  const { store } = useNodeStore()
  const resolveDatabaseMeta = useCallback(
    async (databaseId: string): Promise<{ title: string; icon?: string } | null> => {
      const node = await store?.get(databaseId)
      if (!node) return null
      return { title: (node.properties.title as string) || 'Untitled Database' }
    },
    [store]
  )

  return (
    <>
      {databaseViewPickerDialog}
      <XNetEditor
        ydoc={doc}
        placeholder="Start writing..."
        className={className}
        onBackspaceAtStart={onBackspaceAtStart}
        awareness={awareness}
        did={did}
        onNavigate={onNavigate}
        onImageUpload={onImageUpload ?? undefined}
        onFileUpload={onFileUpload ?? undefined}
        onFileDownload={onFileDownload ?? undefined}
        resolveLinkPreview={resolveLinkPreview}
        onEditorReady={onEditorReady}
        mentionSuggestions={mentionSuggestions}
        hashtagSuggestions={hashtagSuggestions}
        onCreateHashtag={onCreateHashtag}
        normalizeHashtagName={normalizeTagName}
        linkTargets={linkTargets}
        onCreateLinkTarget={onCreateLinkTarget}
        onTagsChange={onTagsChange}
        onPageTasksChange={onPageTasksChange}
        comments={comments}
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
            {...toTaskEmbedFilters(viewConfig)}
          />
        )}
        renderDatabaseView={({ databaseId, viewType, viewConfig, onChangeViewType }) => (
          <DatabaseEmbed
            databaseId={databaseId}
            viewType={viewType}
            viewConfig={viewConfig}
            onNavigate={onNavigate}
            onChangeViewType={onChangeViewType}
          />
        )}
        renderPageEmbed={({ nodeId, title }) => (
          <PageEmbedPreview nodeId={nodeId} title={title} onNavigate={onNavigate} />
        )}
        onSelectDatabaseView={pickDatabaseView}
        resolveDatabaseMeta={resolveDatabaseMeta}
      />
    </>
  )
}
