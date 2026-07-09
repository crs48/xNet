/**
 * Status Bar — 24px, mono type (exploration 0166).
 *
 * Left = workspace scope: the sync connection cluster (chip + conditional
 * pending/integrity chips + a click-through detail popover, 0233), the
 * durable-storage indicator (0172/0287), background jobs. Right = view scope:
 * items published by the active view via useStatusBarItem, then the theme
 * toggle. Ambient, glanceable, never modal.
 */
import { useNavigate } from '@tanstack/react-router'
import { getCommandRegistry } from '@xnetjs/plugins'
import { useTheme } from '@xnetjs/ui'
import { HardDrive, Moon, Sun, Users } from 'lucide-react'
import { useSpaces } from '../hooks/useSpaces'
import { useStorageStatus } from '../hooks/useStorageStatus'
import { formatBytes } from '../lib/format-bytes'
import { WhatsNewButton } from '../whats-new/WhatsNewButton'
import { statusContributionText, useWorkbenchContributions } from './contributions'
import { navigateToNode } from './navigation'
import { useWorkbench } from './state'
import { useWorkbenchStatus, type StatusBarItem } from './status'
import { SyncStatus } from './SyncStatus'
import { NO_SPACE, isRealSpace } from './views/explorer-scope'

function StatusEntry({ item }: { item: StatusBarItem }) {
  const content = (
    <span className="truncate" title={item.title}>
      {item.text}
    </span>
  )
  if (!item.onClick) return content
  return (
    <button
      type="button"
      onClick={item.onClick}
      title={item.title}
      className="cursor-pointer border-none bg-transparent p-0 font-mono text-[11px] text-ink-2 hover:text-ink-1"
    >
      {item.text}
    </button>
  )
}

/** Ambient echo of the active workspace scope (exploration 0190). */
function ScopeStatus() {
  const navigate = useNavigate()
  const currentSpaceId = useWorkbench((state) => state.currentSpaceId)
  const filter = useWorkbench((state) => state.spaceFilter)
  const { getSpace } = useSpaces()

  if (filter.length > 1) {
    return (
      <span className="flex items-center gap-1 text-ink-2" title="Filtered to multiple workspaces">
        <Users size={11} strokeWidth={1.5} />
        {filter.length} workspaces
      </span>
    )
  }
  if (currentSpaceId === NO_SPACE) {
    return (
      <span className="text-ink-2" title="Viewing items in no workspace">
        no workspace
      </span>
    )
  }
  const space = isRealSpace(currentSpaceId) ? getSpace(currentSpaceId) : null
  if (!space) return null
  return (
    <button
      type="button"
      onClick={() => navigateToNode(navigate, 'space', space.id)}
      title={`Workspace scope: ${space.name} — open home`}
      className="flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 font-mono text-[11px] text-ink-2 hover:text-ink-1"
    >
      {space.icon ? (
        <span className="leading-none">{space.icon}</span>
      ) : (
        <Users size={11} strokeWidth={1.5} />
      )}
      <span className="max-w-32 truncate">{space.name}</span>
    </button>
  )
}

/**
 * Ambient durable-storage indicator (explorations 0172 + 0232).
 *
 * Replaces the green "Durable local storage enabled" top banner that used to
 * re-appear on every page load. Glanceable usage when storage is working; a
 * warning-toned reminder (alongside the actionable top banner) when it isn't.
 */
function StorageStatus() {
  const status = useStorageStatus()
  if (!status || status.state === 'unsupported' || typeof status.usageBytes !== 'number') {
    return null
  }
  const granted = status.state === 'granted'
  const usage = formatBytes(status.usageBytes)
  const quota = typeof status.quotaBytes === 'number' ? formatBytes(status.quotaBytes) : null
  const tooltip = granted
    ? `Durable local storage enabled — ${quota ? `${usage} of ${quota} used` : `${usage} used`}`
    : status.message
  return (
    <span className={`flex items-center gap-1 ${granted ? '' : 'text-warning'}`} title={tooltip}>
      <HardDrive size={11} strokeWidth={1.5} />
      {usage}
    </span>
  )
}

export function StatusBar({ variant = 'bar' }: { variant?: 'bar' | 'island' }) {
  const items = useWorkbenchStatus((state) => state.items)
  const jobs = useWorkbenchStatus((state) => state.jobs)
  const { resolvedTheme, toggleTheme } = useTheme()
  const { statusItems } = useWorkbenchContributions()

  const contributed = statusItems
    .slice()
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
    .map((item) => ({
      id: `contrib:${item.id}`,
      text: statusContributionText(item),
      side: item.side ?? ('left' as const),
      title: item.tooltip,
      onClick: item.command
        ? () => void getCommandRegistry().runCommand(item.command as string)
        : undefined
    }))
  const itemList = [...Object.values(items), ...contributed]
  const leftItems = itemList.filter((item) => item.side === 'left')
  const rightItems = itemList.filter((item) => item.side === 'right')
  const jobList = Object.values(jobs)

  // In the Floating shell (0286) the status bar is its own rounded island, so
  // it fills the island wrapper and drops its own top border / surface fill.
  const footerClass =
    variant === 'island'
      ? 'flex h-full w-full items-center gap-4 px-3.5 font-mono text-[11px] text-ink-2'
      : 'flex h-6 shrink-0 items-center gap-4 border-t border-hairline bg-surface-2 px-3 font-mono text-[11px] text-ink-2'

  return (
    <footer className={footerClass}>
      {/* Workspace scope */}
      <SyncStatus />
      <StorageStatus />
      <ScopeStatus />
      {jobList.map((job) => (
        <span key={job.id} className="text-ink-2" title={job.label}>
          {job.label}
          {typeof job.progress === 'number' ? ` ${Math.round(job.progress * 100)}%` : '…'}
        </span>
      ))}
      {leftItems.map((item) => (
        <StatusEntry key={item.id} item={item} />
      ))}

      <span className="flex-1" />

      {/* View scope */}
      {rightItems.map((item) => (
        <StatusEntry key={item.id} item={item} />
      ))}
      <WhatsNewButton />
      <button
        type="button"
        onClick={toggleTheme}
        title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
        aria-label="Toggle theme"
        className="flex cursor-pointer items-center border-none bg-transparent p-0 text-ink-3 hover:text-ink-1"
      >
        {resolvedTheme === 'dark' ? (
          <Sun size={12} strokeWidth={1.5} />
        ) : (
          <Moon size={12} strokeWidth={1.5} />
        )}
      </button>
    </footer>
  )
}
