/**
 * Route-derived titles (exploration 0353).
 *
 * With tabs gone the header can't read `selectActiveTab` for "what am I
 * looking at" — nothing owns that state any more. Views publish their
 * title against the route instead, and the header reads it back. While
 * tabs are still on the same call also writes the tab title, so a view
 * has exactly ONE title call either way.
 */
import { useLocation } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useWorkbench } from './state'
import { tabFromPathname } from './tabs'

/**
 * Publish this view's title for the current route. Pass the node id the
 * view renders so the title also reaches the tab store (tabs on) and
 * the recents entry (both modes).
 */
export function usePublishTitle(nodeId: string, title: string | null | undefined): void {
  const pathname = useLocation({ select: (location) => location.pathname })

  useEffect(() => {
    if (!title) return
    const state = useWorkbench.getState()
    state.setRouteTitle(pathname, title)
    // Tabs (while they exist) and recents both key off the node id.
    state.setTabTitle(nodeId, title)
    const descriptor = tabFromPathname(pathname)
    if (descriptor) {
      state.touchRecent({ nodeId: descriptor.nodeId, nodeType: descriptor.nodeType, title })
    }
  }, [pathname, nodeId, title])
}

/** The current route's published title, if a view has published one. */
export function useRouteTitle(): string | null {
  const pathname = useLocation({ select: (location) => location.pathname })
  return useWorkbench((state) => state.routeTitles[pathname] ?? null)
}
