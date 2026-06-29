/**
 * Calm-shell modes and the route → mode table (exploration 0250).
 *
 * The calm shell collapses the workbench's twelve-icon rail into three primary
 * modes — xNet's analog of Claude desktop's Chat / Cowork / Code:
 *
 *   Companion — talk to your agent (the promoted AI surface)
 *   Workspace — your pages, databases, canvases, tasks, data
 *   Network   — people, channels, discover, CRM
 *
 * Every one of the app's routes keeps its URL; this table just decides which
 * mode "owns" a given path (so the ModeSwitch can highlight it) and where each
 * mode lands when you click it. A handful of surfaces (settings, analytics,
 * share, welcome) are *modeless* — full-window, owned by no mode — and map to
 * `null`. This module is pure so it can be unit-tested without the DOM.
 */
import type { CalmMode } from '../state'
import { Compass, FolderTree, Sparkles, type LucideIcon } from 'lucide-react'

export interface CalmModeDef {
  id: CalmMode
  label: string
  icon: LucideIcon
  /** The route the ModeSwitch navigates to when this mode is chosen. */
  home: string
}

/** The three primary modes, in switch order (top → bottom). */
export const CALM_MODES: CalmModeDef[] = [
  { id: 'companion', label: 'Companion', icon: Sparkles, home: '/companion' },
  { id: 'workspace', label: 'Workspace', icon: FolderTree, home: '/' },
  { id: 'network', label: 'Network', icon: Compass, home: '/discover' }
]

/** Path prefixes owned by the Network mode (people + social surfaces). */
const NETWORK_PREFIXES = ['/discover', '/requests', '/crm', '/person', '/channel', '/social-import']

/** Path prefixes owned by the Companion mode. */
const COMPANION_PREFIXES = ['/companion']

/**
 * Modeless surfaces — full-window, highlighted by no mode (0250). Kept narrow
 * on purpose: only chrome that genuinely belongs to none of the three.
 */
const MODELESS_PREFIXES = ['/settings', '/analytics', '/welcome', '/share']

function matches(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

/**
 * Which mode owns this path? Returns `null` for modeless surfaces. Everything
 * not explicitly Companion/Network/modeless is Workspace (the content default:
 * `/`, `/doc`, `/db`, `/canvas`, `/dashboard`, `/map`, `/view`, `/tasks`,
 * `/data`, `/experiments`, `/finance`, `/lab`, `/space`, `/tag`, `/stories`).
 */
export function modeForPath(pathname: string): CalmMode | null {
  if (matches(pathname, MODELESS_PREFIXES)) return null
  if (matches(pathname, COMPANION_PREFIXES)) return 'companion'
  if (matches(pathname, NETWORK_PREFIXES)) return 'network'
  return 'workspace'
}

/** The landing route for a mode (used by the ModeSwitch). */
export function homeForMode(mode: CalmMode): string {
  return CALM_MODES.find((m) => m.id === mode)?.home ?? '/'
}
