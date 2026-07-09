/**
 * DevToolsIsland — the dev-tools toggle docked beside the status bar (0287).
 *
 * A small 32×32 wrench island to the right of the status-bar island; clicking it
 * toggles the `@xnetjs/devtools` panel (same as ⌘⇧D). It replaces the floating
 * draggable FAB (hidden via `hideFab`). Only mounted when devtools is available
 * (FloatingFrame gates on `useDevTools().available`).
 */
import { useDevTools } from '@xnetjs/devtools'
import { Wrench } from 'lucide-react'

export function DevToolsIsland() {
  const dt = useDevTools()
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
  const shortcut = isMac ? '⌘⇧D' : 'Ctrl+Shift+D'

  return (
    <button
      type="button"
      onClick={dt.toggle}
      title={`Toggle developer tools (${shortcut})`}
      aria-label="Toggle developer tools"
      aria-pressed={dt.isOpen}
      className={`flex h-8 w-8 flex-none items-center justify-center rounded-[14px] border border-hairline shadow-isl transition-colors cursor-pointer ${
        dt.isOpen ? 'bg-accent text-ink-1' : 'bg-island-b text-ink-2 hover:text-ink-1'
      }`}
    >
      <Wrench size={16} strokeWidth={1.75} />
    </button>
  )
}
