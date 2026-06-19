/**
 * Rail — the 44px icon strip (exploration 0166).
 *
 * Top: Search (opens the palette), then the left-panel views
 * (Explorer, Tasks, Data) plus contributed rail items. Bottom:
 * identity avatar and settings. Clicking the active item toggles the
 * Left Panel — the VS Code muscle memory.
 */
import { Link, useNavigate } from '@tanstack/react-router'
import { getCommandRegistry } from '@xnetjs/plugins'
import { useIdentity } from '@xnetjs/react'
import {
  CheckSquare2,
  Compass,
  Contact,
  Files,
  MessageSquare,
  Network,
  Puzzle,
  Search,
  Settings,
  Sparkles,
  Sunrise,
  UserPlus,
  type LucideIcon
} from 'lucide-react'
import { useRequestCount } from '../hooks/useRequestCount'
import { useWorkbenchContributions } from './contributions'
import { useWorkbench } from './state'

interface RailViewItem {
  id: string
  label: string
  icon: LucideIcon
}

const LEFT_VIEW_ITEMS: RailViewItem[] = [
  { id: 'explorer', label: 'Explorer', icon: Files },
  { id: 'chats', label: 'Chats', icon: MessageSquare },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare2 },
  { id: 'today', label: 'Today', icon: Sunrise },
  { id: 'data', label: 'Data', icon: Network },
  { id: 'ai-chat', label: 'AI', icon: Sparkles }
]

function RailButton({
  label,
  icon: Icon,
  active,
  badge,
  onClick,
  coachId
}: {
  label: string
  icon: LucideIcon
  active?: boolean
  badge?: number
  onClick: () => void
  /** Stable anchor id for first-run coachmarks (exploration 0206). */
  coachId?: string
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      data-coach={coachId}
      onClick={onClick}
      className={`relative flex h-10 w-full items-center justify-center border-none bg-transparent cursor-pointer transition-colors ${
        active ? 'text-ink-1' : 'text-ink-3 hover:text-ink-1'
      }`}
    >
      {active && <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-accent-ink" />}
      <Icon size={17} strokeWidth={1.5} />
      {badge !== undefined && badge > 0 && (
        <span className="absolute right-1.5 top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent-ink px-1 text-[8px] font-semibold leading-none text-surface-0">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  )
}

export function Rail() {
  const left = useWorkbench((state) => state.left)
  const showPanelView = useWorkbench((state) => state.showPanelView)
  const { identity } = useIdentity()
  const navigate = useNavigate()
  const { railItems } = useWorkbenchContributions()
  const requestCount = useRequestCount()

  return (
    <nav className="flex w-11 shrink-0 flex-col items-center border-r border-hairline bg-surface-1 py-1">
      <RailButton
        label="Search (⌘K)"
        icon={Search}
        coachId="rail.search"
        onClick={() => void getCommandRegistry().runCommand('search.open')}
      />

      <div className="my-1 h-px w-5 bg-hairline" />

      {LEFT_VIEW_ITEMS.map((item) => (
        <RailButton
          key={item.id}
          label={item.label}
          icon={item.icon}
          coachId={`rail.${item.id}`}
          active={left.open && left.activeViewId === item.id}
          onClick={() => showPanelView('left', item.id)}
        />
      ))}

      <div className="my-1 h-px w-5 bg-hairline" />

      <RailButton
        label="CRM"
        icon={Contact}
        coachId="rail.crm"
        onClick={() => void navigate({ to: '/crm' })}
      />

      <RailButton
        label="Discover people"
        icon={Compass}
        coachId="rail.discover"
        onClick={() => void navigate({ to: '/discover' })}
      />

      <RailButton
        label="Requests"
        icon={UserPlus}
        badge={requestCount}
        onClick={() => void navigate({ to: '/requests' })}
      />

      {railItems.length > 0 && <div className="my-1 h-px w-5 bg-hairline" />}
      {railItems.map((item) => {
        const Icon = typeof item.icon === 'string' ? Puzzle : item.icon
        const viewId = `plugin:${item.id}`
        return (
          <RailButton
            key={viewId}
            label={item.name}
            icon={Icon as LucideIcon}
            active={item.panel ? left.open && left.activeViewId === viewId : false}
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

      <div className="flex-1" />

      {identity && (
        <div
          title={identity.did}
          className="mb-1 flex h-6 w-6 items-center justify-center rounded-full border border-hairline bg-surface-2 font-mono text-[10px] text-ink-2"
        >
          {identity.did
            .replace(/^did:[a-z]+:/, '')
            .slice(0, 2)
            .toUpperCase()}
        </div>
      )}
      <Link
        to="/settings"
        title="Settings"
        aria-label="Settings"
        className="flex h-10 w-full items-center justify-center text-ink-3 no-underline transition-colors hover:text-ink-1 hover:no-underline"
      >
        <Settings size={17} strokeWidth={1.5} />
      </Link>
    </nav>
  )
}
