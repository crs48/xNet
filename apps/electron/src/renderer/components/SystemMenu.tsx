/**
 * SystemMenu - Top-right system menu for the minimal shell.
 */

import type { Theme } from '@xnetjs/ui'
import { Menu, MenuItem, MenuLabel, MenuSeparator, useTheme } from '@xnetjs/ui'
import { Bug, Check, Ellipsis, Monitor, Moon, Settings, Share2, Sun } from 'lucide-react'
import React from 'react'

interface RecentDocument {
  id: string
  title: string
  type: 'page' | 'database' | 'canvas'
}

interface SystemMenuProps {
  recentDocuments: RecentDocument[]
  onOpenDocument: (docId: string) => void
  onOpenSettings: () => void
  onAddShared: () => void
  onToggleDebugPanel: () => void
}

function ThemeMenuItem({
  active,
  label,
  icon,
  onSelect
}: {
  active: boolean
  label: string
  icon: React.ReactNode
  onSelect: () => void
}): React.ReactElement {
  return (
    <MenuItem onSelect={onSelect}>
      <span className="flex w-full items-center gap-2">
        {icon}
        <span className="flex-1">{label}</span>
        {active && <Check size={14} />}
      </span>
    </MenuItem>
  )
}

function labelForTheme(theme: Theme): string {
  switch (theme) {
    case 'light':
      return 'Light'
    case 'dark':
      return 'Dark'
    default:
      return 'System'
  }
}

export function SystemMenu({
  recentDocuments,
  onOpenDocument,
  onOpenSettings,
  onAddShared,
  onToggleDebugPanel
}: SystemMenuProps): React.ReactElement {
  const { theme, setTheme } = useTheme()

  return (
    <Menu
      trigger={
        <button
          type="button"
          className={[
            'titlebar-no-drag flex h-10 w-10 items-center justify-center rounded-2xl',
            'border border-border/70 bg-background/80 text-foreground shadow-lg backdrop-blur-xl',
            'transition-colors hover:bg-background'
          ].join(' ')}
          aria-label="Open system menu"
        >
          <Ellipsis size={18} />
        </button>
      }
      align="end"
      sideOffset={8}
      className="min-w-[240px]"
    >
      <MenuLabel>Workspace</MenuLabel>
      <MenuItem onSelect={onOpenSettings}>
        <span className="flex items-center gap-2">
          <Settings size={14} />
          Settings
        </span>
      </MenuItem>
      <MenuItem onSelect={onAddShared}>
        <span className="flex items-center gap-2">
          <Share2 size={14} />
          Add shared item
        </span>
      </MenuItem>
      <MenuItem onSelect={onToggleDebugPanel}>
        <span className="flex items-center gap-2">
          <Bug size={14} />
          Toggle debug panel
        </span>
      </MenuItem>

      <MenuSeparator />
      <MenuLabel>Theme</MenuLabel>
      <ThemeMenuItem
        active={theme === 'light'}
        label={labelForTheme('light')}
        icon={<Sun size={14} />}
        onSelect={() => setTheme('light')}
      />
      <ThemeMenuItem
        active={theme === 'dark'}
        label={labelForTheme('dark')}
        icon={<Moon size={14} />}
        onSelect={() => setTheme('dark')}
      />
      <ThemeMenuItem
        active={theme === 'system'}
        label={labelForTheme('system')}
        icon={<Monitor size={14} />}
        onSelect={() => setTheme('system')}
      />

      <MenuSeparator />
      <MenuLabel>Recent</MenuLabel>
      {recentDocuments.length === 0 ? (
        <MenuItem disabled>No recent documents</MenuItem>
      ) : (
        recentDocuments.map((doc) => (
          <MenuItem key={doc.id} onSelect={() => onOpenDocument(doc.id)}>
            <span className="flex w-full items-center gap-2">
              <span className="text-muted-foreground">{doc.type}</span>
              <span className="flex-1 truncate">{doc.title}</span>
            </span>
          </MenuItem>
        ))
      )}
    </Menu>
  )
}
