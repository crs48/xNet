/**
 * PlatformPort — everything the shell needs from its host (exploration 0406).
 *
 * The workbench is on its way to `packages/workbench`, shared by web and
 * desktop. Web navigates by URL through TanStack Router; the Electron renderer
 * has no router at all and navigates by transitioning a `ShellState` reducer.
 * Rather than pick one and force it on the other, the shell states its
 * *intent* — "open this node", "go to this surface" — and the host decides
 * what that means.
 *
 * Keep this interface narrow. Every method added is a place the two surfaces
 * can drift, so the bar is "the shell genuinely cannot be written without it".
 * Platform checks must never appear in component bodies — that is how a fork
 * restarts inside shared code.
 */

import type { TabNodeType } from './state'
import type { ComponentType, ReactNode } from 'react'
import { createContext, useContext } from 'react'

/** Where the shell wants to send the user, independent of how the host gets there. */
export type NavTarget =
  /** A workspace node. `preview` carries the 0284 preview-tab intent. */
  | { kind: 'node'; nodeType: TabNodeType; nodeId: string; preview?: boolean }
  /** A primary destination by its stable `SurfaceDef.id` (e.g. `tasks`). */
  | { kind: 'surface'; surfaceId: string }
  /** The shell's home. */
  | { kind: 'home' }
  /**
   * Escape hatch for destinations that are still only expressible as a path
   * (settings sections, request queues). Hosts without URLs map these onto
   * their own surfaces; every use here is a candidate for promotion to a
   * `surface`, so prefer the cases above.
   */
  | { kind: 'path'; path: string }

export interface NavigateOptions {
  /** Replace the current history entry instead of pushing (web); no-op elsewhere. */
  replace?: boolean
}

/**
 * Host capabilities. Absent means the affordance is not rendered — the shell
 * asks what the host *can do*, never what platform it is running on.
 */
export interface PlatformCapabilities {
  /** Native application menus (desktop only). */
  nativeMenus: boolean
  /** System-audio meeting capture (desktop only). */
  meetingsCapture: boolean
  /** The in-process MCP agent bridge (desktop only, PR #638). */
  agentBridge: boolean
  /** Real filesystem access beyond the browser sandbox. */
  filesystem: boolean
  /** The host addresses destinations with URLs (web); false for the desktop shell. */
  urlAddressable: boolean
}

/** Props the shell passes to the host's link component. */
export interface PlatformLinkProps {
  target: NavTarget
  children: ReactNode
  className?: string
  title?: string
  onClick?: () => void
}

export interface PlatformPort {
  navigate(target: NavTarget, options?: NavigateOptions): void
  /**
   * The current location as a path. Web returns the real pathname; hosts
   * without URLs synthesise a stable equivalent so the shell can highlight
   * active nav rows with one code path.
   */
  usePathname(): string
  /** Anchor-or-equivalent for a nav target. Web renders a real `<a href>`. */
  Link: ComponentType<PlatformLinkProps>
  capabilities: Readonly<PlatformCapabilities>
}

const PlatformContext = createContext<PlatformPort | null>(null)

export const PlatformProvider = PlatformContext.Provider

/**
 * Read the host port.
 *
 * Throws rather than falling back to a no-op: a shell that silently stops
 * navigating looks like a dead click, which is far harder to diagnose than a
 * missing provider at boot.
 */
export function usePlatform(): PlatformPort {
  const port = useContext(PlatformContext)
  if (!port) {
    throw new Error('usePlatform: no PlatformProvider above this component.')
  }
  return port
}

/** Convenience for the common case — the shell navigates far more than it reads. */
export function useNavigateTo(): (target: NavTarget, options?: NavigateOptions) => void {
  return usePlatform().navigate
}
