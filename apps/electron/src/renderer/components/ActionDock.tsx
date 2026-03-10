/**
 * ActionDock - Bottom-centered action dock for the minimal shell.
 */

import { ArrowLeft, Database, FileText, Search, Sparkles } from 'lucide-react'
import React from 'react'

export type DockMode = 'canvas-home' | 'focused'

interface ActionDockProps {
  mode: DockMode
  onCreatePage: () => void
  onCreateDatabase: () => void
  onCreateNote: () => void
  onOpenSearch: () => void
  onReturnHome: () => void
}

function DockButton({
  id,
  icon,
  label,
  shortcut,
  onClick,
  highlight = false
}: {
  id: string
  icon: React.ReactNode
  label: string
  shortcut?: string
  onClick: () => void
  highlight?: boolean
}): React.ReactElement {
  const tooltip = shortcut ? `${label} (${shortcut})` : label

  return (
    <button
      type="button"
      onClick={onClick}
      data-action-dock-button={id}
      title={tooltip}
      aria-label={tooltip}
      className={[
        'inline-flex h-10 w-10 items-center justify-center rounded-xl',
        'transition-colors duration-150',
        highlight
          ? 'bg-foreground text-background shadow-lg shadow-foreground/15'
          : 'bg-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground'
      ].join(' ')}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </button>
  )
}

export function ActionDock({
  mode,
  onCreatePage,
  onCreateDatabase,
  onCreateNote,
  onOpenSearch,
  onReturnHome
}: ActionDockProps): React.ReactElement {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-5"
      data-action-dock={mode}
    >
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border/70 bg-background/82 px-2 py-2 shadow-2xl shadow-black/10 backdrop-blur-xl">
        {mode === 'focused' ? (
          <DockButton
            id="canvas"
            icon={<ArrowLeft size={16} />}
            label="Canvas"
            onClick={onReturnHome}
            highlight
          />
        ) : (
          <>
            <DockButton
              id="page"
              icon={<FileText size={16} />}
              label="Page"
              shortcut="P"
              onClick={onCreatePage}
            />
            <DockButton
              id="database"
              icon={<Database size={16} />}
              label="Database"
              shortcut="D"
              onClick={onCreateDatabase}
            />
            <DockButton
              id="note"
              icon={<Sparkles size={16} />}
              label="Note"
              shortcut="N"
              onClick={onCreateNote}
            />
          </>
        )}

        <div className="mx-1 h-6 w-px bg-border/70" />

        <DockButton
          id="command"
          icon={<Search size={16} />}
          label="Command palette"
          shortcut="Mod+Shift+P"
          onClick={onOpenSearch}
        />
      </div>
    </div>
  )
}
