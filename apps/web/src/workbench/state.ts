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
import type { ExplorerSort } from './views/explorer-sort'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  createDefaultTree,
  createPresetTree,
  insertSlot as insertSlotInTree,
  isPresetWorkspaceId,
  moveSlot as moveSlotInTree,
  setSlotTier as setSlotTierInTree,
  slotsIn,
  type LayoutTree,
  type PresetId,
  type RegionId,
  type SlotTier,
  type WorkspacePayload
} from './layout-tree'

export type WorkbenchMode = 'default' | 'zen'
export type PanelSide = 'left' | 'right' | 'bottom'

/**
 * Shell composition (exploration 0250). `workbench` is the original VS-Code
 * multi-pane grid (0166); `calm` is the Claude-desktop "mode · list · surface ·
 * contextual canvas" shell. Both reuse the same views, routes and panel state —
 * only the arrangement differs — so the choice is a single persisted flag.
 */
export type ShellLayout = 'workbench' | 'calm'

/**
 * The three primary modes of the calm shell — xNet's analog of Claude
 * desktop's Chat / Cowork / Code. Companion = talk to your agent; Workspace =
 * your pages/databases/canvases/tasks; Network = people, channels, discover.
 */
export type CalmMode = 'companion' | 'workspace' | 'network'

/**
 * Chrome posture of the calm shell (exploration 0273). `pinned` is the 0250
 * composition — ModeSwitch and List always on screen. `quiet` inverts it: the
 * surface owns the whole viewport at rest, and the same chrome is summoned
 * from corner glyphs, edge hot-zones/swipes, chords, or ⌘K. An orthogonal
 * axis (like density vs color), not a third shell.
 */
export type ChromePosture = 'pinned' | 'quiet'

/**
 * The quiet shell's disclosure ladder (0273): 0 = bare surface (glyphs
 * dimmed), 1 = affordances lit by pointer/touch intent, 2 = one overlay open.
 * Level 3 (pinned chrome / workbench) is represented by `chrome`/`layout`,
 * not here. Ephemeral — deliberately excluded from persistence.
 */
export type DiscloseLevel = 0 | 1 | 2

/** Runtime list backing {@link TabNodeType} (migration filters against it). */
export const TAB_NODE_TYPES = [
  'page',
  'database',
  'canvas',
  'dashboard',
  'map',
  'savedview',
  'tasks',
  'meetings',
  'data',
  'experiments',
  'crm',
  'finance',
  'channel',
  'tag',
  'person',
  'lab',
  'space'
] as const

export type TabNodeType = (typeof TAB_NODE_TYPES)[number]

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

/**
 * A queued "Pin to Desk" (exploration 0273). Pins are queued here (persisted)
 * and drained onto the Desk canvas through the normal ingestion path the next
 * time it is on screen — no surface ever has to load the Desk's Y.Doc.
 */
export interface DeskPinEntry {
  nodeId: string
  schemaId: string
  title: string
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
  /**
   * Active shell composition (0250). Defaults to `calm` for new identities;
   * the original `workbench` grid stays one toggle away. Reuses the same
   * `left`/`right` panels (as the calm List/Canvas) and `mode` (as focus).
   */
  layout: ShellLayout
  /**
   * The layout tree (exploration 0280): regions → slots → views, the
   * single data model behind every shell posture. The former shells are
   * presets over this tree; behind `xnet:experiment:layout-tree` the
   * ShellFrame renders it directly, and the legacy axes (`layout`,
   * `chrome`) are kept coherent with it during the transition.
   */
  tree: LayoutTree
  /** Active primary mode of the calm shell (0250). */
  calmMode: CalmMode
  /**
   * Chrome posture of the calm shell (0273). Persisted so an opted-in quiet
   * posture survives reloads; existing users keep their stored `pinned`.
   */
  chrome: ChromePosture
  /** Quiet shell disclosure level (0273). Ephemeral, not persisted. */
  discloseLevel: DiscloseLevel
  /**
   * Arrange mode (0282): the shell renders as an editable schematic of
   * its own layout tree. Ephemeral — never persisted (same rule as
   * `discloseLevel`); reload always lands on the live shell.
   */
  arranging: boolean
  /**
   * Contextual-canvas target (0250). When set, the calm shell's right Canvas
   * hosts the full content view for this node (the Claude "artifact opens on
   * the right" move — e.g. the agent drafts a page). When null the Canvas falls
   * back to the inspector (properties/comments/backlinks) for the active view.
   */
  canvasTarget: { nodeType: TabNodeType; nodeId: string; title?: string } | null
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
  /** Queued Desk pins, drained by the Desk canvas when visible (0273). */
  deskPins: DeskPinEntry[]
  /** Tab opened when the workspace starts at '/' (configurable) */
  startupTab: { nodeType: TabNodeType; nodeId: string } | null
  /**
   * Active Space scope (exploration 0181). When set, the Explorer and new-doc
   * filing are scoped to this Space. `null` = All (the global, pre-Spaces view).
   */
  currentSpaceId: string | null
  /**
   * Multi-select view filter (exploration 0190). Empty = follow
   * `currentSpaceId`. When non-empty the Explorer list shows the union of these
   * Spaces, while the create target stays the single `currentSpaceId` primary.
   */
  spaceFilter: string[]
  /** Sort order for the flat Explorer list (exploration 0190). */
  explorerSort: ExplorerSort
  /**
   * Newest changelog entry id the user has acknowledged (in-app What's New,
   * exploration 0195). `null` = never seen; seeded to the latest on first run
   * so existing users don't get a wall of history.
   */
  lastSeenChangelogId: string | null
  /**
   * Coachmark tip ids the user has dismissed (first-run onboarding,
   * exploration 0206). Empty = nothing seen yet. Versioned ids
   * (`crm:overview@1`) let a copy rewrite re-surface a tip once.
   */
  seenTips: string[]
  /**
   * Sidebar collapsed to the icon rail (exploration 0284). Persisted so the
   * user's chosen width survives reloads (the Notion/Linear pattern).
   */
  sidebarCollapsed: boolean
  /**
   * Focus mode (0284): hide the sidebar, docks and status bar so the surface
   * owns the viewport. One boolean replaces the former zen `mode`, the quiet
   * `chrome` posture, and the `discloseLevel` ladder. Ephemeral — never
   * persisted, so a reload always returns to full chrome.
   */
  focus: boolean

  // ─── Spaces ────────────────────────────────────────────────────
  setCurrentSpace: (spaceId: string | null) => void
  setSpaceFilter: (ids: string[]) => void
  setExplorerSort: (sort: ExplorerSort) => void
  /** Set the primary scope and the multi-filter together, atomically. */
  applyScopeSelection: (scope: string | null, filter: string[]) => void

  // ─── Layout tree (0280) ────────────────────────────────────────
  /** Replace the tree with a built-in preset (and align the legacy axes). */
  applyPreset: (preset: PresetId) => void
  /** Load a workspace payload (a `xnet:workspace` node) into the tree. */
  loadWorkspace: (payload: WorkspacePayload) => void
  /** Move a view to another region (keeps its tier; ordered last). */
  moveSlot: (viewId: string, region: RegionId) => void
  /** Insert a view at an index within a region (reorder or cross-move). */
  insertSlot: (viewId: string, region: RegionId, index: number) => void
  /** Change a placed view's disclosure tier. */
  setSlotTier: (viewId: string, tier: SlotTier) => void

  // ─── Sidebar + focus (0284) ────────────────────────────────────
  /** Collapse/expand the sidebar to the icon rail. */
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  /** Enter/exit focus mode (chrome hidden, surface owns the viewport). */
  toggleFocus: () => void
  setFocus: (focus: boolean) => void

  // ─── Shell layout (0250) ───────────────────────────────────────
  setLayout: (layout: ShellLayout) => void
  /** Flip between the calm shell and the workbench grid. */
  toggleLayout: () => void
  /** Switch the calm shell's active primary mode. */
  setCalmMode: (mode: CalmMode) => void
  /** Set the calm shell's chrome posture (0273). */
  setChrome: (chrome: ChromePosture) => void
  /** Flip between pinned and quiet chrome (0273). */
  toggleChrome: () => void
  /** Update the quiet shell's disclosure level (0273). */
  setDiscloseLevel: (level: DiscloseLevel) => void
  /** Enter/exit arrange mode (0282). */
  setArranging: (arranging: boolean) => void
  /** Open the contextual Canvas hosting a node's full content view. */
  openCanvas: (target: { nodeType: TabNodeType; nodeId: string; title?: string }) => void
  /** Close the Canvas and clear its content target (back to the inspector). */
  closeCanvas: () => void

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

  // ─── Desk pins (0273) ──────────────────────────────────────────
  /** Queue a node for pinning onto the Desk (deduped by nodeId). */
  queueDeskPin: (entry: DeskPinEntry) => void
  /** Remove drained pins from the queue. */
  clearDeskPins: (nodeIds: string[]) => void

  setStartupTab: (tab: { nodeType: TabNodeType; nodeId: string } | null) => void

  // ─── What's New ────────────────────────────────────────────────
  setLastSeenChangelogId: (id: string) => void

  // ─── Onboarding coachmarks (0206) ──────────────────────────────
  /** Record a tip as dismissed so it never auto-shows again. */
  markTipSeen: (id: string) => void
  /** Clear all dismissed tips so onboarding replays (Settings → Replay). */
  resetTips: () => void
}

function freshGroups(): EditorGroup[] {
  return [{ id: 'group-1', tabs: [], activeTabId: null }]
}

/**
 * The store patch for adopting a tree (0280): the legacy `layout`/`chrome`
 * axes stay coherent, docks open where the tree pins a view, and each
 * dock's active view snaps to its first placement so the panel hosts show
 * what the tree says at rest.
 */
function stateForTree(tree: LayoutTree): Partial<WorkbenchState> {
  const patch: Partial<WorkbenchState> = {
    tree,
    layout: tree.surface.tabsEnabled ? 'workbench' : 'calm',
    chrome: tree.chrome,
    discloseLevel: 0
  }
  const docks: Array<[PanelSide, RegionId]> = [
    ['left', 'dock.left'],
    ['right', 'dock.right'],
    ['bottom', 'dock.bottom']
  ]
  for (const [side, region] of docks) {
    const placements = slotsIn(tree, region)
    const pinned = slotsIn(tree, region, 'pinned')
    const active = pinned[0] ?? placements[0]
    patch[side] = {
      open: pinned.length > 0,
      activeViewId: active?.viewId ?? ''
    }
  }
  return patch
}

export const useWorkbench = create<WorkbenchState>()(
  persist(
    (set, get) => ({
      // One coherent shell (0284): every identity lands in the single default
      // tree — a sectioned sidebar that surfaces every tool, the full left
      // dock, tabs on. The former quiet/calm/bench trichotomy is gone; "focus"
      // (hide chrome) is a toggle, not a preset.
      layout: 'workbench',
      tree: createDefaultTree(),
      calmMode: 'companion',
      chrome: 'pinned',
      discloseLevel: 0,
      arranging: false,
      canvasTarget: null,
      mode: 'default',
      zenSnapshot: null,
      sidebarCollapsed: false,
      focus: false,
      left: { open: true, activeViewId: 'explorer' },
      right: { open: false, activeViewId: 'context' },
      bottom: { open: false, activeViewId: 'tray' },
      groups: freshGroups(),
      activeGroupId: 'group-1',
      pinnedNodeIds: [],
      recents: [],
      expandedFolderIds: [],
      shelf: [],
      deskPins: [],
      startupTab: null,
      currentSpaceId: null,
      spaceFilter: [],
      explorerSort: 'recent',
      lastSeenChangelogId: null,
      seenTips: [],

      // Setting a single scope always exits multi-select (keeps the create
      // target unambiguous — exploration 0190).
      setCurrentSpace: (spaceId) => set({ currentSpaceId: spaceId, spaceFilter: [] }),
      setSpaceFilter: (ids) => set({ spaceFilter: ids }),
      setExplorerSort: (sort) => set({ explorerSort: sort }),
      applyScopeSelection: (scope, filter) => set({ currentSpaceId: scope, spaceFilter: filter }),

      applyPreset: (preset) => set(stateForTree(createPresetTree(preset))),

      loadWorkspace: (payload) => set(stateForTree(payload.tree)),

      moveSlot: (viewId, region) =>
        set((state) => {
          const tree = moveSlotInTree(state.tree, viewId, region)
          return tree === state.tree ? {} : { tree }
        }),

      insertSlot: (viewId, region, index) =>
        set((state) => {
          const tree = insertSlotInTree(state.tree, viewId, region, index)
          return tree === state.tree ? {} : { tree }
        }),

      setSlotTier: (viewId, tier) =>
        set((state) => {
          const tree = setSlotTierInTree(state.tree, viewId, tier)
          if (tree === state.tree) return {}
          // Un-pinning the active view of a dock closes that dock at rest.
          const patch: Partial<WorkbenchState> = { tree }
          for (const side of ['left', 'right', 'bottom'] as const) {
            const panel = state[side]
            if (panel.activeViewId === viewId && tier !== 'pinned' && panel.open) {
              patch[side] = { ...panel, open: false }
            }
          }
          return patch
        }),

      // ─── Sidebar + focus (0284) ──────────────────────────────────
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleFocus: () => set((state) => ({ focus: !state.focus })),
      setFocus: (focus) => set({ focus }),

      // Switching layout is choosing a preset (0280): the legacy axes stay
      // coherent with the tree so both renderers agree during the rollout.
      setLayout: (layout) =>
        set((state) =>
          stateForTree(
            createPresetTree(
              layout === 'workbench' ? 'bench' : state.chrome === 'quiet' ? 'quiet' : 'calm'
            )
          )
        ),

      toggleLayout: () =>
        set((state) =>
          stateForTree(
            createPresetTree(
              state.layout === 'calm' ? 'bench' : state.chrome === 'quiet' ? 'quiet' : 'calm'
            )
          )
        ),

      setCalmMode: (calmMode) => set({ calmMode }),

      // Chrome is an orthogonal axis (0273): flipping it never resets a
      // customized tree, it only changes the posture of the same placements.
      setChrome: (chrome) =>
        set((state) => ({ chrome, discloseLevel: 0, tree: { ...state.tree, chrome } })),

      toggleChrome: () =>
        set((state) => {
          const chrome = state.chrome === 'quiet' ? 'pinned' : 'quiet'
          return { chrome, discloseLevel: 0, tree: { ...state.tree, chrome } }
        }),

      setDiscloseLevel: (discloseLevel) =>
        set((state) => (state.discloseLevel === discloseLevel ? {} : { discloseLevel })),

      setArranging: (arranging) => set({ arranging }),

      openCanvas: (target) =>
        set((state) => ({ canvasTarget: target, right: { ...state.right, open: true } })),

      closeCanvas: () =>
        set((state) => ({ canvasTarget: null, right: { ...state.right, open: false } })),

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

      queueDeskPin: (entry) =>
        set((state) => ({
          deskPins: [...state.deskPins.filter((pin) => pin.nodeId !== entry.nodeId), entry]
        })),

      clearDeskPins: (nodeIds) =>
        set((state) => ({
          deskPins: state.deskPins.filter((pin) => !nodeIds.includes(pin.nodeId))
        })),

      setStartupTab: (tab) => set({ startupTab: tab }),

      setLastSeenChangelogId: (id) => set({ lastSeenChangelogId: id }),

      markTipSeen: (id) =>
        set((state) => (state.seenTips.includes(id) ? {} : { seenTips: [...state.seenTips, id] })),

      resetTips: () => set({ seenTips: [] })
    }),
    {
      name: 'xnet:workbench:v1',
      // v2 (0280): the layout tree joins the persisted state. Pre-tree
      // profiles derive their tree from the legacy `layout`/`chrome` axes so
      // panels, pins, shelf and startup node all survive the migration.
      version: 4,
      migrate: (persisted, version) => {
        const state = persisted as Partial<WorkbenchState>
        if (version < 2 && !state.tree) {
          state.tree = createPresetTree(
            state.layout === 'workbench' ? 'bench' : state.chrome === 'quiet' ? 'quiet' : 'calm'
          )
        }
        // v4 (0284): collapse the quiet/calm/bench trichotomy to one shell.
        // Any profile still on a built-in preset tree (or with none) lands in
        // the single default tree; a user's own saved/arranged workspace
        // (a non-preset workspaceId) is preserved. The legacy axes are
        // realigned so the (transitional) renderer fork stays coherent, and a
        // quiet/zen posture maps onto the ephemeral `focus` toggle at rest
        // rather than a persisted chrome mode.
        if (version < 4) {
          if (!state.tree || isPresetWorkspaceId(state.tree.workspaceId)) {
            state.tree = createDefaultTree()
          }
          state.layout = state.tree.surface.tabsEnabled ? 'workbench' : 'calm'
          state.chrome = 'pinned'
          state.sidebarCollapsed = state.sidebarCollapsed ?? false
          state.focus = false
        }
        // v3 (0280): drop tabs whose nodeType this build doesn't know — a
        // profile shared with another branch/version must never crash the
        // shell (the meetings-tab incident during 0280 validation).
        if (version < 3 && Array.isArray(state.groups)) {
          state.groups = state.groups.map((group) => {
            const tabs = group.tabs.filter((tab) =>
              (TAB_NODE_TYPES as readonly string[]).includes(tab.nodeType)
            )
            return {
              ...group,
              tabs,
              activeTabId: tabs.some((tab) => tab.id === group.activeTabId)
                ? group.activeTabId
                : (tabs[0]?.id ?? null)
            }
          })
        }
        return state as WorkbenchState
      },
      // Disclosure level, arrange mode and focus are live interaction state
      // (0273/0282/0284) — persisting them would resurrect a lit/overlaid,
      // mid-edit, or chrome-hidden shell on reload.
      partialize: (state) =>
        Object.fromEntries(
          Object.entries(state).filter(
            ([key]) => key !== 'discloseLevel' && key !== 'arranging' && key !== 'focus'
          )
        ) as WorkbenchState
    }
  )
)

/** The active tab of the active editor group, if any. */
export function selectActiveTab(state: Pick<WorkbenchState, 'groups' | 'activeGroupId'>) {
  const group = state.groups.find((g) => g.id === state.activeGroupId)
  return group?.tabs.find((tab) => tab.id === group.activeTabId) ?? null
}
