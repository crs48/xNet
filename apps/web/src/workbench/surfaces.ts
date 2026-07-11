/**
 * Surfaces — the primary destinations the Floating shell's sidebar curates
 * (exploration 0286).
 *
 * A surface is either a **panel** (its registered slot view renders inside the
 * contextual bottom sidebar island — Explorer, Tasks, Chats, Today, Data, AI)
 * or a **route** (selecting it opens that route in the editor; the bottom
 * island shows a small launcher). The top island's primary rows are the
 * `navPinned` subset; the rest live in the "More" surfaces roll-out, where the
 * user pins/unpins to curate what stays visible.
 */
import { useNavigate } from '@tanstack/react-router'
import {
  BarChart3,
  CheckSquare2,
  Compass,
  Contact,
  Database,
  Files,
  Inbox,
  MessageSquare,
  Mic,
  Sparkles,
  Sunrise,
  Wallet,
  type LucideIcon
} from 'lucide-react'
import { useCallback } from 'react'
import { useWorkbench } from './state'
import { setPreviewIntent, tabIdForRoute } from './tabs'

export interface SurfaceDef {
  /** Stable id — persisted in `activeSurface` / `navPinned`. */
  id: string
  label: string
  icon: LucideIcon
  /** `panel` renders a slot view in the bottom island; `route` navigates. */
  kind: 'panel' | 'route'
  /** Slot view id (panel surfaces). */
  viewId?: string
  /**
   * Route path. Required for route surfaces; a panel surface may also carry
   * one, in which case activating it drives the bottom island *and* opens the
   * route in the editor (Tasks → the task board).
   */
  to?: string
  /** Live count source for the trailing badge. */
  badge?: 'requests'
  /** Emphasised (ink pill) rather than muted-mono count. */
  emphasis?: boolean
}

/** Every surface, in roll-out order (pinned ones are the `navPinned` subset). */
export const SURFACES: SurfaceDef[] = [
  { id: 'explorer', label: 'Explorer', icon: Files, kind: 'panel', viewId: 'explorer' },
  {
    id: 'requests',
    label: 'Inbox',
    icon: Inbox,
    kind: 'route',
    to: '/requests',
    badge: 'requests',
    emphasis: true
  },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare2, kind: 'panel', viewId: 'tasks', to: '/tasks' },
  { id: 'chats', label: 'Chats', icon: MessageSquare, kind: 'panel', viewId: 'chats' },
  { id: 'today', label: 'Today', icon: Sunrise, kind: 'panel', viewId: 'today' },
  { id: 'data', label: 'Data', icon: Database, kind: 'panel', viewId: 'data' },
  { id: 'ai', label: 'AI', icon: Sparkles, kind: 'panel', viewId: 'ai-chat' },
  { id: 'crm', label: 'People', icon: Contact, kind: 'route', to: '/crm' },
  { id: 'discover', label: 'Discover', icon: Compass, kind: 'route', to: '/discover' },
  { id: 'meetings', label: 'Meetings', icon: Mic, kind: 'route', to: '/meetings' },
  { id: 'finance', label: 'Finance', icon: Wallet, kind: 'route', to: '/finance' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, kind: 'route', to: '/analytics' }
]

const BY_ID = new Map(SURFACES.map((surface) => [surface.id, surface]))

export function surfaceById(id: string): SurfaceDef | undefined {
  return BY_ID.get(id)
}

/** Resolve `navPinned` ids to defs, dropping any unknown (stale) ids. */
export function pinnedSurfaces(navPinned: string[]): SurfaceDef[] {
  return navPinned.map((id) => BY_ID.get(id)).filter((s): s is SurfaceDef => Boolean(s))
}

/** The default panel surface the contextual island falls back to. */
export const DEFAULT_SURFACE = 'explorer'

/**
 * The tab a surface's route opens/promotes, or null for routeless panels and
 * non-tab routes (Discover, Analytics). Lets a surface row promote its tab on
 * double-click without knowing the node model.
 */
export function surfaceTabId(surface: SurfaceDef): string | null {
  if (!surface.to) return null
  return tabIdForRoute(surface.to)
}

/**
 * Activating a surface: a **panel** drives the contextual bottom island
 * (`activeSurface`); a surface with a **route** opens it in the editor as a
 * VS Code-style preview tab (0288) — a single click renders it italic and the
 * next single-click open replaces it; double-clicking the row (or editing)
 * promotes it. A panel surface that also carries a route (Tasks) does both.
 * Pure so the decision is testable; the hook below wires the side-effecting
 * deps.
 */
export function activateSurface(
  surface: SurfaceDef,
  deps: { navigate: (opts: { to: string }) => void; setActiveSurface: (id: string) => void }
): void {
  if (surface.kind === 'panel') deps.setActiveSurface(surface.id)
  if (surface.to) {
    // Only tab routes honour the preview latch; arming it for a non-tab route
    // (Discover, Analytics, Inbox) would leave it set for the next navigation.
    if (tabIdForRoute(surface.to)) setPreviewIntent()
    deps.navigate({ to: surface.to })
  }
}

/**
 * Shared by the sidebar primary rows and the surfaces roll-out so both roads
 * agree. Returns the single-click handler; double-click promote lives in the
 * render sites (they call {@link surfaceTabId} + the store's `promoteTab`).
 */
export function useSurfaceActivation(): (surface: SurfaceDef) => void {
  const navigate = useNavigate()
  const setActiveSurface = useWorkbench((state) => state.setActiveSurface)
  return useCallback(
    (surface: SurfaceDef) => {
      activateSurface(surface, { navigate: (opts) => void navigate(opts), setActiveSurface })
    },
    [navigate, setActiveSurface]
  )
}
