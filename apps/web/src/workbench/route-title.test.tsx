/**
 * Route titles (0353) — the stale-data guard.
 *
 * `useNode` keeps the previous node's data while the next id loads, so a
 * view re-renders with the NEW nodeId and the OLD title. Without the
 * `sourceId` guard that pair lands on the new route: wrong header title,
 * and a recents entry minted under the new id with the old node's name.
 */
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePublishTitle } from './route-title'
import { useWorkbench } from './state'

const pathname = vi.hoisted(() => ({ current: '/doc/page-a' }))

vi.mock('@tanstack/react-router', () => ({
  useLocation: ({ select }: { select: (l: { pathname: string }) => unknown }) =>
    select({ pathname: pathname.current })
}))

beforeEach(() => {
  pathname.current = '/doc/page-a'
  useWorkbench.setState({
    groups: [{ id: 'group-1', tabs: [], activeTabId: null }],
    activeGroupId: 'group-1',
    tabsEnabled: false,
    routeTitles: {},
    routeHistory: [],
    recents: []
  })
})

describe('usePublishTitle', () => {
  it('publishes when the title belongs to the rendered node', () => {
    renderHook(() => usePublishTitle('page-a', 'Alpha', 'page-a'))
    expect(useWorkbench.getState().routeTitles['/doc/page-a']).toBe('Alpha')
    expect(useWorkbench.getState().recents[0]).toMatchObject({ nodeId: 'page-a', title: 'Alpha' })
  })

  it('holds the publish while the previous node’s data is still loaded', () => {
    const { rerender } = renderHook(
      ({ id, title, source }: { id: string; title: string; source: string }) =>
        usePublishTitle(id, title, source),
      { initialProps: { id: 'page-a', title: 'Alpha', source: 'page-a' } }
    )

    // Navigate: route + nodeId flip immediately, data lags one render.
    pathname.current = '/doc/page-b'
    rerender({ id: 'page-b', title: 'Alpha', source: 'page-a' })

    expect(useWorkbench.getState().routeTitles['/doc/page-b']).toBeUndefined()
    expect(useWorkbench.getState().recents.some((r) => r.nodeId === 'page-b')).toBe(false)

    // Data catches up.
    rerender({ id: 'page-b', title: 'Beta', source: 'page-b' })
    expect(useWorkbench.getState().routeTitles['/doc/page-b']).toBe('Beta')
    expect(useWorkbench.getState().recents[0]).toMatchObject({ nodeId: 'page-b', title: 'Beta' })
  })

  it('still publishes when no sourceId is given (synchronous derivations)', () => {
    renderHook(() => usePublishTitle('page-a', 'Alpha'))
    expect(useWorkbench.getState().routeTitles['/doc/page-a']).toBe('Alpha')
  })
})
