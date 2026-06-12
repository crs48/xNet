/**
 * Status Bar — 24px, mono type (exploration 0166).
 *
 * Left = workspace scope: sync/hub state, background jobs, runtime
 * flag. Right = view scope: items published by the active view via
 * useStatusBarItem, then the theme toggle. Ambient, glanceable,
 * never modal.
 */
import { useHubStatus } from '@xnetjs/react'
import { useTheme } from '@xnetjs/ui'
import { Moon, Sun } from 'lucide-react'
import { useWorkbenchStatus, type StatusBarItem } from './status'

const HUB_LABEL: Record<string, { label: string; tone: string }> = {
  disconnected: { label: 'offline', tone: 'bg-ink-3' },
  connecting: { label: 'connecting…', tone: 'bg-warning' },
  connected: { label: 'synced', tone: 'bg-success' },
  error: { label: 'sync error', tone: 'bg-destructive' }
}

function runtimeMode(): string {
  try {
    return localStorage.getItem('xnet:runtime') === 'worker' ? 'worker' : 'main'
  } catch {
    return 'main'
  }
}

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

export function StatusBar() {
  const hubStatus = useHubStatus()
  const items = useWorkbenchStatus((state) => state.items)
  const jobs = useWorkbenchStatus((state) => state.jobs)
  const { resolvedTheme, toggleTheme } = useTheme()

  const hub = HUB_LABEL[hubStatus] ?? HUB_LABEL.disconnected
  const itemList = Object.values(items)
  const leftItems = itemList.filter((item) => item.side === 'left')
  const rightItems = itemList.filter((item) => item.side === 'right')
  const jobList = Object.values(jobs)

  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-hairline bg-surface-2 px-3 font-mono text-[11px] text-ink-2">
      {/* Workspace scope */}
      <span className="flex items-center gap-1.5" title={`Hub: ${hubStatus}`}>
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${hub.tone}`} />
        {hub.label}
      </span>
      <span title="Data runtime (xnet:runtime)">{runtimeMode()}</span>
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
