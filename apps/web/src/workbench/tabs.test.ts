/**
 * Route ↔ tab mapping tests (0166).
 */
import { useNavigate } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { navigateToNode } from './navigation'
import { useWorkbench } from './state'
import {
  consumePreviewIntent,
  routeForTab,
  setPreviewIntent,
  syncRouteToTabs,
  tabFromPathname,
  tabIdForRoute
} from './tabs'

describe('tabFromPathname', () => {
  it('maps node routes onto tab descriptors', () => {
    expect(tabFromPathname('/doc/my-page')).toEqual({ nodeType: 'page', nodeId: 'my-page' })
    expect(tabFromPathname('/db/d1')).toEqual({ nodeType: 'database', nodeId: 'd1' })
    expect(tabFromPathname('/canvas/c1')).toEqual({ nodeType: 'canvas', nodeId: 'c1' })
    expect(tabFromPathname('/dashboard/x')).toEqual({ nodeType: 'dashboard', nodeId: 'x' })
    expect(tabFromPathname('/view/v1')).toEqual({ nodeType: 'savedview', nodeId: 'v1' })
  })

  it('maps singleton surfaces', () => {
    expect(tabFromPathname('/tasks')).toEqual({ nodeType: 'tasks', nodeId: 'tasks' })
    expect(tabFromPathname('/data')).toEqual({ nodeType: 'data', nodeId: 'data' })
  })

  it('decodes encoded node ids', () => {
    expect(tabFromPathname('/doc/default%2Fmy-page')).toEqual({
      nodeType: 'page',
      nodeId: 'default/my-page'
    })
  })

  it('returns null for non-tab routes', () => {
    expect(tabFromPathname('/')).toBeNull()
    expect(tabFromPathname('/discover')).toBeNull()
    expect(tabFromPathname('/doc/')).toBeNull()
  })
})

describe('routeForTab', () => {
  it('builds routes for every tab type', () => {
    expect(routeForTab('page', 'p')).toBe('/doc/p')
    expect(routeForTab('database', 'd')).toBe('/db/d')
    expect(routeForTab('canvas', 'c')).toBe('/canvas/c')
    expect(routeForTab('dashboard', 'x')).toBe('/dashboard/x')
    expect(routeForTab('savedview', 'v')).toBe('/view/v')
    expect(routeForTab('tasks', 'tasks')).toBe('/tasks')
    expect(routeForTab('data', 'data')).toBe('/data')
  })
})

describe('tabIdForRoute', () => {
  it('resolves a tab id for tab routes (single-click sources that only know a path)', () => {
    expect(tabIdForRoute('/crm')).toBe('crm:crm')
    expect(tabIdForRoute('/finance')).toBe('finance:finance')
    expect(tabIdForRoute('/settings')).toBe('settings:settings')
    expect(tabIdForRoute('/doc/p')).toBe('page:p')
  })

  it('returns null for non-tab routes', () => {
    expect(tabIdForRoute('/discover')).toBeNull()
    expect(tabIdForRoute('/analytics')).toBeNull()
    expect(tabIdForRoute('/')).toBeNull()
  })
})

describe('preview intent', () => {
  it('is consumed exactly once', () => {
    expect(consumePreviewIntent()).toBe(false)
    setPreviewIntent()
    expect(consumePreviewIntent()).toBe(true)
    expect(consumePreviewIntent()).toBe(false)
  })
})

describe('navigateToNode', () => {
  it('routes every node type through the typed navigator', () => {
    const calls: unknown[] = []
    const navigate = ((options: unknown) => {
      calls.push(options)
      return Promise.resolve()
    }) as unknown as ReturnType<typeof useNavigate>

    navigateToNode(navigate, 'page', 'p')
    navigateToNode(navigate, 'database', 'd')
    navigateToNode(navigate, 'canvas', 'c')
    navigateToNode(navigate, 'dashboard', 'x')
    navigateToNode(navigate, 'savedview', 'v')
    navigateToNode(navigate, 'tasks', 'tasks')
    navigateToNode(navigate, 'data', 'data')

    expect(calls).toEqual([
      { to: '/doc/$docId', params: { docId: 'p' } },
      { to: '/db/$dbId', params: { dbId: 'd' } },
      { to: '/canvas/$canvasId', params: { canvasId: 'c' } },
      { to: '/dashboard/$dashboardId', params: { dashboardId: 'x' } },
      { to: '/view/$viewId', params: { viewId: 'v' } },
      { to: '/tasks' },
      { to: '/data' }
    ])
    consumePreviewIntent() // hermetic: these opens set a preview intent
  })

  it('sets a preview intent by default (VS Code preview tabs, 0284)', () => {
    const navigate = (() => Promise.resolve()) as unknown as ReturnType<typeof useNavigate>
    consumePreviewIntent() // clear any residue
    navigateToNode(navigate, 'page', 'p')
    expect(consumePreviewIntent()).toBe(true)
  })

  it('opts out of preview when activating an existing tab', () => {
    const navigate = (() => Promise.resolve()) as unknown as ReturnType<typeof useNavigate>
    consumePreviewIntent()
    navigateToNode(navigate, 'page', 'p', { preview: false })
    expect(consumePreviewIntent()).toBe(false)
  })
})

describe('syncRouteToTabs', () => {
  it('opens a tab for a routed node and records a recent', () => {
    useWorkbench.setState({
      groups: [{ id: 'group-1', tabs: [], activeTabId: null }],
      activeGroupId: 'group-1',
      recents: []
    })

    syncRouteToTabs('/doc/r1')
    let snapshot = useWorkbench.getState()
    expect(snapshot.groups[0].tabs.map((tab) => tab.id)).toEqual(['page:r1'])
    expect(snapshot.recents[0]).toMatchObject({ nodeId: 'r1', nodeType: 'page' })

    // navigating again activates the existing tab instead of duplicating
    syncRouteToTabs('/tasks')
    syncRouteToTabs('/doc/r1')
    snapshot = useWorkbench.getState()
    expect(snapshot.groups[0].tabs.map((tab) => tab.id)).toEqual(['page:r1', 'tasks:tasks'])
    expect(snapshot.groups[0].activeTabId).toBe('page:r1')
  })

  it('honours the preview intent for the next navigation only', () => {
    useWorkbench.setState({
      groups: [{ id: 'group-1', tabs: [], activeTabId: null }],
      activeGroupId: 'group-1',
      recents: []
    })

    setPreviewIntent()
    syncRouteToTabs('/doc/p1')
    syncRouteToTabs('/doc/p2')

    const tabs = useWorkbench.getState().groups[0].tabs
    expect(tabs.map((tab) => `${tab.id}${tab.preview ? '(p)' : ''}`)).toEqual([
      'page:p1(p)',
      'page:p2'
    ])
  })

  it('ignores non-tab routes', () => {
    useWorkbench.setState({
      groups: [{ id: 'group-1', tabs: [], activeTabId: null }],
      activeGroupId: 'group-1',
      recents: []
    })
    syncRouteToTabs('/discover')
    expect(useWorkbench.getState().groups[0].tabs).toEqual([])
  })

  it('drops a pending preview intent on a non-tab route so it cannot leak (0288)', () => {
    useWorkbench.setState({
      groups: [{ id: 'group-1', tabs: [], activeTabId: null }],
      activeGroupId: 'group-1',
      recents: []
    })

    // A source armed preview then navigated somewhere untabbed; the next real
    // open must NOT inherit that intent.
    setPreviewIntent()
    syncRouteToTabs('/discover')
    syncRouteToTabs('/doc/p1')

    const tabs = useWorkbench.getState().groups[0].tabs
    expect(tabs.map((tab) => `${tab.id}${tab.preview ? '(p)' : ''}`)).toEqual(['page:p1'])
  })
})
