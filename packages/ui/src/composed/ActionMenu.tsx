/**
 * ActionMenu (exploration 0285) — a declarative action list that renders the
 * same {@link Action} descriptors into either a right-click ContextMenu body
 * or a click-anchored dropdown (the hover "…" kebab). One list per object type
 * powers every path onto its verbs, so right-click and kebab never drift.
 *
 * The descriptors are plain data: an object-type helper (e.g. `useNodeActions`
 * in `@xnetjs/react`) builds the list, wiring each `run` to the real mutation
 * or a `getCommandRegistry().runCommand(id)` call.
 */

import * as React from 'react'
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent
} from '../primitives/ContextMenu'
import {
  Menu,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  MenuItem,
  MenuSeparator
} from '../primitives/Menu'

/** Sentinel id marking a separator between item groups. */
export const ACTION_SEPARATOR = '---'

export interface Action {
  /** Unique id. Use {@link ACTION_SEPARATOR} for a divider. */
  id: string
  /** Visible label, e.g. 'Rename…'. */
  label?: string
  /** Leading icon element (already sized by callers or the item CSS). */
  icon?: React.ReactNode
  /** Pre-formatted shortcut hint, e.g. via `formatForDisplay('Mod-K')`. */
  shortcut?: string
  /** Render as a destructive action (red). */
  danger?: boolean
  /** Disable the item (still shown). */
  disabled?: boolean
  /** Hide the item entirely when this returns false. */
  when?: () => boolean
  /** Invoked on selection. */
  run?: () => void | Promise<void>
  /** One level of submenu, e.g. "Move to →". */
  children?: Action[]
}

/** Filter out hidden actions and any separators left dangling at the edges. */
export function visibleActions(actions: Action[]): Action[] {
  const shown = actions.filter((a) => a.id === ACTION_SEPARATOR || (a.when?.() ?? true))
  // Trim leading/trailing separators and collapse consecutive ones.
  const out: Action[] = []
  for (const a of shown) {
    if (a.id === ACTION_SEPARATOR) {
      if (out.length === 0) continue
      if (out[out.length - 1].id === ACTION_SEPARATOR) continue
    }
    out.push(a)
  }
  while (out.length && out[out.length - 1].id === ACTION_SEPARATOR) out.pop()
  return out
}

// ─── Context-menu rendering ─────────────────────────────────────────

/**
 * Render an {@link Action}[] as the body of a `<ContextMenu menu={…}>`.
 * Handles separators and one level of "Move to →" submenus.
 */
export function ActionMenuList({ actions }: { actions: Action[] }): React.JSX.Element {
  return (
    <>
      {visibleActions(actions).map((action, index) => {
        if (action.id === ACTION_SEPARATOR) {
          return <ContextMenuSeparator key={`sep-${index}`} />
        }
        if (action.children && action.children.length > 0) {
          return (
            <ContextMenuSub key={action.id}>
              <ContextMenuSubTrigger>
                {action.icon}
                <span className="flex-1">{action.label}</span>
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ActionMenuList actions={action.children} />
              </ContextMenuSubContent>
            </ContextMenuSub>
          )
        }
        return (
          <ContextMenuItem
            key={action.id}
            danger={action.danger}
            disabled={action.disabled}
            onClick={() => void action.run?.()}
          >
            {action.icon}
            <span className="flex-1">{action.label}</span>
            {action.shortcut && (
              <span className="ml-auto text-xs text-foreground-muted">{action.shortcut}</span>
            )}
          </ContextMenuItem>
        )
      })}
    </>
  )
}

// ─── Kebab (dropdown) rendering ─────────────────────────────────────

/** Render an {@link Action}[] as items inside a click-anchored dropdown Menu. */
export function ActionDropdownItems({ actions }: { actions: Action[] }): React.JSX.Element {
  return (
    <>
      {visibleActions(actions).map((action, index) => {
        if (action.id === ACTION_SEPARATOR) {
          return <MenuSeparator key={`sep-${index}`} />
        }
        if (action.children && action.children.length > 0) {
          return (
            <DropdownMenuSub key={action.id}>
              <DropdownMenuSubTrigger>
                {action.icon}
                <span className="flex-1">{action.label}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <ActionDropdownItems actions={action.children} />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )
        }
        return (
          <MenuItem
            key={action.id}
            danger={action.danger}
            disabled={action.disabled}
            icon={action.icon}
            shortcut={action.shortcut}
            onSelect={() => void action.run?.()}
          >
            {action.label}
          </MenuItem>
        )
      })}
    </>
  )
}

/**
 * The full "…" kebab: a trigger button that opens the same {@link Action}
 * list as a dropdown. Pair this next to a `<ContextMenu>` so both paths share
 * one source of truth.
 */
export function ActionKebabMenu({
  actions,
  trigger,
  align = 'end'
}: {
  actions: Action[]
  trigger: React.ReactNode
  align?: 'start' | 'center' | 'end'
}): React.JSX.Element {
  return (
    <Menu trigger={trigger} align={align}>
      <ActionDropdownItems actions={actions} />
    </Menu>
  )
}
