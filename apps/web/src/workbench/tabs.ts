/**
 * Tab ↔ route ↔ view mapping (exploration 0166).
 *
 * Everything that opens in the editor area is a tab backed by a node
 * (or a singleton surface like Tasks). The router stays authoritative:
 * navigating to a route activates (or opens) its tab, so deep links,
 * back/forward, and old bookmarks keep working.
 */
import {
  CheckSquare2,
  Code2,
  Contact,
  Database,
  FileText,
  FlaskConical,
  Hash,
  Layout,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  Mic,
  Network,
  Settings,
  Table2,
  User,
  Users,
  Wallet,
  type LucideIcon
} from 'lucide-react'
import { tabIdFor, useWorkbench, type TabNodeType } from './state'

export interface TabViewEntry {
  label: string
  icon: LucideIcon
  toRoute: (nodeId: string) => string
  /** Singleton surfaces (tasks, data) have a fixed node id */
  singleton?: boolean
}

export const TAB_VIEWS: Record<TabNodeType, TabViewEntry> = {
  page: { label: 'Page', icon: FileText, toRoute: (id) => `/doc/${id}` },
  database: { label: 'Database', icon: Database, toRoute: (id) => `/db/${id}` },
  canvas: { label: 'Canvas', icon: Layout, toRoute: (id) => `/canvas/${id}` },
  dashboard: {
    label: 'Dashboard',
    icon: LayoutDashboard,
    toRoute: (id) => `/dashboard/${id}`
  },
  map: { label: 'Map', icon: MapPin, toRoute: (id) => `/map/${id}` },
  savedview: { label: 'Saved view', icon: Table2, toRoute: (id) => `/view/${id}` },
  tasks: { label: 'Tasks', icon: CheckSquare2, toRoute: () => '/tasks', singleton: true },
  meetings: { label: 'Meetings', icon: Mic, toRoute: () => '/meetings', singleton: true },
  data: { label: 'Data', icon: Network, toRoute: () => '/data', singleton: true },
  experiments: {
    label: 'Experiments',
    icon: FlaskConical,
    toRoute: () => '/experiments',
    singleton: true
  },
  crm: { label: 'CRM', icon: Contact, toRoute: () => '/crm', singleton: true },
  finance: { label: 'Finance', icon: Wallet, toRoute: () => '/finance', singleton: true },
  channel: { label: 'Channel', icon: MessageSquare, toRoute: (id) => `/channel/${id}` },
  tag: { label: 'Tag', icon: Hash, toRoute: (id) => `/tag/${id}` },
  person: { label: 'Person', icon: User, toRoute: (id) => `/person/${encodeURIComponent(id)}` },
  lab: { label: 'Lab', icon: Code2, toRoute: (id) => `/lab/${id}` },
  space: { label: 'Space', icon: Users, toRoute: (id) => `/space/${encodeURIComponent(id)}` },
  settings: { label: 'Settings', icon: Settings, toRoute: () => '/settings', singleton: true }
}

const ROUTE_PREFIXES: Array<{ prefix: string; nodeType: TabNodeType }> = [
  { prefix: '/doc/', nodeType: 'page' },
  { prefix: '/db/', nodeType: 'database' },
  { prefix: '/canvas/', nodeType: 'canvas' },
  { prefix: '/dashboard/', nodeType: 'dashboard' },
  { prefix: '/map/', nodeType: 'map' },
  { prefix: '/view/', nodeType: 'savedview' },
  { prefix: '/channel/', nodeType: 'channel' },
  { prefix: '/tag/', nodeType: 'tag' },
  { prefix: '/person/', nodeType: 'person' },
  { prefix: '/lab/', nodeType: 'lab' },
  { prefix: '/space/', nodeType: 'space' }
]

export interface RouteTabDescriptor {
  nodeType: TabNodeType
  nodeId: string
}

/** Map a pathname onto a tab descriptor; null for non-tab routes. */
export function tabFromPathname(pathname: string): RouteTabDescriptor | null {
  if (pathname === '/tasks') return { nodeType: 'tasks', nodeId: 'tasks' }
  if (pathname === '/meetings') return { nodeType: 'meetings', nodeId: 'meetings' }
  if (pathname === '/data') return { nodeType: 'data', nodeId: 'data' }
  if (pathname === '/experiments') return { nodeType: 'experiments', nodeId: 'experiments' }
  if (pathname === '/crm') return { nodeType: 'crm', nodeId: 'crm' }
  if (pathname === '/finance') return { nodeType: 'finance', nodeId: 'finance' }
  // Settings is a singleton tab; its `?section=` search param is ignored here so
  // switching sections stays on the one tab (0288).
  if (pathname === '/settings') return { nodeType: 'settings', nodeId: 'settings' }

  for (const { prefix, nodeType } of ROUTE_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      const nodeId = decodeURIComponent(pathname.slice(prefix.length))
      if (nodeId) return { nodeType, nodeId }
    }
  }

  return null
}

export function routeForTab(nodeType: TabNodeType, nodeId: string): string {
  // Defensive: an unknown persisted nodeType routes home instead of crashing.
  return TAB_VIEWS[nodeType]?.toRoute(nodeId) ?? '/'
}

/**
 * The tab id a pathname maps to, or null for non-tab routes — lets a
 * click source that only knows a route (surface rows, menu links) resolve
 * the tab to promote on double-click.
 */
export function tabIdForRoute(pathname: string): string | null {
  const descriptor = tabFromPathname(pathname)
  return descriptor ? tabIdFor(descriptor.nodeType, descriptor.nodeId) : null
}

/**
 * Preview intent — set by single-click sources (explorer, palette)
 * just before they navigate, consumed by the route→tab sync. Deep
 * links, back/forward and command navigation open permanent tabs.
 */
let previewIntent = false

export function setPreviewIntent(): void {
  previewIntent = true
}

export function consumePreviewIntent(): boolean {
  const value = previewIntent
  previewIntent = false
  return value
}

/**
 * Open-or-activate the tab matching a pathname (router → store).
 * Returns silently for non-tab routes.
 */
export function syncRouteToTabs(pathname: string): void {
  const descriptor = tabFromPathname(pathname)
  if (!descriptor) {
    // Non-tab route: drop any pending preview intent so a source that armed it
    // before navigating somewhere untabbed can't leak it onto the next open.
    consumePreviewIntent()
    return
  }

  const tabId = tabIdFor(descriptor.nodeType, descriptor.nodeId)
  const state = useWorkbench.getState()
  const owner = state.groups.find((group) => group.tabs.some((tab) => tab.id === tabId))

  if (owner) {
    consumePreviewIntent()
    state.activateTab(tabId, owner.id)
  } else {
    state.openTab({
      nodeId: descriptor.nodeId,
      nodeType: descriptor.nodeType,
      preview: consumePreviewIntent()
    })
  }

  const tab = useWorkbench
    .getState()
    .groups.flatMap((group) => group.tabs)
    .find((entry) => entry.id === tabId)
  state.touchRecent({
    nodeId: descriptor.nodeId,
    nodeType: descriptor.nodeType,
    title: tab?.title ?? ''
  })
}
