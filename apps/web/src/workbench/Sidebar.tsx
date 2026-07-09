/**
 * Sidebar — the one shell's primary navigation (exploration 0284).
 *
 * Replaces the icon-only Rail and the calm ModeSwitch with a single
 * sectioned, labeled sidebar that surfaces *every* tool and destination —
 * the fix for "features are hidden unless you're in the workbench view."
 * It collapses to a 48px icon rail (the Notion/Linear hover-peek pattern);
 * the collapsed width is persisted. Tool views (Explorer, Chats, Tasks,
 * Today, Data, AI) toggle the left dock; the rest navigate the surface.
 */
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { getCommandRegistry } from '@xnetjs/plugins'
import { useIdentity } from '@xnetjs/react'
import {
  BarChart3,
  CheckSquare2,
  Compass,
  Contact,
  Files,
  Layers,
  Maximize2,
  MessageSquare,
  Mic,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Puzzle,
  Search,
  Settings,
  Sparkles,
  Sunrise,
  UserPlus,
  Wallet,
  type LucideIcon
} from 'lucide-react'
import { useRequestCount } from '../hooks/useRequestCount'
import { useWorkbenchContributions } from './contributions'
import { useWorkbench } from './state'

type Section = 'Workspace' | 'Tools' | 'People' | 'More'

interface PanelNavItem {
  kind: 'panel'
  id: string
  label: string
  icon: LucideIcon
  section: Section
}

interface RouteNavItem {
  kind: 'route'
  to: string
  label: string
  icon: LucideIcon
  section: Section
  badge?: 'requests'
}

/** Views that open in the left dock (they own their own panel bodies). */
const PANEL_ITEMS: PanelNavItem[] = [
  { kind: 'panel', id: 'explorer', label: 'Explorer', icon: Files, section: 'Workspace' },
  { kind: 'panel', id: 'chats', label: 'Chats', icon: MessageSquare, section: 'Tools' },
  { kind: 'panel', id: 'tasks', label: 'Tasks', icon: CheckSquare2, section: 'Tools' },
  { kind: 'panel', id: 'today', label: 'Today', icon: Sunrise, section: 'Tools' },
  { kind: 'panel', id: 'data', label: 'Data', icon: Network, section: 'Tools' },
  { kind: 'panel', id: 'ai-chat', label: 'AI', icon: Sparkles, section: 'Tools' }
]

/**
 * Destinations that navigate the surface — including the routes that had
 * *no* nav affordance in any former mode (Meetings, Finance, Analytics).
 */
const ROUTE_ITEMS: RouteNavItem[] = [
  { kind: 'route', to: '/crm', label: 'CRM', icon: Contact, section: 'People' },
  { kind: 'route', to: '/discover', label: 'Discover people', icon: Compass, section: 'People' },
  {
    kind: 'route',
    to: '/requests',
    label: 'Requests',
    icon: UserPlus,
    section: 'People',
    badge: 'requests'
  },
  { kind: 'route', to: '/meetings', label: 'Meetings', icon: Mic, section: 'More' },
  { kind: 'route', to: '/finance', label: 'Finance', icon: Wallet, section: 'More' },
  { kind: 'route', to: '/analytics', label: 'Analytics', icon: BarChart3, section: 'More' }
]

const SECTION_ORDER: Section[] = ['Workspace', 'Tools', 'People', 'More']

function NavRow({
  label,
  icon: Icon,
  active,
  badge,
  collapsed,
  onClick
}: {
  label: string
  icon: LucideIcon
  active?: boolean
  badge?: number
  collapsed: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={collapsed ? label : undefined}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={`relative flex h-8 w-full items-center gap-2.5 rounded-md border-none bg-transparent px-2 text-left text-[13px] cursor-pointer transition-colors ${
        collapsed ? 'justify-center' : ''
      } ${active ? 'bg-surface-2 text-ink-1' : 'text-ink-2 hover:bg-surface-2 hover:text-ink-1'}`}
    >
      {active && collapsed && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent-ink" />
      )}
      <Icon size={16} strokeWidth={1.5} className="shrink-0" />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {badge !== undefined && badge > 0 && (
        <span
          className={`flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-ink px-1 text-[9px] font-semibold leading-none text-surface-0 ${
            collapsed ? 'absolute right-1 top-1' : ''
          }`}
        >
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  )
}

function SectionLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) return <div className="my-1 h-px w-6 self-center bg-hairline" />
  return (
    <div className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-3">
      {label}
    </div>
  )
}

export function Sidebar() {
  const left = useWorkbench((state) => state.left)
  const showPanelView = useWorkbench((state) => state.showPanelView)
  const collapsed = useWorkbench((state) => state.sidebarCollapsed)
  const toggleSidebar = useWorkbench((state) => state.toggleSidebar)
  const toggleFocus = useWorkbench((state) => state.toggleFocus)
  const { identity } = useIdentity()
  const navigate = useNavigate()
  const { railItems } = useWorkbenchContributions()
  const requestCount = useRequestCount()
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  const panelActive = (id: string) => left.open && left.activeViewId === id
  const routeActive = (to: string) => pathname === to || pathname.startsWith(`${to}/`)

  return (
    <nav
      data-sidebar-collapsed={collapsed || undefined}
      className={`flex shrink-0 flex-col border-r border-hairline bg-surface-1 py-1.5 transition-[width] duration-normal ease-out ${
        collapsed ? 'w-[var(--rail-width)] items-center px-1' : 'w-60 px-2'
      }`}
    >
      {/* Header: collapse toggle + search */}
      <div className={`flex items-center ${collapsed ? 'flex-col gap-1' : 'gap-1'}`}>
        <button
          type="button"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={toggleSidebar}
          className="flex h-8 w-8 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-1"
        >
          {collapsed ? (
            <PanelLeftOpen size={16} strokeWidth={1.5} />
          ) : (
            <PanelLeftClose size={16} strokeWidth={1.5} />
          )}
        </button>
        <button
          type="button"
          title="Search (⌘K)"
          aria-label="Search"
          onClick={() => void getCommandRegistry().runCommand('search.open')}
          className={`flex h-8 items-center gap-2 rounded-md text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink-1 ${
            collapsed ? 'w-8 justify-center' : 'flex-1 px-2'
          }`}
        >
          <Search size={16} strokeWidth={1.5} className="shrink-0" />
          {!collapsed && <span className="flex-1 text-left text-[13px]">Search</span>}
          {!collapsed && <span className="text-[11px] text-ink-3">⌘K</span>}
        </button>
      </div>

      {/* Sections */}
      <div className="mt-1 flex min-h-0 flex-1 flex-col overflow-y-auto">
        {SECTION_ORDER.map((section) => {
          const panels = PANEL_ITEMS.filter((item) => item.section === section)
          const routes = ROUTE_ITEMS.filter((item) => item.section === section)
          if (panels.length === 0 && routes.length === 0) return null
          return (
            <div key={section} className="flex flex-col">
              <SectionLabel label={section} collapsed={collapsed} />
              {panels.map((item) => (
                <NavRow
                  key={item.id}
                  label={item.label}
                  icon={item.icon}
                  collapsed={collapsed}
                  active={panelActive(item.id)}
                  onClick={() => showPanelView('left', item.id)}
                />
              ))}
              {routes.map((item) => (
                <NavRow
                  key={item.to}
                  label={item.label}
                  icon={item.icon}
                  collapsed={collapsed}
                  active={routeActive(item.to)}
                  badge={item.badge === 'requests' ? requestCount : undefined}
                  onClick={() => void navigate({ to: item.to })}
                />
              ))}
            </div>
          )
        })}

        {/* Plugin-contributed items (0213) */}
        {railItems.length > 0 && (
          <div className="flex flex-col">
            <SectionLabel label="Extensions" collapsed={collapsed} />
            {railItems.map((item) => {
              const Icon = (typeof item.icon === 'string' ? Puzzle : item.icon) as LucideIcon
              const viewId = `plugin:${item.id}`
              return (
                <NavRow
                  key={viewId}
                  label={item.name}
                  icon={Icon}
                  collapsed={collapsed}
                  active={item.panel ? panelActive(viewId) : false}
                  onClick={() => {
                    if (item.panel) {
                      showPanelView('left', viewId)
                    } else if (typeof item.action === 'string') {
                      void navigate({ to: item.action as never })
                    } else {
                      item.action()
                    }
                  }}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Footer: focus, workspaces, identity, settings */}
      <div className="mt-1 flex flex-col gap-0.5 border-t border-hairline pt-1.5">
        <NavRow label="Focus mode" icon={Maximize2} collapsed={collapsed} onClick={toggleFocus} />
        <NavRow
          label="Workspaces"
          icon={Layers}
          collapsed={collapsed}
          onClick={() => void getCommandRegistry().runCommand('workspace.switch')}
        />
        <Link
          to="/settings"
          title="Settings"
          aria-label="Settings"
          className={`flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-ink-2 no-underline transition-colors hover:bg-surface-2 hover:text-ink-1 hover:no-underline ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <Settings size={16} strokeWidth={1.5} className="shrink-0" />
          {!collapsed && <span className="min-w-0 flex-1 truncate">Settings</span>}
          {!collapsed && identity && (
            <span
              title={identity.did}
              className="flex h-5 w-5 items-center justify-center rounded-full border border-hairline bg-surface-2 font-mono text-[9px] text-ink-2"
            >
              {identity.did
                .replace(/^did:[a-z]+:/, '')
                .slice(0, 2)
                .toUpperCase()}
            </span>
          )}
        </Link>
      </div>
    </nav>
  )
}
