/**
 * Tab ↔ route ↔ view mapping (exploration 0166).
 *
 * Everything that opens in the editor area is a tab backed by a node
 * (or a singleton surface like Tasks). The router stays authoritative:
 * navigating to a route activates (or opens) its tab, so deep links,
 * back/forward, and old bookmarks keep working.
 */
import type { TabNodeType } from './state'
import {
  CheckSquare2,
  Database,
  FileText,
  Layout,
  LayoutDashboard,
  Network,
  Table2,
  type LucideIcon
} from 'lucide-react'

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
  savedview: { label: 'Saved view', icon: Table2, toRoute: (id) => `/view/${id}` },
  tasks: { label: 'Tasks', icon: CheckSquare2, toRoute: () => '/tasks', singleton: true },
  data: { label: 'Data', icon: Network, toRoute: () => '/data', singleton: true }
}

const ROUTE_PREFIXES: Array<{ prefix: string; nodeType: TabNodeType }> = [
  { prefix: '/doc/', nodeType: 'page' },
  { prefix: '/db/', nodeType: 'database' },
  { prefix: '/canvas/', nodeType: 'canvas' },
  { prefix: '/dashboard/', nodeType: 'dashboard' },
  { prefix: '/view/', nodeType: 'savedview' }
]

export interface RouteTabDescriptor {
  nodeType: TabNodeType
  nodeId: string
}

/** Map a pathname onto a tab descriptor; null for non-tab routes. */
export function tabFromPathname(pathname: string): RouteTabDescriptor | null {
  if (pathname === '/tasks') return { nodeType: 'tasks', nodeId: 'tasks' }
  if (pathname === '/data') return { nodeType: 'data', nodeId: 'data' }

  for (const { prefix, nodeType } of ROUTE_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      const nodeId = decodeURIComponent(pathname.slice(prefix.length))
      if (nodeId) return { nodeType, nodeId }
    }
  }

  return null
}

export function routeForTab(nodeType: TabNodeType, nodeId: string): string {
  return TAB_VIEWS[nodeType].toRoute(nodeId)
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
