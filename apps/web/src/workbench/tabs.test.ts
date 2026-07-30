/**
 * Route ↔ tab mapping tests (0166).
 */
import { describe, expect, it } from 'vitest'
import { armPreviewIntent } from '../platform/web-platform'
import { navigateToNode, type PlatformNavigate } from './navigation'
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
  it('states node-open intent against the platform port (0406)', () => {
    const calls: unknown[] = []
    const navigate: PlatformNavigate = (target) => {
      calls.push(target)
    }

    navigateToNode(navigate, 'page', 'p')
    navigateToNode(navigate, 'database', 'd')
    navigateToNode(navigate, 'tasks', 'tasks')

    // Route shapes are the web host's business now (`routeForTarget`,
    // web-platform.test.ts); the shell only says what to open.
    expect(calls).toEqual([
      { kind: 'node', nodeType: 'page', nodeId: 'p' },
      { kind: 'node', nodeType: 'database', nodeId: 'd' },
      { kind: 'node', nodeType: 'tasks', nodeId: 'tasks' }
    ])
  })

  it('passes the preview opt-out through to the host', () => {
    const calls: unknown[] = []
    const navigate: PlatformNavigate = (target) => {
      calls.push(target)
    }

    navigateToNode(navigate, 'page', 'p', { preview: false })

    expect(calls).toEqual([{ kind: 'node', nodeType: 'page', nodeId: 'p', preview: false }])
  })
})

describe('armPreviewIntent (VS Code preview tabs, 0284 — now armed by the web host)', () => {
  it('arms the latch for a default node open', () => {
    consumePreviewIntent() // clear any residue
    armPreviewIntent({ kind: 'node', nodeType: 'page', nodeId: 'p' })
    expect(consumePreviewIntent()).toBe(true)
  })

  it('does not arm when activating an existing tab (preview: false)', () => {
    consumePreviewIntent()
    armPreviewIntent({ kind: 'node', nodeType: 'page', nodeId: 'p', preview: false })
    expect(consumePreviewIntent()).toBe(false)
  })

  it('does not arm for non-node targets (a path open must not leak a preview)', () => {
    consumePreviewIntent()
    armPreviewIntent({ kind: 'path', path: '/requests' })
    armPreviewIntent({ kind: 'home' })
    expect(consumePreviewIntent()).toBe(false)
  })
})

describe('syncRouteToTabs', () => {
  it('opens a tab for a routed node and records a recent', () => {
    useWorkbench.setState({
      groups: [{ id: 'group-1', tabs: [], activeTabId: null }],
      activeGroupId: 'group-1',
      recents: [],
      // These exercise the TAB path, which is opt-in since 0353 P5.
      tabsEnabled: true
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
      recents: [],
      // These exercise the TAB path, which is opt-in since 0353 P5.
      tabsEnabled: true
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
      recents: [],
      // These exercise the TAB path, which is opt-in since 0353 P5.
      tabsEnabled: true
    })
    syncRouteToTabs('/discover')
    expect(useWorkbench.getState().groups[0].tabs).toEqual([])
  })

  it('drops a pending preview intent on a non-tab route so it cannot leak (0288)', () => {
    useWorkbench.setState({
      groups: [{ id: 'group-1', tabs: [], activeTabId: null }],
      activeGroupId: 'group-1',
      recents: [],
      // These exercise the TAB path, which is opt-in since 0353 P5.
      tabsEnabled: true
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
