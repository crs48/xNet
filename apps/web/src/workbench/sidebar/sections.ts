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
  FlaskConical,
  Import,
  Inbox,
  MessageSquare,
  Mic,
  Sparkles,
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
  'route:/meetings': Mic,
  'route:/discover': Compass,
  'route:/finance': Wallet,
  'route:/analytics': BarChart3,
  'route:/ai': Bot,
  'route:/companion': Sparkles,
  'route:/experiments': FlaskConical,
  'route:/social-import': Import
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
  { id: 'companion', kind: 'route', label: 'Companion', target: '/companion' },
  { id: 'experiments', kind: 'route', label: 'Experiments', target: '/experiments' },
  { id: 'social-import', kind: 'route', label: 'Import', target: '/social-import' },
  { id: 'analytics', kind: 'route', label: 'Analytics', target: '/analytics' }
]

/**
 * Whether a section is available in this build (exploration 0388).
 *
 * A nav row that always dead-ends is worse than a missing one: it teaches
 * people the nav lies. Analytics renders "this surface is off by default"
 * unless the telemetry dashboard is compiled in, so it is absent rather than
 * dead when the flag is unset — the UI restatement of the CI-lane rule that a
 * gate nobody can pass is worse than no gate.
 */
export function isSectionEnabled(section: SidebarSection): boolean {
  if (section.id !== 'analytics') return true
  const env = (import.meta as { env?: Record<string, unknown> }).env
  return env?.VITE_TELEMETRY_DASHBOARD === '1' || env?.VITE_TELEMETRY_DASHBOARD === 'true'
}

/** Section ids shown as primary rows for a fresh identity. */
export const DEFAULT_PINNED_SECTION_IDS = ['all', 'docs', 'chats', 'inbox']

/**
 * Resolve a persisted order against the known defaults: unknown ids are
 * dropped (a section removed by a later build must not crash the shell,
 * the 0280 migration lesson) and new defaults append.
 */
export function resolveSections(order: string[]): SidebarSection[] {
  const available = DEFAULT_SECTIONS.filter(isSectionEnabled)
  const byId = new Map(available.map((section) => [section.id, section]))
  const ordered = order
    .map((id) => byId.get(id))
    .filter((section): section is SidebarSection => Boolean(section))
  const seen = new Set(ordered.map((section) => section.id))
  return [...ordered, ...available.filter((section) => !seen.has(section.id))]
}

/**
 * Where a section sends the main area (exploration 0388).
 *
 * The one rule this nav is held to: **every primary row changes the main
 * area**. Lens sections resolve through the registered lens's `route`, so the
 * destination lives with the lens rather than in a switch here.
 */
export function sectionDestination(
  section: SidebarSection,
  lensRoute: (lensId: string) => string | undefined
): string | undefined {
  if (section.kind === 'lens') return lensRoute(section.target)
  if (section.kind === 'route') return section.target
  return undefined
}

/**
 * Whether a section is the one the user is currently looking at.
 *
 * Derived from the **route** first, so the sidebar and the main area can never
 * disagree — the pre-0388 predicate compared only `activeLensId`, which left
 * "Views" highlighted while the main area showed Meetings, and highlighted
 * nothing at all when the active lens wasn't pinned.
 *
 * Lenses sharing a route (the three home lenses on `/`) additionally require
 * the lens to match; a lens with its own route (`people` → `/crm`) is active
 * on that route regardless, so a reload lands with the right row lit.
 */
export function isSectionActive({
  section,
  pathname,
  activeLensId,
  lensRoute
}: {
  section: SidebarSection
  pathname: string
  activeLensId: string
  lensRoute: (lensId: string) => string | undefined
}): boolean {
  const destination = sectionDestination(section, lensRoute)
  if (!destination) return false

  const onRoute =
    destination === '/'
      ? pathname === '/'
      : pathname === destination || pathname.startsWith(`${destination}/`)
  if (!onRoute) return false

  if (section.kind !== 'lens') {
    // A route section loses the highlight to a lens that owns this exact
    // route (People owns /crm), so only one row is ever lit.
    return !lensOwningRoute(destination, lensRoute)
  }

  const owner = lensOwningRoute(destination, lensRoute)
  return owner ? owner === section.target : section.target === activeLensId
}

/**
 * The lens that exclusively owns a route, if exactly one does. Shared routes
 * (`/`) have no owner — there the active lens decides.
 */
function lensOwningRoute(
  route: string,
  lensRoute: (lensId: string) => string | undefined
): string | undefined {
  const owners = LENS_SECTION_IDS.filter((id) => lensRoute(id) === route)
  return owners.length === 1 ? owners[0] : undefined
}

/** Lens ids that ship as sections — the candidates for route ownership. */
const LENS_SECTION_IDS = DEFAULT_SECTIONS.filter((section) => section.kind === 'lens').map(
  (section) => section.target
)

/**
 * The lens a route restores on load, when the route belongs to exactly one
 * lens. `/crm` → `people`, `/data` → `views`; `/` keeps whatever lens the user
 * last chose.
 */
export function lensForRoute(
  pathname: string,
  lensRoute: (lensId: string) => string | undefined
): string | undefined {
  return LENS_SECTION_IDS.find((id) => {
    const route = lensRoute(id)
    return route && route !== '/' && (pathname === route || pathname.startsWith(`${route}/`))
  })
}
