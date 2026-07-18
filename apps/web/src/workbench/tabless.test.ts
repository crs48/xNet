/**
 * Tabless mode (0353): the working set without tabs — route titles,
 * the recent-two toggle, recents fed by the route effect, and the
 * split target.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { selectPreviousRoute, useWorkbench } from './state'
import { syncRouteToTabs, trackRouteVisit } from './tabs'

function reset(tabsEnabled: boolean) {
  useWorkbench.setState({
    groups: [{ id: 'group-1', tabs: [], activeTabId: null }],
    activeGroupId: 'group-1',
    tabsEnabled,
    routeTitles: {},
    routeHistory: [],
    splitTarget: null,
    pinnedNodeIds: [],
    recents: []
  })
}

beforeEach(() => reset(false))

describe('route titles', () => {
  it('publishes and reads a title per route', () => {
    useWorkbench.getState().setRouteTitle('/doc/abc', 'Meeting notes')
    expect(useWorkbench.getState().routeTitles['/doc/abc']).toBe('Meeting notes')
  })

  it('is a no-op when the title is unchanged (no render churn)', () => {
    const state = useWorkbench.getState()
    state.setRouteTitle('/doc/abc', 'Same')
    const first = useWorkbench.getState().routeTitles
    state.setRouteTitle('/doc/abc', 'Same')
    expect(useWorkbench.getState().routeTitles).toBe(first)
  })
})

describe('recent-two toggle', () => {
  it('remembers the previous route and ignores repeats', () => {
    const state = () => useWorkbench.getState()
    state().pushRouteHistory('/doc/a')
    expect(selectPreviousRoute(state())).toBeNull()

    state().pushRouteHistory('/doc/b')
    expect(selectPreviousRoute(state())).toBe('/doc/a')

    // Re-visiting the same route must not shuffle the pair.
    state().pushRouteHistory('/doc/b')
    expect(selectPreviousRoute(state())).toBe('/doc/a')

    // Toggling back makes /doc/b the "other one" again.
    state().pushRouteHistory('/doc/a')
    expect(selectPreviousRoute(state())).toBe('/doc/b')
  })

  it('keeps at most two entries', () => {
    const state = () => useWorkbench.getState()
    state().pushRouteHistory('/doc/a')
    state().pushRouteHistory('/doc/b')
    state().pushRouteHistory('/doc/c')
    expect(state().routeHistory).toEqual(['/doc/c', '/doc/b'])
  })
})

describe('trackRouteVisit', () => {
  it('feeds recents without opening a tab when tabless', () => {
    trackRouteVisit('/doc/page-1')
    const state = useWorkbench.getState()
    expect(state.recents[0]).toMatchObject({ nodeId: 'page-1', nodeType: 'page' })
    expect(state.groups[0].tabs).toHaveLength(0)
  })

  it('records non-node routes in history but not recents', () => {
    trackRouteVisit('/settings')
    const state = useWorkbench.getState()
    expect(state.routeHistory[0]).toBe('/settings')
    // /settings IS a tab node type, so it lands in recents too; a
    // genuinely untabbed route does not.
    trackRouteVisit('/welcome')
    expect(useWorkbench.getState().routeHistory[0]).toBe('/welcome')
    expect(useWorkbench.getState().recents.some((r) => r.nodeId === 'welcome')).toBe(false)
  })

  it('still opens tabs when tabs are enabled', () => {
    reset(true)
    trackRouteVisit('/doc/page-2')
    syncRouteToTabs('/doc/page-2')
    const state = useWorkbench.getState()
    expect(state.groups[0].tabs).toHaveLength(1)
    expect(state.recents[0]?.nodeId).toBe('page-2')
  })

  it('syncRouteToTabs opens nothing when tabless', () => {
    syncRouteToTabs('/doc/page-3')
    expect(useWorkbench.getState().groups[0].tabs).toHaveLength(0)
  })
})

describe('split target', () => {
  it('sets and clears without touching tab groups', () => {
    const state = () => useWorkbench.getState()
    state().setSplitTarget({ nodeId: 'db-1', nodeType: 'database' })
    expect(state().splitTarget).toEqual({ nodeId: 'db-1', nodeType: 'database' })
    expect(state().groups[0].tabs).toHaveLength(0)

    state().setSplitTarget(null)
    expect(state().splitTarget).toBeNull()
  })
})
