/**
 * User sections (exploration 0353) — the successor to `SURFACES` +
 * `navPinned` + the "More" roll-out.
 *
 * The old model made every feature area mint a nav: twelve surfaces,
 * each either a bespoke panel or a route, with their own switcher. That
 * is the Microsoft Teams anti-pattern in miniature (a rail of apps, each
 * with its own internal navigation).
 *
 * Here there is exactly one nav — the tree — and sections are just
 * *entries the user curates* pointing at three things:
 *
 * - `lens`  — a projection of the one tree (Docs, Chats, People, …)
 * - `route` — a destination that isn't a node list (Inbox, Meetings…)
 * - `node`  — a pinned node (any row the user promoted)
 *
 * Per-user and reorderable, following Slack's custom-sections and
 * Linear's personalized-sidebar precedent: each person chooses their
 * own unification boundary rather than the app choosing for them.
 */
import {
  BarChart3,
  Bot,
  CheckSquare2,
  Compass,
  Contact,
  Database,
  Files,
  Inbox,
  MessageSquare,
  Mic,
  Sunrise,
  Wallet,
  type LucideIcon
} from 'lucide-react'

export type SidebarSectionKind = 'lens' | 'route' | 'node'

export interface SidebarSection {
  /** Stable id — persisted in the user's section order. */
  id: string
  kind: SidebarSectionKind
  label: string
  /** Lens id, route path, or node id, per `kind`. */
  target: string
  /** Live count source for the trailing badge. */
  badge?: 'requests'
  /** Emphasised (ink pill) rather than muted-mono count. */
  emphasis?: boolean
}

const ICONS: Record<string, LucideIcon> = {
  'lens:all': Files,
  'lens:docs': Files,
  'lens:chats': MessageSquare,
  'lens:people': Contact,
  'lens:views': Database,
  'route:/requests': Inbox,
  'route:/tasks': CheckSquare2,
  'route:/today': Sunrise,
  'route:/meetings': Mic,
  'route:/discover': Compass,
  'route:/finance': Wallet,
  'route:/analytics': BarChart3,
  'route:/ai': Bot,
  'route:/crm': Contact
}

export function sectionIcon(section: SidebarSection): LucideIcon {
  return ICONS[`${section.kind}:${section.target}`] ?? Files
}

/**
 * The default sections a new identity gets. Everything that used to be
 * a bespoke panel is now a lens; everything that was a route surface is
 * a route entry — one grammar, no panel/route fork.
 */
export const DEFAULT_SECTIONS: SidebarSection[] = [
  { id: 'all', kind: 'lens', label: 'All', target: 'all' },
  { id: 'docs', kind: 'lens', label: 'Docs', target: 'docs' },
  { id: 'chats', kind: 'lens', label: 'Chats', target: 'chats' },
  {
    id: 'inbox',
    kind: 'route',
    label: 'Inbox',
    target: '/requests',
    badge: 'requests',
    emphasis: true
  },
  { id: 'tasks', kind: 'route', label: 'Tasks', target: '/tasks' },
  { id: 'people', kind: 'lens', label: 'People', target: 'people' },
  { id: 'views', kind: 'lens', label: 'Views', target: 'views' },
  // The BYO-model chat surface (0174/0192). It was a `panel` surface, a kind
  // this list doesn't have, so 0353 dropped it and left it unreachable —
  // restored as a route (0388).
  { id: 'ai', kind: 'route', label: 'AI', target: '/ai' },
  { id: 'meetings', kind: 'route', label: 'Meetings', target: '/meetings' },
  { id: 'discover', kind: 'route', label: 'Discover', target: '/discover' },
  { id: 'finance', kind: 'route', label: 'Finance', target: '/finance' },
  { id: 'analytics', kind: 'route', label: 'Analytics', target: '/analytics' }
]

/** Section ids shown as primary rows for a fresh identity. */
export const DEFAULT_PINNED_SECTION_IDS = ['all', 'docs', 'chats', 'inbox']

/**
 * Resolve a persisted order against the known defaults: unknown ids are
 * dropped (a section removed by a later build must not crash the shell,
 * the 0280 migration lesson) and new defaults append.
 */
export function resolveSections(order: string[]): SidebarSection[] {
  const byId = new Map(DEFAULT_SECTIONS.map((section) => [section.id, section]))
  const ordered = order
    .map((id) => byId.get(id))
    .filter((section): section is SidebarSection => Boolean(section))
  const seen = new Set(ordered.map((section) => section.id))
  return [...ordered, ...DEFAULT_SECTIONS.filter((section) => !seen.has(section.id))]
}
