/**
 * Route → lens sync (exploration 0388).
 *
 * The route is the source of truth for "where am I". When a route belongs to
 * exactly one lens (`/crm` → people, `/data` → views), landing on it — by
 * reload, deep link, browser Back, or ⌘K — adopts that lens, so the tree and
 * the main area always describe the same place.
 *
 * Shared routes are deliberately left alone: `/` is home for three lenses, so
 * arriving there keeps whichever projection the user last chose rather than
 * resetting them to All.
 */
import { useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useWorkbench } from '../state'
import { sidebarRegistry } from './registry'
import { lensForRoute } from './sections'

export function useLensRouteSync(): void {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  useEffect(() => {
    const lensId = lensForRoute(pathname, (id) => sidebarRegistry.getLens(id)?.route)
    if (!lensId) return
    const { activeLensId, setActiveLens } = useWorkbench.getState()
    if (activeLensId !== lensId) setActiveLens(lensId)
  }, [pathname])
}
