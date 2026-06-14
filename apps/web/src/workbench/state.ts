/**
 * Workbench shell state (exploration 0166).
 *
 * One persisted zustand store holds the layout state machine
 * (default / working / zen), the three collapsible panels, the editor
 * groups with their tabs, explorer pins, and recents. Panel *sizes* are
 * persisted separately by react-resizable-panels' useDefaultLayout.
 *
 * The router stays authoritative for navigation: components navigate,
 * and the route effect in EditorArea reconciles the tab store against
 * the URL. Store actions never call the router.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type WorkbenchMode = 'default' | 'zen'
export type PanelSide = 'left' | 'right' | 'bottom'

export type TabNodeType =
  | 'page'
  | 'database'
  | 'canvas'
  | 'dashboard'
  | 'savedview'
  | 'tasks'
  | 'data'
  | 'channel'
  | 'tag'
  | 'person'
  | 'lab'
  | 'space'

export interface WorkbenchTab {
  /** `${nodeType}:${nodeId}` — stable across sessions */
  id: string
  nodeId: string
  nodeType: TabNodeType
  /** Last known title (refreshed when the view loads) */
  title: string
  pinned: boolean
  /** Single-click preview tab; editing or double-click promotes */
  preview: boolean
}

export interface EditorGroup {
  id: string
  tabs: WorkbenchTab[]
  activeTabId: string | null
}

export interface PanelState {
  open: boolean
  activeViewId: string
}

interface ZenSnapshot {
  left: boolean
  right: boolean
  bottom: boolean
}

export interface RecentEntry {
  nodeId: string
  nodeType: TabNodeType
  title: string
  at: number
}

export interface ShelfEntry {
  nodeId: string
  nodeType: string
  title?: string
  schemaId?: string
}

const MAX_RECENTS = 30

export function tabIdFor(nodeType: TabNodeType, nodeId: string): string {
  return `${nodeType}:${nodeId}`
}

function createTab(input: {
  nodeId: string
  nodeType: TabNodeType
  title?: string
  preview?: boolean
}): WorkbenchTab {
  return {
    id: tabIdFor(input.nodeType, input.nodeId),
    nodeId: input.nodeId,
    nodeType: input.nodeType,
    title: input.title ?? '',
    pinned: false,
    preview: input.preview ?? false
  }
}

interface WorkbenchState {
  mode: WorkbenchMode
  zenSnapshot: ZenSnapshot | null
  left: PanelState
  right: PanelState
  bottom: PanelState
  groups: EditorGroup[]
  activeGroupId: string
  pinnedNodeIds: string[]
  recents: RecentEntry[]
  /** Expanded folders in the Explorer tree (exploration 0169) */
  expandedFolderIds: string[]
  /** Muse-style shelf: nodes held in transit between contexts */
  shelf: ShelfEntry[]
  /** Tab opened when the workspace starts at '/' (configurable) */
  startupTab: { nodeType: TabNodeType; nodeId: string } | null
  /**
   * Active Space scope (exploration 0181). When set, the Explorer and new-doc
   * filing are scoped to this Space. `null` = All (the global, pre-Spaces view).
   */
  currentSpaceId: string | null

  // ─── Spaces ────────────────────────────────────────────────────
  setCurrentSpace: (spaceId: string | null) => void

  // ─── Panels ────────────────────────────────────────────────────
  setPanelOpen: (side: PanelSide, open: boolean) => void
  togglePanel: (side: PanelSide) => void
  /** Open the panel showing the given view; collapse if already showing it */
  showPanelView: (side: PanelSide, viewId: string) => void

  // ─── Zen ───────────────────────────────────────────────────────
  toggleZen: () => void

  // ─── Tabs ──────────────────────────────────────────────────────
  /**
   * Open (or activate) a tab in a group. Preview tabs replace the
   * group's existing preview tab; re-opening an existing tab without
   * `preview` promotes it.
   */
  openTab: (input: {
    nodeId: string
    nodeType: TabNodeType
    title?: string
    preview?: boolean
    groupId?: string
    background?: boolean
  }) => void
  activateTab: (tabId: string, groupId?: string) => void
  /** Returns the tab to navigate to next (active tab of active group) */
  closeTab: (tabId: string, groupId?: string) => void
  promoteTab: (tabId: string) => void
  setTabPinned: (tabId: string, pinned: boolean) => void
  setTabTitle: (nodeId: string, title: string) => void
  moveTab: (tabId: string, groupId: string, toIndex: number) => void
  /** Move/open a tab into the second group, creating it if needed */
  splitWith: (input: { nodeId: string; nodeType: TabNodeType; title?: string }) => void
  closeGroup: (groupId: string) => void
  focusGroup: (groupId: string) => void
  /** Cycle active tab within the active group (Ctrl+Tab) */
  cycleTab: (delta: 1 | -1) => void

  // ─── Explorer pins & recents ───────────────────────────────────
  togglePinnedNode: (nodeId: string) => void
  touchRecent: (entry: Omit<RecentEntry, 'at'>) => void
  toggleFolderExpanded: (folderId: string) => void

  // ─── Shelf ─────────────────────────────────────────────────────
  shelfAdd: (entry: ShelfEntry) => void
  shelfRemove: (nodeId: string) => void
  shelfClear: () => void

  setStartupTab: (tab: { nodeType: TabNodeType; nodeId: string } | null) => void
}

function freshGroups(): EditorGroup[] {
  return [{ id: 'group-1', tabs: [], activeTabId: null }]
}

export const useWorkbench = create<WorkbenchState>()(
  persist(
    (set, get) => ({
      mode: 'default',
      zenSnapshot: null,
      left: { open: true, activeViewId: 'explorer' },
      right: { open: false, activeViewId: 'context' },
      bottom: { open: false, activeViewId: 'tray' },
      groups: freshGroups(),
      activeGroupId: 'group-1',
      pinnedNodeIds: [],
      recents: [],
      expandedFolderIds: [],
      shelf: [],
      startupTab: null,
      currentSpaceId: null,

      setCurrentSpace: (spaceId) => set({ currentSpaceId: spaceId }),

      setPanelOpen: (side, open) => set((state) => ({ [side]: { ...state[side], open } })),

      togglePanel: (side) =>
        set((state) => ({ [side]: { ...state[side], open: !state[side].open } })),

      showPanelView: (side, viewId) =>
        set((state) => {
          const panel = state[side]
          if (panel.open && panel.activeViewId === viewId) {
            return { [side]: { ...panel, open: false } }
          }
          return { [side]: { open: true, activeViewId: viewId } }
        }),

      toggleZen: () =>
        set((state) => {
          if (state.mode === 'zen') {
            const snapshot = state.zenSnapshot
            return {
              mode: 'default' as const,
              zenSnapshot: null,
              ...(snapshot
                ? {
                    left: { ...state.left, open: snapshot.left },
                    right: { ...state.right, open: snapshot.right },
                    bottom: { ...state.bottom, open: snapshot.bottom }
                  }
                : {})
            }
          }
          return {
            mode: 'zen' as const,
            zenSnapshot: {
              left: state.left.open,
              right: state.right.open,
              bottom: state.bottom.open
            },
            left: { ...state.left, open: false },
            right: { ...state.right, open: false },
            bottom: { ...state.bottom, open: false }
          }
        }),

      openTab: ({ nodeId, nodeType, title, preview = false, groupId, background = false }) =>
        set((state) => {
          const targetGroupId = groupId ?? state.activeGroupId
          const tabId = tabIdFor(nodeType, nodeId)

          const groups = state.groups.map((group) => {
            if (group.id !== targetGroupId) return group

            const existing = group.tabs.find((tab) => tab.id === tabId)
            if (existing) {
              const tabs = preview
                ? group.tabs
                : group.tabs.map((tab) => (tab.id === tabId ? { ...tab, preview: false } : tab))
              return { ...group, tabs, activeTabId: background ? group.activeTabId : tabId }
            }

            const next = createTab({ nodeId, nodeType, title, preview })
            let tabs: WorkbenchTab[]
            if (preview) {
              const previewIndex = group.tabs.findIndex((tab) => tab.preview && !tab.pinned)
              if (previewIndex >= 0) {
                tabs = group.tabs.map((tab, index) => (index === previewIndex ? next : tab))
              } else {
                tabs = [...group.tabs, next]
              }
            } else {
              tabs = [...group.tabs, next]
            }
            return { ...group, tabs, activeTabId: background ? group.activeTabId : next.id }
          })

          return {
            groups,
            activeGroupId: background ? state.activeGroupId : targetGroupId
          }
        }),

      activateTab: (tabId, groupId) =>
        set((state) => {
          const targetGroupId =
            groupId ?? state.groups.find((g) => g.tabs.some((t) => t.id === tabId))?.id
          if (!targetGroupId) return {}
          return {
            activeGroupId: targetGroupId,
            groups: state.groups.map((group) =>
              group.id === targetGroupId && group.tabs.some((tab) => tab.id === tabId)
                ? { ...group, activeTabId: tabId }
                : group
            )
          }
        }),

      closeTab: (tabId, groupId) =>
        set((state) => {
          const targetGroupId =
            groupId ?? state.groups.find((g) => g.tabs.some((t) => t.id === tabId))?.id
          if (!targetGroupId) return {}

          let groups = state.groups.map((group) => {
            if (group.id !== targetGroupId) return group
            const index = group.tabs.findIndex((tab) => tab.id === tabId)
            if (index < 0) return group
            const tabs = group.tabs.filter((tab) => tab.id !== tabId)
            let activeTabId = group.activeTabId
            if (group.activeTabId === tabId) {
              const neighbor = tabs[Math.min(index, tabs.length - 1)]
              activeTabId = neighbor ? neighbor.id : null
            }
            return { ...group, tabs, activeTabId }
          })

          // Drop an emptied second group; always keep at least one group.
          let activeGroupId = state.activeGroupId
          if (groups.length > 1) {
            const empty = groups.filter((group) => group.tabs.length === 0)
            if (empty.length > 0) {
              groups = groups.filter((group) => group.tabs.length > 0)
              if (groups.length === 0) groups = freshGroups()
              if (!groups.some((group) => group.id === activeGroupId)) {
                activeGroupId = groups[0].id
              }
            }
          }

          return { groups, activeGroupId }
        }),

      promoteTab: (tabId) =>
        set((state) => ({
          groups: state.groups.map((group) => ({
            ...group,
            tabs: group.tabs.map((tab) => (tab.id === tabId ? { ...tab, preview: false } : tab))
          }))
        })),

      setTabPinned: (tabId, pinned) =>
        set((state) => ({
          groups: state.groups.map((group) => ({
            ...group,
            tabs: group.tabs.map((tab) =>
              tab.id === tabId ? { ...tab, pinned, preview: false } : tab
            )
          }))
        })),

      setTabTitle: (nodeId, title) =>
        set((state) => {
          if (!title) return {}
          let changed = false
          const groups = state.groups.map((group) => {
            const tabs = group.tabs.map((tab) => {
              if (tab.nodeId !== nodeId || tab.title === title) return tab
              changed = true
              return { ...tab, title }
            })
            return changed ? { ...group, tabs } : group
          })
          const recents = state.recents.map((recent) =>
            recent.nodeId === nodeId && recent.title !== title ? { ...recent, title } : recent
          )
          return changed ? { groups, recents } : { recents }
        }),

      moveTab: (tabId, groupId, toIndex) =>
        set((state) => {
          const fromGroup = state.groups.find((g) => g.tabs.some((t) => t.id === tabId))
          if (!fromGroup) return {}
          const tab = fromGroup.tabs.find((t) => t.id === tabId)
          if (!tab) return {}

          let groups = state.groups.map((group) =>
            group.id === fromGroup.id
              ? {
                  ...group,
                  tabs: group.tabs.filter((t) => t.id !== tabId),
                  activeTabId:
                    group.activeTabId === tabId && group.id !== groupId
                      ? (group.tabs.filter((t) => t.id !== tabId)[0]?.id ?? null)
                      : group.activeTabId
                }
              : group
          )

          groups = groups.map((group) => {
            if (group.id !== groupId) return group
            const tabs = [...group.tabs]
            const clamped = Math.max(0, Math.min(toIndex, tabs.length))
            tabs.splice(clamped, 0, tab)
            return { ...group, tabs, activeTabId: tabId }
          })

          // Drop an emptied source group after a cross-group move.
          if (groups.length > 1) {
            groups = groups.filter((group) => group.tabs.length > 0 || group.id === groupId)
          }

          return {
            groups,
            activeGroupId: groups.some((g) => g.id === groupId) ? groupId : state.activeGroupId
          }
        }),

      splitWith: ({ nodeId, nodeType, title }) => {
        const state = get()
        let second = state.groups[1]
        if (!second) {
          second = { id: 'group-2', tabs: [], activeTabId: null }
          set({ groups: [...state.groups, second] })
        }
        get().openTab({ nodeId, nodeType, title, groupId: second.id })
      },

      closeGroup: (groupId) =>
        set((state) => {
          if (state.groups.length <= 1) return {}
          const groups = state.groups.filter((group) => group.id !== groupId)
          return {
            groups,
            activeGroupId: state.activeGroupId === groupId ? groups[0].id : state.activeGroupId
          }
        }),

      focusGroup: (groupId) =>
        set((state) =>
          state.groups.some((group) => group.id === groupId) ? { activeGroupId: groupId } : {}
        ),

      cycleTab: (delta) =>
        set((state) => {
          const group = state.groups.find((g) => g.id === state.activeGroupId)
          if (!group || group.tabs.length < 2 || !group.activeTabId) return {}
          const index = group.tabs.findIndex((tab) => tab.id === group.activeTabId)
          const next = group.tabs[(index + delta + group.tabs.length) % group.tabs.length]
          return {
            groups: state.groups.map((g) =>
              g.id === group.id ? { ...g, activeTabId: next.id } : g
            )
          }
        }),

      togglePinnedNode: (nodeId) =>
        set((state) => ({
          pinnedNodeIds: state.pinnedNodeIds.includes(nodeId)
            ? state.pinnedNodeIds.filter((id) => id !== nodeId)
            : [...state.pinnedNodeIds, nodeId]
        })),

      touchRecent: (entry) =>
        set((state) => {
          const rest = state.recents.filter((recent) => recent.nodeId !== entry.nodeId)
          return { recents: [{ ...entry, at: Date.now() }, ...rest].slice(0, MAX_RECENTS) }
        }),

      toggleFolderExpanded: (folderId) =>
        set((state) => ({
          expandedFolderIds: state.expandedFolderIds.includes(folderId)
            ? state.expandedFolderIds.filter((id) => id !== folderId)
            : [...state.expandedFolderIds, folderId]
        })),

      shelfAdd: (entry) =>
        set((state) => ({
          shelf: [entry, ...state.shelf.filter((held) => held.nodeId !== entry.nodeId)]
        })),

      shelfRemove: (nodeId) =>
        set((state) => ({ shelf: state.shelf.filter((held) => held.nodeId !== nodeId) })),

      shelfClear: () => set({ shelf: [] }),

      setStartupTab: (tab) => set({ startupTab: tab })
    }),
    {
      name: 'xnet:workbench:v1'
    }
  )
)

/** The active tab of the active editor group, if any. */
export function selectActiveTab(state: Pick<WorkbenchState, 'groups' | 'activeGroupId'>) {
  const group = state.groups.find((g) => g.id === state.activeGroupId)
  return group?.tabs.find((tab) => tab.id === group.activeTabId) ?? null
}
