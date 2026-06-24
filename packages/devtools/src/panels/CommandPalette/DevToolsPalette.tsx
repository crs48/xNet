/**
 * DevTools command palette — fuzzy "jump to any panel" (⌘/Ctrl+Shift+P).
 *
 * Built on the @xnetjs/ui cmdk Command primitives (the same ones the app's
 * GlobalSearch uses) so all 20 panels stay two keystrokes away even though
 * only four live in the primary tab row.
 */

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@xnetjs/ui'
import { useEffect } from 'react'
import type { PanelId } from '../../provider/DevToolsContext'
import { DEVTOOLS_PANELS, PANEL_GROUP_LABELS, PANEL_GROUP_ORDER } from '../panel-registry'

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (id: PanelId) => void
}

export function DevToolsPalette({ open, onClose, onSelect }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  if (!open) return null

  const sections = PANEL_GROUP_ORDER.map((group) => ({
    group,
    panels: DEVTOOLS_PANELS.filter((p) => p.group === group)
  })).filter((s) => s.panels.length > 0)

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-start justify-center pt-[15vh] bg-black/30"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-[440px] max-w-[92vw] bg-surface-1 border border-hairline rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <Command className="bg-surface-1">
          <CommandInput placeholder="Jump to a panel..." autoFocus />
          <CommandList className="max-h-[50vh]">
            <CommandEmpty>No panels found.</CommandEmpty>
            {sections.map(({ group, panels }) => (
              <CommandGroup key={group} heading={PANEL_GROUP_LABELS[group]}>
                {panels.map((panel) => {
                  const Icon = panel.icon
                  return (
                    <CommandItem
                      key={panel.id}
                      value={`${panel.label} ${panel.keywords.join(' ')}`}
                      onSelect={() => {
                        onSelect(panel.id)
                        onClose()
                      }}
                    >
                      <Icon size={14} className="text-ink-3 shrink-0" />
                      <span className="text-ink-1">{panel.label}</span>
                      <span className="text-ink-3 text-[10px] ml-2 truncate">
                        {panel.description}
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </div>
    </div>
  )
}
