/**
 * The desktop host's {@link PlatformPort} (exploration 0406, phase 3).
 *
 * Web resolves a {@link NavTarget} to a URL through TanStack Router; this host
 * resolves it to a {@link ShellState} transition. The existing shell reducer
 * survives as the navigation *implementation* — exactly the deal 0280 deferred
 * and the exploration's sequence diagram draws.
 *
 * The port's pathname is synthesized from the shell state so shared components
 * highlight active rows with one code path. The synthesized paths reuse web's
 * route grammar (`/doc/:id`, `/settings`, …) — not because desktop has URLs,
 * but so `tabFromPathname`/`routeTitles` in the shared core behave identically
 * on both hosts.
 */

import type { ShellState } from './shell-state'
import type {
  NavTarget,
  PlatformCapabilities,
  PlatformLinkProps,
  PlatformPort
} from '@xnetjs/workbench'
import { createElement, useMemo } from 'react'

export interface DesktopNavDeps {
  shellState: ShellState
  /** The shell's own home transition (viewport/timer-aware). */
  returnHome: () => void
  /** Open a document by id through the shell's own resolution (type lookup + canvas glide). */
  openDocument: (docId: string) => void
  openAssistant: () => void
  openSettings: () => void
  openMeetings: () => void
  openDataWorkspace: () => void
  openSocialImport: () => void
}

const DESKTOP_CAPABILITIES: PlatformCapabilities = {
  nativeMenus: true,
  meetingsCapture: true,
  // Live since #638; the preload always exposes the control surface.
  agentBridge: true,
  filesystem: true,
  urlAddressable: false
}

/** Synthesize web's route grammar from the shell state (read side of the port). */
export function pathnameForShellState(state: ShellState): string {
  switch (state.kind) {
    case 'canvas-home':
      return '/'
    case 'page-focus':
      return `/doc/${encodeURIComponent(state.docId)}`
    case 'database-focus':
    case 'database-split':
      return `/db/${encodeURIComponent(state.docId)}`
    case 'settings':
      return '/settings'
    case 'data-workspace':
      return '/data'
    case 'social-import':
      return '/social-import'
    case 'meetings':
      return '/meetings'
    case 'stories':
      return '/stories'
    case 'assistant':
      return '/ai'
  }
}

/**
 * Resolve a nav intent to a shell action via the injected handlers (write side).
 * Returns false when this host has no surface for the target — the caller
 * decides whether that is a log or an error, but it must not be silent.
 */
export function navigateShell(target: NavTarget, deps: DesktopNavDeps): boolean {
  switch (target.kind) {
    case 'home':
      deps.returnHome()
      return true
    case 'node':
      switch (target.nodeType) {
        case 'page':
        case 'database':
        case 'canvas':
          deps.openDocument(target.nodeId)
          return true
        case 'settings':
          deps.openSettings()
          return true
        case 'meetings':
          deps.openMeetings()
          return true
        case 'data':
          deps.openDataWorkspace()
          return true
        default:
          return false
      }
    case 'surface':
      if (target.surfaceId === 'ai') {
        deps.openAssistant()
        return true
      }
      return false
    case 'path':
      switch (target.path) {
        case '/':
          deps.returnHome()
          return true
        case '/settings':
          deps.openSettings()
          return true
        case '/meetings':
          deps.openMeetings()
          return true
        case '/data':
          deps.openDataWorkspace()
          return true
        case '/social-import':
          deps.openSocialImport()
          return true
        case '/ai':
          deps.openAssistant()
          return true
        default:
          return false
      }
  }
}

/**
 * Links have no meaning without URLs: render a button-shaped anchor that
 * navigates through the port on click. Drag/testid passthrough matches the
 * web link so shared rows behave identically.
 */
function makeDesktopLink(navigate: (target: NavTarget) => void) {
  return function DesktopLink({
    target,
    children,
    className,
    title,
    onClick,
    draggable,
    onDragStart,
    'data-testid': testId
  }: PlatformLinkProps) {
    return createElement(
      'a',
      {
        className,
        title,
        draggable,
        onDragStart,
        'data-testid': testId,
        onClick: (event: MouseEvent) => {
          event.preventDefault()
          onClick?.()
          navigate(target)
        }
      },
      children
    )
  }
}

/** Build the desktop port. Memoised against the live shell state + handlers. */
export function useDesktopPlatformPort(deps: DesktopNavDeps): PlatformPort {
  const { shellState } = deps
  return useMemo<PlatformPort>(() => {
    const navigate = (target: NavTarget): void => {
      if (!navigateShell(target, deps)) {
        // Loud, not silent: a dead click is the failure mode 0406 exists to kill.
        console.warn('[desktop-platform] no surface for target', target)
      }
    }
    return {
      navigate,
      usePathname: () => pathnameForShellState(shellState),
      useSearch: () => ({}),
      Link: makeDesktopLink(navigate),
      capabilities: DESKTOP_CAPABILITIES
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps is a fresh object per render; memoise on its fields
  }, [
    shellState,
    deps.returnHome,
    deps.openDocument,
    deps.openAssistant,
    deps.openSettings,
    deps.openMeetings,
    deps.openDataWorkspace,
    deps.openSocialImport
  ])
}
