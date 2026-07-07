/**
 * ModeSwitch — the calm shell's primary navigation (exploration 0250).
 *
 * Replaces the workbench's twelve-icon Rail with three calm, labelled modes
 * (Companion · Workspace · Network) plus Search at the top and identity +
 * Settings at the bottom. Choosing a mode navigates to that mode's home and
 * sets it active; the active mode is also derived from the route so deep links
 * and back/forward keep the switch honest. Everything else lives one ⌘K away.
 */
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { getCommandRegistry } from '@xnetjs/plugins'
import { useIdentity } from '@xnetjs/react'
import { Layers, Search, Settings, type LucideIcon } from 'lucide-react'
import { useWorkbench } from '../state'
import { CALM_MODES, modeForPath } from './modes'

function ModeButton({
  label,
  icon: Icon,
  active,
  onClick
}: {
  label: string
  icon: LucideIcon
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={`relative flex w-full flex-col items-center gap-1 border-none bg-transparent py-2.5 text-[10px] font-medium tracking-tight transition-colors cursor-pointer ${
        active ? 'text-ink-1' : 'text-ink-3 hover:text-ink-1'
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent-ink" />
      )}
      <Icon size={20} strokeWidth={1.5} />
      <span>{label}</span>
    </button>
  )
}

export function ModeSwitch() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { identity } = useIdentity()
  const calmMode = useWorkbench((state) => state.calmMode)
  const setCalmMode = useWorkbench((state) => state.setCalmMode)

  // The route is authoritative; fall back to the stored mode on modeless
  // surfaces (settings/analytics) so the last real mode stays highlighted.
  const routeMode = modeForPath(pathname)
  const activeMode = routeMode ?? calmMode

  return (
    <nav className="flex w-[var(--mode-switch-width,4rem)] shrink-0 flex-col items-center border-r border-hairline bg-surface-1 py-2">
      <button
        type="button"
        title="Search (⌘K)"
        aria-label="Search"
        onClick={() => void getCommandRegistry().runCommand('search.open')}
        className="flex h-9 w-9 items-center justify-center rounded-lg border-none bg-transparent text-ink-3 transition-colors hover:text-ink-1 cursor-pointer"
      >
        <Search size={18} strokeWidth={1.5} />
      </button>

      <div className="my-2 h-px w-6 bg-hairline" />

      <div className="flex w-full flex-col gap-0.5">
        {CALM_MODES.map((mode) => (
          <ModeButton
            key={mode.id}
            label={mode.label}
            icon={mode.icon}
            active={activeMode === mode.id}
            onClick={() => {
              setCalmMode(mode.id)
              void navigate({ to: mode.home })
            }}
          />
        ))}
      </div>

      <div className="flex-1" />

      {/* Workspace switcher (0280): the pointer road to Save/Switch/Reset. */}
      <button
        type="button"
        title="Workspaces"
        aria-label="Workspaces"
        data-coach="workspace.switch"
        onClick={() => void getCommandRegistry().runCommand('workspace.switch')}
        className="mb-1 flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-ink-3 transition-colors hover:text-ink-1"
      >
        <Layers size={18} strokeWidth={1.5} />
      </button>

      {identity && (
        <div
          title={identity.did}
          className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-full border border-hairline bg-surface-2 font-mono text-[10px] text-ink-2"
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
        className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-3 no-underline transition-colors hover:text-ink-1 hover:no-underline"
      >
        <Settings size={18} strokeWidth={1.5} />
      </Link>
    </nav>
  )
}
