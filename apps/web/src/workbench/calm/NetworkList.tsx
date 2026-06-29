/**
 * NetworkList — the calm shell's Network-mode list (exploration 0250).
 *
 * A calm vertical nav over xNet's people + social surfaces. Each entry deep
 * links to the existing route, so the surface renders the real view; the
 * Requests entry carries the same pending-contact badge the workbench rail
 * shows. No infinite feed here — destinations only (humane charter, 0234).
 */
import { Link, useLocation } from '@tanstack/react-router'
import { Compass, MessageSquare, UserPlus, Users, type LucideIcon } from 'lucide-react'
import { useRequestCount } from '../../hooks/useRequestCount'

interface NetworkDestination {
  to: string
  label: string
  hint: string
  icon: LucideIcon
}

const DESTINATIONS: NetworkDestination[] = [
  { to: '/discover', label: 'Discover', hint: 'Find people by shared interests', icon: Compass },
  { to: '/requests', label: 'Requests', hint: 'Pending connections', icon: UserPlus },
  { to: '/crm', label: 'Contacts', hint: 'Your relationships', icon: Users },
  { to: '/channel/general', label: 'Channels', hint: 'Conversations & rooms', icon: MessageSquare }
]

export function NetworkList() {
  const { pathname } = useLocation()
  const requestCount = useRequestCount()

  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
      <h2 className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wider text-ink-3">
        Network
      </h2>
      {DESTINATIONS.map((dest) => {
        const active =
          pathname === dest.to ||
          pathname.startsWith(`${dest.to.split('/').slice(0, 2).join('/')}/`)
        const badge = dest.to === '/requests' ? requestCount : 0
        return (
          <Link
            key={dest.to}
            to={dest.to}
            className={`flex items-center gap-2.5 rounded-lg px-2 py-2 no-underline transition-colors hover:no-underline ${
              active ? 'bg-surface-2 text-ink-1' : 'text-ink-2 hover:bg-surface-2/60'
            }`}
          >
            <dest.icon size={16} strokeWidth={1.5} className="shrink-0 text-ink-3" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-medium">{dest.label}</span>
              <span className="truncate text-[11px] text-ink-3">{dest.hint}</span>
            </span>
            {badge > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-ink px-1 text-[9px] font-semibold text-surface-0">
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
