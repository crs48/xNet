/**
 * Workbench store tests (0166): the layout state machine, tab
 * semantics, pins/recents, and the shelf.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createPresetTree,
  DEFAULT_WORKSPACE_ID,
  moveSlot,
  presetWorkspaceId,
  regionOf
} from './layout-tree'
import { selectActiveTab, tabIdFor, useWorkbench } from './state'

function reset() {
  useWorkbench.setState({
    mode: 'default',
    zenSnapshot: null,
    left: { open: true, activeViewId: 'explorer' },
    right: { open: false, activeViewId: 'context' },
    bottom: { open: false, activeViewId: 'capture' },
    groups: [{ id: 'group-1', tabs: [], activeTabId: null }],
    activeGroupId: 'group-1',
    pinnedNodeIds: [],
    recents: [],
    shelf: [],
    startupTab: null
  })
}

beforeEach(reset)

describe('panels', () => {
  it('toggles panels and switches panel views', () => {
    useWorkbench.getState().togglePanel('right')
    expect(useWorkbench.getState().right.open).toBe(true)

    useWorkbench.getState().showPanelView('left', 'tasks')
    expect(useWorkbench.getState().left).toEqual({ open: true, activeViewId: 'tasks' })

    // showing the already-active view collapses the panel
    useWorkbench.getState().showPanelView('left', 'tasks')
    expect(useWorkbench.getState().left.open).toBe(false)

    useWorkbench.getState().setPanelOpen('bottom', true)
    expect(useWorkbench.getState().bottom.open).toBe(true)
  })
})

describe('zen mode', () => {
  it('snapshots the layout and restores it bit-for-bit on exit', () => {
    const state = useWorkbench.getState()
    state.setPanelOpen('right', true)
    state.setPanelOpen('bottom', true)

    useWorkbench.getState().toggleZen()
    let snapshot = useWorkbench.getState()
    expect(snapshot.mode).toBe('zen')
    expect(snapshot.left.open).toBe(false)
    expect(snapshot.right.open).toBe(false)
    expect(snapshot.zenSnapshot).toEqual({ left: true, right: true, bottom: true })

    useWorkbench.getState().toggleZen()
    snapshot = useWorkbench.getState()
    expect(snapshot.mode).toBe('default')
    expect(snapshot.zenSnapshot).toBeNull()
    expect(snapshot.left.open).toBe(true)
    expect(snapshot.right.open).toBe(true)
    expect(snapshot.bottom.open).toBe(true)
  })
})

describe('tabs', () => {
  it('opens permanent tabs and accumulates them', () => {
    const state = useWorkbench.getState()
    state.openTab({ nodeId: 'a', nodeType: 'page', title: 'A' })
    state.openTab({ nodeId: 'b', nodeType: 'database', title: 'B' })

    const group = useWorkbench.getState().groups[0]
    expect(group.tabs.map((tab) => tab.id)).toEqual(['page:a', 'database:b'])
    expect(group.activeTabId).toBe('database:b')
    expect(selectActiveTab(useWorkbench.getState())?.nodeId).toBe('b')
  })

  it('replaces the existing preview tab with the next preview', () => {
    const state = useWorkbench.getState()
    state.openTab({ nodeId: 'a', nodeType: 'page', preview: true })
    state.openTab({ nodeId: 'b', nodeType: 'page', preview: true })

    const group = useWorkbench.getState().groups[0]
    expect(group.tabs.map((tab) => tab.id)).toEqual(['page:b'])
    expect(group.tabs[0].preview).toBe(true)
  })

  it('re-opening an existing tab without preview promotes it', () => {
    const state = useWorkbench.getState()
    state.openTab({ nodeId: 'a', nodeType: 'page', preview: true })
    state.openTab({ nodeId: 'a', nodeType: 'page' })

    expect(useWorkbench.getState().groups[0].tabs[0].preview).toBe(false)
  })

  it('promotes a preview tab explicitly and on edit', () => {
    const state = useWorkbench.getState()
    state.openTab({ nodeId: 'a', nodeType: 'page', preview: true })
    state.promoteTab(tabIdFor('page', 'a'))
    expect(useWorkbench.getState().groups[0].tabs[0].preview).toBe(false)
  })

  it('background opens do not steal the active tab', () => {
    const state = useWorkbench.getState()
    state.openTab({ nodeId: 'a', nodeType: 'page' })
    state.openTab({ nodeId: 'b', nodeType: 'page', background: true })

    expect(useWorkbench.getState().groups[0].activeTabId).toBe('page:a')
  })

  it('closing the active tab activates its neighbor', () => {
    const state = useWorkbench.getState()
    state.openTab({ nodeId: 'a', nodeType: 'page' })
    state.openTab({ nodeId: 'b', nodeType: 'page' })
    state.openTab({ nodeId: 'c', nodeType: 'page' })

    useWorkbench.getState().closeTab('page:c')
    const group = useWorkbench.getState().groups[0]
    expect(group.tabs.map((tab) => tab.id)).toEqual(['page:a', 'page:b'])
    expect(group.activeTabId).toBe('page:b')
  })

  it('pins tabs and updates titles everywhere', () => {
    const state = useWorkbench.getState()
    state.openTab({ nodeId: 'a', nodeType: 'page', title: 'Old' })
    state.setTabPinned('page:a', true)
    state.touchRecent({ nodeId: 'a', nodeType: 'page', title: 'Old' })
    state.setTabTitle('a', 'New title')

    const snapshot = useWorkbench.getState()
    expect(snapshot.groups[0].tabs[0].pinned).toBe(true)
    expect(snapshot.groups[0].tabs[0].title).toBe('New title')
    expect(snapshot.recents[0].title).toBe('New title')
  })

  it('cycles tabs in both directions with wrap-around', () => {
    const state = useWorkbench.getState()
    state.openTab({ nodeId: 'a', nodeType: 'page' })
    state.openTab({ nodeId: 'b', nodeType: 'page' })
    state.openTab({ nodeId: 'c', nodeType: 'page' })

    useWorkbench.getState().cycleTab(1)
    expect(useWorkbench.getState().groups[0].activeTabId).toBe('page:a')
    useWorkbench.getState().cycleTab(-1)
    expect(useWorkbench.getState().groups[0].activeTabId).toBe('page:c')
  })
})

describe('splits and groups', () => {
  it('splitWith creates a second group and focuses it', () => {
    const state = useWorkbench.getState()
    state.openTab({ nodeId: 'a', nodeType: 'page' })
    state.splitWith({ nodeId: 'a', nodeType: 'page', title: 'A' })

    const snapshot = useWorkbench.getState()
    expect(snapshot.groups).toHaveLength(2)
    expect(snapshot.activeGroupId).toBe('group-2')
    expect(snapshot.groups[1].tabs[0].id).toBe('page:a')
  })

  it('moveTab moves between groups and drops an emptied second group', () => {
    const state = useWorkbench.getState()
    state.openTab({ nodeId: 'a', nodeType: 'page' })
    state.splitWith({ nodeId: 'b', nodeType: 'page' })

    useWorkbench.getState().moveTab('page:b', 'group-1', 0)
    const snapshot = useWorkbench.getState()
    expect(snapshot.groups).toHaveLength(1)
    expect(snapshot.groups[0].tabs.map((tab) => tab.id)).toEqual(['page:b', 'page:a'])
  })

  it('closing the last tab of the second group removes the group', () => {
    const state = useWorkbench.getState()
    state.openTab({ nodeId: 'a', nodeType: 'page' })
    state.splitWith({ nodeId: 'b', nodeType: 'page' })

    useWorkbench.getState().closeTab('page:b', 'group-2')
    const snapshot = useWorkbench.getState()
    expect(snapshot.groups).toHaveLength(1)
    expect(snapshot.activeGroupId).toBe('group-1')
  })

  it('focusGroup ignores unknown groups', () => {
    useWorkbench.getState().focusGroup('nope')
    expect(useWorkbench.getState().activeGroupId).toBe('group-1')
  })
})

describe('pins, recents, shelf, startup', () => {
  it('togglePinnedNode adds and removes pins', () => {
    useWorkbench.getState().togglePinnedNode('a')
    expect(useWorkbench.getState().pinnedNodeIds).toEqual(['a'])
    useWorkbench.getState().togglePinnedNode('a')
    expect(useWorkbench.getState().pinnedNodeIds).toEqual([])
  })

  it('touchRecent dedupes and keeps most-recent-first order', () => {
    const state = useWorkbench.getState()
    state.touchRecent({ nodeId: 'a', nodeType: 'page', title: 'A' })
    state.touchRecent({ nodeId: 'b', nodeType: 'page', title: 'B' })
    state.touchRecent({ nodeId: 'a', nodeType: 'page', title: 'A' })

    expect(useWorkbench.getState().recents.map((recent) => recent.nodeId)).toEqual(['a', 'b'])
  })

  it('shelf holds unique references and clears', () => {
    const state = useWorkbench.getState()
    state.shelfAdd({ nodeId: 'a', nodeType: 'page', title: 'A' })
    state.shelfAdd({ nodeId: 'b', nodeType: 'task' })
    state.shelfAdd({ nodeId: 'a', nodeType: 'page', title: 'A2' })

    expect(useWorkbench.getState().shelf.map((entry) => entry.nodeId)).toEqual(['a', 'b'])
    useWorkbench.getState().shelfRemove('b')
    expect(useWorkbench.getState().shelf.map((entry) => entry.nodeId)).toEqual(['a'])
    useWorkbench.getState().shelfClear()
    expect(useWorkbench.getState().shelf).toEqual([])
  })

  it('stores and clears the startup tab', () => {
    useWorkbench.getState().setStartupTab({ nodeType: 'tasks', nodeId: 'tasks' })
    expect(useWorkbench.getState().startupTab).toEqual({ nodeType: 'tasks', nodeId: 'tasks' })
    useWorkbench.getState().setStartupTab(null)
    expect(useWorkbench.getState().startupTab).toBeNull()
  })
})

describe('chrome posture (0273)', () => {
  it('defaults to pinned and toggles to quiet', () => {
    useWorkbench.setState({ chrome: 'pinned', discloseLevel: 0 })
    expect(useWorkbench.getState().chrome).toBe('pinned')

    useWorkbench.getState().toggleChrome()
    expect(useWorkbench.getState().chrome).toBe('quiet')
    useWorkbench.getState().toggleChrome()
    expect(useWorkbench.getState().chrome).toBe('pinned')
  })

  it('setChrome resets the disclosure ladder to L0', () => {
    useWorkbench.setState({ chrome: 'quiet', discloseLevel: 2 })
    useWorkbench.getState().setChrome('pinned')
    expect(useWorkbench.getState().discloseLevel).toBe(0)
  })

  it('tracks the disclosure level', () => {
    useWorkbench.setState({ discloseLevel: 0 })
    useWorkbench.getState().setDiscloseLevel(2)
    expect(useWorkbench.getState().discloseLevel).toBe(2)
    useWorkbench.getState().setDiscloseLevel(0)
    expect(useWorkbench.getState().discloseLevel).toBe(0)
  })

  it('excludes the disclosure level from persistence', () => {
    useWorkbench.setState({ discloseLevel: 2 })
    const persisted = useWorkbench.persist
      .getOptions()
      .partialize?.(useWorkbench.getState()) as unknown as Record<string, unknown>
    expect(persisted).toBeDefined()
    expect('discloseLevel' in persisted).toBe(false)
    expect(persisted.chrome).toBeDefined()
  })
})

describe('layout tree (0280)', () => {
  it('applyPreset replaces the tree and keeps the legacy axes coherent', () => {
    useWorkbench.getState().applyPreset('bench')
    const state = useWorkbench.getState()
    expect(state.tree.workspaceId).toBe(presetWorkspaceId('bench'))
    expect(state.layout).toBe('workbench')
    expect(state.chrome).toBe('pinned')
    expect(state.left).toEqual({ open: true, activeViewId: 'explorer' })
    expect(state.right.open).toBe(false)

    useWorkbench.getState().applyPreset('quiet')
    const quiet = useWorkbench.getState()
    expect(quiet.layout).toBe('calm')
    expect(quiet.chrome).toBe('quiet')
    expect(quiet.left.open).toBe(false)
    expect(quiet.left.activeViewId).toBe('navigator')
  })

  it('setLayout / toggleLayout are preset switches over the tree', () => {
    useWorkbench.getState().applyPreset('calm')
    useWorkbench.getState().setLayout('workbench')
    expect(useWorkbench.getState().tree.surface.tabsEnabled).toBe(true)
    useWorkbench.getState().toggleLayout()
    expect(useWorkbench.getState().tree.workspaceId).toBe(presetWorkspaceId('calm'))
  })

  it('chrome is an axis: flipping it never resets placements', () => {
    useWorkbench.getState().applyPreset('calm')
    useWorkbench.getState().moveSlot('context', 'dock.left')
    useWorkbench.getState().setChrome('quiet')
    const state = useWorkbench.getState()
    expect(state.tree.chrome).toBe('quiet')
    expect(regionOf(state.tree, 'context')).toBe('dock.left')
  })

  it('moveSlot mutates the tree through the store', () => {
    useWorkbench.getState().applyPreset('bench')
    useWorkbench.getState().moveSlot('console', 'dock.corner')
    expect(regionOf(useWorkbench.getState().tree, 'console')).toBe('dock.corner')
  })

  it('setSlotTier un-pins and closes the dock resting on that view', () => {
    useWorkbench.getState().applyPreset('calm')
    expect(useWorkbench.getState().left).toEqual({ open: true, activeViewId: 'navigator' })
    useWorkbench.getState().setSlotTier('navigator', 'summoned')
    const state = useWorkbench.getState()
    expect(state.tree.regions['dock.left'][0].tier).toBe('summoned')
    expect(state.left.open).toBe(false)
  })

  it('loadWorkspace adopts a payload tree', () => {
    const payload = {
      name: 'Monday triage',
      preset: 'bench' as const,
      tree: moveSlot(createPresetTree('bench'), 'tasks', 'dock.right')
    }
    useWorkbench.getState().loadWorkspace(payload)
    expect(regionOf(useWorkbench.getState().tree, 'tasks')).toBe('dock.right')
    expect(useWorkbench.getState().layout).toBe('workbench')
  })

  it('collapses every legacy preset profile onto the one default tree (0284 v4)', () => {
    const migrate = useWorkbench.persist.getOptions().migrate
    expect(migrate).toBeDefined()
    // A former bench profile lands in the single shell, panel state intact.
    const bench = migrate?.(
      { layout: 'workbench', chrome: 'pinned', left: { open: true, activeViewId: 'tasks' } },
      0
    ) as {
      tree?: { workspaceId: string }
      left?: { activeViewId: string }
      chrome?: string
      focus?: boolean
    }
    expect(bench?.tree?.workspaceId).toBe(DEFAULT_WORKSPACE_ID)
    expect(bench?.left?.activeViewId).toBe('tasks')
    // A former quiet profile also lands in the one shell with chrome restored
    // (the quiet posture becomes the ephemeral `focus` toggle, off at rest).
    const quiet = migrate?.({ layout: 'calm', chrome: 'quiet' }, 0) as {
      tree?: { workspaceId: string }
      chrome?: string
      focus?: boolean
    }
    expect(quiet?.tree?.workspaceId).toBe(DEFAULT_WORKSPACE_ID)
    expect(quiet?.chrome).toBe('pinned')
    expect(quiet?.focus).toBe(false)
  })

  it('preserves a user-saved (non-preset) workspace tree across v4', () => {
    const migrate = useWorkbench.persist.getOptions().migrate
    const custom = moveSlot(createPresetTree('bench'), 'tasks', 'dock.right')
    custom.workspaceId = 'workspace-user-saved-123'
    const migrated = migrate?.({ tree: custom }, 3) as { tree?: { workspaceId: string } }
    expect(migrated?.tree?.workspaceId).toBe('workspace-user-saved-123')
  })
})

describe('foreign-tab migration (0280 v3)', () => {
  it('drops tabs with unknown nodeTypes and repairs activeTabId', () => {
    const migrate = useWorkbench.persist.getOptions().migrate
    const migrated = migrate?.(
      {
        groups: [
          {
            id: 'group-1',
            tabs: [
              {
                id: 'canvas:c1',
                nodeId: 'c1',
                nodeType: 'canvas',
                title: '',
                pinned: false,
                preview: false
              },
              {
                id: 'martian:m1',
                nodeId: 'm1',
                nodeType: 'martian-view',
                title: '',
                pinned: false,
                preview: false
              }
            ],
            activeTabId: 'martian:m1'
          }
        ]
      },
      2
    ) as { groups: Array<{ tabs: Array<{ id: string }>; activeTabId: string | null }> }
    expect(migrated.groups[0].tabs.map((tab) => tab.id)).toEqual(['canvas:c1'])
    expect(migrated.groups[0].activeTabId).toBe('canvas:c1')
  })
})
