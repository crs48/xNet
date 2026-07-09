/**
 * DevToolsIsland — the dev-tools launcher docked beside the status bar (0287).
 *
 * When the dev build is active (`import.meta.env.DEV` — the FloatingFrame gates
 * on this so production tree-shakes it out and never mounts the hook), a small
 * 32×32 wrench island sits to the right of the status-bar island. Clicking it
 * opens an upward popover of quick entries into the real `@xnetjs/devtools`
 * panels; it replaces the floating draggable FAB (hidden via `hideFab`).
 */
import { useNavigate } from '@tanstack/react-router'
import { useDevTools } from '@xnetjs/devtools'
import { Database, Flag, GitBranch, TerminalSquare, Wrench } from 'lucide-react'
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const row =
  'flex w-full items-center gap-2.5 rounded-lg border-none bg-transparent px-2 py-1.5 text-left text-[13px] text-ink-1 transition-colors hover:bg-accent cursor-pointer'

export function DevToolsIsland() {
  const dt = useDevTools()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  const toggleMenu = () => {
    if (open) {
      setOpen(false)
      return
    }
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) setPos({ left: Math.max(10, rect.right - 240), top: rect.top - 8 })
    setOpen(true)
  }

  const openPanel = (panel: 'queries' | 'schemas' | 'sync') => {
    dt.setActivePanel(panel)
    if (!dt.isOpen) dt.toggle()
    setOpen(false)
  }

  const active = open || dt.isOpen

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggleMenu}
        title="Developer tools"
        aria-label="Developer tools"
        className={`flex h-8 w-8 flex-none items-center justify-center rounded-[14px] border border-hairline shadow-isl transition-colors cursor-pointer ${
          active ? 'bg-accent text-ink-1' : 'bg-island-b text-ink-2 hover:text-ink-1'
        }`}
      >
        <Wrench size={16} strokeWidth={1.75} />
      </button>

      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div
              className="fixed z-50 w-60 rounded-xl border border-hairline bg-popover p-1.5 text-popover-foreground shadow-pop"
              style={{ left: pos.left, top: pos.top, transform: 'translateY(-100%)' }}
            >
              <div className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                Developer tools
              </div>
              <button type="button" className={row} onClick={() => openPanel('queries')}>
                <TerminalSquare size={16} strokeWidth={1.75} className="text-ink-3" />
                Query console
                <span className="ml-auto font-mono text-[11px] text-ink-3">⌘J</span>
              </button>
              <button type="button" className={row} onClick={() => openPanel('schemas')}>
                <Database size={16} strokeWidth={1.75} className="text-ink-3" />
                Inspect schema
              </button>
              <button type="button" className={row} onClick={() => openPanel('sync')}>
                <GitBranch size={16} strokeWidth={1.75} className="text-ink-3" />
                Sync log
              </button>
              <div className="mx-0.5 my-1 h-px bg-hairline" />
              <button
                type="button"
                className={row}
                onClick={() => {
                  void navigate({ to: '/experiments' })
                  setOpen(false)
                }}
              >
                <Flag size={16} strokeWidth={1.75} className="text-ink-3" />
                Feature flags
              </button>
            </div>
          </>,
          document.body
        )}
    </>
  )
}
