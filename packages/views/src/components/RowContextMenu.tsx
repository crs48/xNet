/**
 * RowContextMenu (exploration 0285) — a shared right-click wrapper for the
 * card/row views (board, gallery, list, timeline). Every view already receives
 * `onRowClick` and `onDeleteRow` through {@link ViewProps}, so this surfaces the
 * same Open/Delete verbs consistently without per-view bespoke menus.
 *
 * Renders `children` untouched when neither callback is provided, so views that
 * don't wire actions pay nothing.
 */
import { ActionMenuList, ContextMenu, type Action } from '@xnetjs/ui'
import { SquareArrowOutUpRight, Trash2 } from 'lucide-react'
import { createElement, type ReactNode } from 'react'

export interface RowContextMenuProps {
  children: ReactNode
  /** Open the row (usually the same handler as click). */
  onOpen?: () => void
  /** Delete the row. */
  onDelete?: () => void
  /** Trigger wrapper class; defaults to `contents` (layout-transparent). */
  className?: string
}

export function RowContextMenu({
  children,
  onOpen,
  onDelete,
  className
}: RowContextMenuProps): React.JSX.Element {
  const actions: Action[] = []
  if (onOpen) {
    actions.push({
      id: 'open',
      label: 'Open',
      icon: createElement(SquareArrowOutUpRight, { size: 14 }),
      run: onOpen
    })
  }
  if (onDelete) {
    if (actions.length > 0) actions.push({ id: '---' })
    actions.push({
      id: 'delete',
      label: 'Delete',
      danger: true,
      icon: createElement(Trash2, { size: 14 }),
      run: onDelete
    })
  }

  if (actions.length === 0) return <>{children}</>

  return (
    <ContextMenu className={className ?? 'contents'} menu={<ActionMenuList actions={actions} />}>
      {children}
    </ContextMenu>
  )
}
