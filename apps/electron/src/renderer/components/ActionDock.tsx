/**
 * ActionDock - Bottom-centered action dock for the minimal shell.
 */

import { IconButton } from '@xnetjs/ui'
import { ArrowLeft, Clock3, Database, FileText, Search, Sparkles } from 'lucide-react'
import React from 'react'

export type DockMode = 'canvas-home' | 'focused'

interface ActionDockProps {
  mode: DockMode
  onCreatePage: () => void
  onCreateDatabase: () => void
  onCreateNote: () => void
  onOpenSearch: () => void
  onOpenRecent: () => void
  onReturnHome: () => void
}

function DockButton({
  icon,
  label,
  onClick,
  highlight = false
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  highlight?: boolean
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      data-action-dock-button={label.toLowerCase().replace(/\s+/g, '-')}
      className={[
        'flex min-w-[76px] flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[11px]',
        'transition-all duration-200 hover:-translate-y-0.5',
        highlight
          ? 'bg-foreground text-background shadow-lg shadow-foreground/15'
          : 'bg-background/90 text-muted-foreground hover:bg-background hover:text-foreground'
      ].join(' ')}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-background/10">
        {icon}
      </span>
      <span className="font-medium">{label}</span>
    </button>
  )
}

export function ActionDock({
  mode,
  onCreatePage,
  onCreateDatabase,
  onCreateNote,
  onOpenSearch,
  onOpenRecent,
  onReturnHome
}: ActionDockProps): React.ReactElement {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-5"
      data-action-dock={mode}
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-[28px] border border-border/70 bg-background/80 px-3 py-3 shadow-2xl shadow-black/10 backdrop-blur-xl">
        {mode === 'focused' ? (
          <DockButton
            icon={<ArrowLeft size={18} />}
            label="Canvas"
            onClick={onReturnHome}
            highlight
          />
        ) : (
          <>
            <DockButton icon={<FileText size={18} />} label="Page" onClick={onCreatePage} />
            <DockButton icon={<Database size={18} />} label="Database" onClick={onCreateDatabase} />
            <DockButton icon={<Sparkles size={18} />} label="Note" onClick={onCreateNote} />
          </>
        )}

        <div className="mx-1 h-10 w-px bg-border/70" />

        <IconButton
          icon={<Clock3 size={18} />}
          label="Open recent items"
          onClick={onOpenRecent}
          className="h-11 w-11 rounded-2xl bg-background/90 text-foreground shadow-sm"
        />
        <IconButton
          icon={<Search size={18} />}
          label="Open command palette"
          onClick={onOpenSearch}
          className="h-11 w-11 rounded-2xl bg-background/90 text-foreground shadow-sm"
        />
      </div>
    </div>
  )
}
