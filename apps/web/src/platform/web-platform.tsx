/**
 * The web host's {@link PlatformPort} (exploration 0406).
 *
 * This is the only place in the web app that turns a shell `NavTarget` into a
 * URL. The mapping lived in `workbench/navigation.ts`, but routes are a
 * property of *this host* — the desktop shell has none — so it belongs on the
 * host side of the port, and moves here rather than into `packages/workbench`.
 */

import type { TabNodeType } from '../workbench/state'
import { Link as RouterLink, useLocation, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import {
  type NavTarget,
  type NavigateOptions,
  type PlatformCapabilities,
  type PlatformLinkProps,
  type PlatformPort
} from '../workbench/platform'
import { SURFACES } from '../workbench/surfaces'
import { setPreviewIntent } from '../workbench/tabs'

/**
 * Node type → route path + param name. `null` marks the singleton surfaces
 * that take no id. Exhaustive over {@link TabNodeType}: a missing entry used
 * to navigate nowhere, silently.
 */
const NODE_ROUTES: Record<TabNodeType, { to: string; param: string | null }> = {
  page: { to: '/doc/$docId', param: 'docId' },
  post: { to: '/post/$postId', param: 'postId' },
  database: { to: '/db/$dbId', param: 'dbId' },
  canvas: { to: '/canvas/$canvasId', param: 'canvasId' },
  dashboard: { to: '/dashboard/$dashboardId', param: 'dashboardId' },
  map: { to: '/map/$mapId', param: 'mapId' },
  savedview: { to: '/view/$viewId', param: 'viewId' },
  tag: { to: '/tag/$tagId', param: 'tagId' },
  channel: { to: '/channel/$channelId', param: 'channelId' },
  person: { to: '/person/$did', param: 'did' },
  lab: { to: '/lab/$labId', param: 'labId' },
  space: { to: '/space/$spaceId', param: 'spaceId' },
  frame: { to: '/frame/$frameSpec', param: 'frameSpec' },
  tasks: { to: '/tasks', param: null },
  meetings: { to: '/meetings', param: null },
  data: { to: '/data', param: null },
  experiments: { to: '/experiments', param: null },
  crm: { to: '/crm', param: null },
  finance: { to: '/finance', param: null },
  settings: { to: '/settings', param: null }
}

/** Resolve a nav target to a router path + params. */
export function routeForTarget(
  target: NavTarget
): { to: string; params?: Record<string, string> } | null {
  switch (target.kind) {
    case 'home':
      return { to: '/' }
    case 'path':
      return { to: target.path }
    case 'surface': {
      const surface = SURFACES.find((s) => s.id === target.surfaceId)
      return surface?.to ? { to: surface.to } : null
    }
    case 'node': {
      const route = NODE_ROUTES[target.nodeType]
      if (!route) return null
      return route.param
        ? { to: route.to, params: { [route.param]: target.nodeId } }
        : { to: route.to }
    }
  }
}

/**
 * Preview-tab intent (0284): a node open is a preview unless it says
 * otherwise. Armed before navigating, since the route effect in EditorArea
 * reconciles the store afterwards. Exported for its test — this used to live
 * in `workbench/navigation.ts` and its semantics must not drift in the move.
 */
export function armPreviewIntent(target: NavTarget): void {
  if (target.kind === 'node' && target.preview !== false) setPreviewIntent()
}

const WEB_CAPABILITIES: PlatformCapabilities = {
  nativeMenus: false,
  meetingsCapture: false,
  agentBridge: false,
  filesystem: false,
  urlAddressable: true
}

/** Hoisted so these are hooks in their own right, not ones closed over inside a memo. */
function usePathname(): string {
  return useLocation({ select: (location) => location.pathname })
}

function useSearch(): Readonly<Record<string, unknown>> {
  return useLocation({ select: (location) => location.search as Record<string, unknown> })
}

function WebLink({
  target,
  search,
  children,
  className,
  title,
  onClick,
  draggable,
  onDragStart,
  'data-testid': testId
}: PlatformLinkProps) {
  const route = routeForTarget(target)
  return (
    <RouterLink
      to={(route?.to ?? '/') as never}
      {...(route?.params ? { params: route.params as never } : {})}
      {...(search ? { search: search as never } : {})}
      className={className}
      title={title}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      data-testid={testId}
    >
      {children}
    </RouterLink>
  )
}

/** Build the web port. Memoised so consumers don't re-render on every tick. */
export function useWebPlatformPort(): PlatformPort {
  const navigate = useNavigate()

  return useMemo<PlatformPort>(() => {
    const go = (target: NavTarget, options?: NavigateOptions): void => {
      armPreviewIntent(target)

      const route = routeForTarget(target)
      if (!route) {
        console.warn('[platform] no route for target', target)
        return
      }
      void navigate({
        to: route.to as never,
        ...(route.params ? { params: route.params as never } : {}),
        ...(options?.search ? { search: options.search as never } : {}),
        ...(options?.replace ? { replace: true } : {})
      })
    }

    return {
      navigate: go,
      usePathname,
      useSearch,
      Link: WebLink,
      capabilities: WEB_CAPABILITIES
    }
  }, [navigate])
}
