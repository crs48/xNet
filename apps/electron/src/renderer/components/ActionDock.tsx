/**
 * ActionDock - Bottom-centered action dock for the minimal shell.
 */

import { useCanvasThemeTokens } from '@xnetjs/canvas'
import {
  ArrowLeft,
  Database,
  FileText,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Target
} from 'lucide-react'
import React from 'react'

export type DockMode = 'canvas-home' | 'focused'

interface ActionDockProps {
  mode: DockMode
  onCreatePage: () => void
  onCreateDatabase: () => void
  onCreateNote: () => void
  onOpenSearch: () => void
  onReturnHome: () => void
  onZoomOut?: () => void
  onZoomIn?: () => void
  onFitToContent?: () => void
  onResetView?: () => void
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
        'inline-flex h-9 w-9 items-center justify-center rounded-xl',
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
  onReturnHome,
  onZoomOut,
  onZoomIn,
  onFitToContent,
  onResetView
}: ActionDockProps): React.ReactElement {
  const theme = useCanvasThemeTokens()
  const showNavigationCluster =
    mode === 'canvas-home' &&
    typeof onZoomOut === 'function' &&
    typeof onZoomIn === 'function' &&
    typeof onFitToContent === 'function' &&
    typeof onResetView === 'function'

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-5"
      data-action-dock={mode}
    >
      <div
        className="pointer-events-auto flex items-center gap-1 rounded-full border border-border/70 bg-background/82 px-2 py-1.5 shadow-2xl shadow-black/10 backdrop-blur-xl"
        data-action-dock-nav={showNavigationCluster ? 'true' : 'false'}
        data-canvas-theme={theme.mode}
        style={{
          backgroundColor: theme.panelBackground,
          borderColor: theme.panelBorder,
          boxShadow: theme.panelShadow
        }}
      >
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

        <div className="mx-1 h-5 w-px bg-border/70" />

        <DockButton
          id="command"
          icon={<Search size={16} />}
          label="Command palette"
          shortcut="Mod+Shift+P"
          onClick={onOpenSearch}
        />

        {showNavigationCluster ? (
          <>
            <div className="mx-1 h-5 w-px bg-border/70" />
            <DockButton
              id="zoom-out"
              icon={<Minus size={16} />}
              label="Zoom out"
              shortcut="Ctrl/Cmd -"
              onClick={onZoomOut}
            />
            <DockButton
              id="zoom-in"
              icon={<Plus size={16} />}
              label="Zoom in"
              shortcut="Ctrl/Cmd +"
              onClick={onZoomIn}
            />
            <DockButton
              id="fit"
              icon={<Target size={16} />}
              label="Fit to content"
              shortcut="Ctrl/Cmd 1"
              onClick={onFitToContent}
            />
            <DockButton
              id="reset"
              icon={<RotateCcw size={16} />}
              label="Reset view"
              shortcut="Ctrl/Cmd 0"
              onClick={onResetView}
            />
          </>
        ) : null}
      </div>
    </div>
  )
}
