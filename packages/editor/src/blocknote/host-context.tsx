/**
 * Host context for the BlockNote-based editor (exploration 0312).
 *
 * Custom block/inline specs render as React components inside the
 * BlockNoteView tree, so host callbacks (navigation, embed renderers,
 * blob resolution) flow to them through this context instead of
 * per-extension `configure()` options like the TipTap editor used.
 */
import * as React from 'react'
import { createContext, useContext } from 'react'

/**
 * Known view types keep their literals for autocomplete; the open tail
 * lets registry/plugin view types (map, timeline, …) travel through the
 * embed without an editor-package release per new view (0346).
 */
export type DatabaseViewType =
  | 'table'
  | 'board'
  | 'list'
  | 'gallery'
  | 'calendar'
  | 'form'
  | (string & {})

export interface TaskViewConfig {
  scope: 'page' | 'workspace' | 'assigned'
  assignee?: string | null
  dueDate?: 'overdue' | 'today' | 'week' | 'all' | null
  status?: 'open' | 'completed' | 'all' | null
  showHierarchy?: boolean
}

export type TaskViewEmbedType = 'list' | 'board'

export interface XNetEditorHost {
  /** Navigate to a node/href (wikilinks, mentions, page embeds). */
  onNavigate?: (href: string) => void
  /** Resolve a stored file/image CID to a downloadable URL. */
  onFileDownload?: (attrs: {
    cid: string
    name: string
    mimeType: string
    size: number
  }) => Promise<string>
  /** Host renderer for inline database views. */
  renderDatabaseView?: (props: {
    databaseId: string
    viewType: DatabaseViewType
    viewConfig: Record<string, unknown>
    /**
     * Persist a view-type switch back onto the embed block ("Open
     * with…" on the frame, 0346). Absent on read-only surfaces.
     */
    onChangeViewType?: (viewType: DatabaseViewType) => void
  }) => React.ReactNode
  /** Host renderer for embedded task collection views. */
  renderTaskView?: (props: {
    viewType: TaskViewEmbedType
    viewConfig: TaskViewConfig
    currentPageId: string | null
  }) => React.ReactNode
  /**
   * Host renderer for page embeds (0346): a live summary-tier
   * transclusion of the target node. Absent, the embed falls back to a
   * navigation card.
   */
  renderPageEmbed?: (props: { nodeId: string; title: string }) => React.ReactNode
  /** Page id given to page-scoped task view embeds. */
  taskViewPageId: string | null
  /** Database picker for the slash command. */
  onSelectDatabase?: () => Promise<string | null>
  /**
   * Combined database + view-type picker for the `/view of…` slash
   * command (0346). The host enumerates its view registry; the choice
   * lands as a databaseEmbed block with that view type.
   */
  onSelectDatabaseView?: () => Promise<{ databaseId: string; viewType: DatabaseViewType } | null>
  /** Database title/icon resolver for embed headers. */
  resolveDatabaseMeta?: (databaseId: string) => Promise<{ title: string; icon?: string } | null>
  /** Whether the surface is read-only. */
  readOnly: boolean
}

const XNetEditorHostContext = createContext<XNetEditorHost>({
  taskViewPageId: null,
  readOnly: false
})

export function XNetEditorHostProvider({
  value,
  children
}: {
  value: XNetEditorHost
  children: React.ReactNode
}): React.JSX.Element {
  return <XNetEditorHostContext.Provider value={value}>{children}</XNetEditorHostContext.Provider>
}

export function useEditorHost(): XNetEditorHost {
  return useContext(XNetEditorHostContext)
}
