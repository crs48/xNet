/**
 * ContextMenu component built on Base UI (exploration 0285)
 *
 * A pointer-anchored menu that opens on right-click or long-press within a
 * trigger area, positioning itself at the pointer. Unlike {@link Menu}, which
 * anchors to a fixed trigger element, the context menu follows the cursor and
 * handles collision/flip, portaling, focus trapping, keyboard activation
 * (`Menu` key / `Shift+F10`), and dismissal natively.
 *
 * Styling mirrors `Menu.tsx` — Base UI's context-menu reuses the same
 * underlying Menu part components, so the two share tokens and motion.
 */

import { ContextMenu as BaseContextMenu } from '@base-ui/react/context-menu'
import { Check, ChevronRight, Circle } from 'lucide-react'
import * as React from 'react'
import { cn } from '../utils'

// ─── Simple ContextMenu ─────────────────────────────────────────────

export interface ContextMenuProps {
  /** The element(s) that respond to right-click / long-press. */
  children: React.ReactNode
  /** The menu body — typically ContextMenuItem/Separator or an ActionMenuList. */
  menu: React.ReactNode
  /** Extra classes for the trigger wrapper. */
  className?: string
}

/**
 * Wrap any element; right-click or long-press within it opens `menu`.
 *
 * @example
 * <ContextMenu menu={
 *   <>
 *     <ContextMenuItem onClick={rename}>Rename…</ContextMenuItem>
 *     <ContextMenuSeparator />
 *     <ContextMenuItem danger onClick={remove}>Delete</ContextMenuItem>
 *   </>
 * }>
 *   <ExplorerRow item={item} />
 * </ContextMenu>
 */
export function ContextMenu({ children, menu, className }: ContextMenuProps) {
  return (
    <BaseContextMenu.Root>
      <BaseContextMenu.Trigger className={className}>{children}</BaseContextMenu.Trigger>
      <BaseContextMenu.Portal>
        <BaseContextMenu.Positioner className="outline-none">
          <BaseContextMenu.Popup
            className={cn(
              'z-50 min-w-[10rem] overflow-hidden',
              'rounded-md border border-border bg-popover p-1',
              'text-popover-foreground',
              // Animation
              'opacity-0 scale-95',
              'data-[open]:opacity-100 data-[open]:scale-100',
              'transition-[opacity,transform] duration-fast ease-out',
              'data-[ending-style]:opacity-0 data-[ending-style]:scale-95'
            )}
          >
            {menu}
          </BaseContextMenu.Popup>
        </BaseContextMenu.Positioner>
      </BaseContextMenu.Portal>
    </BaseContextMenu.Root>
  )
}

// ─── Compound parts (root/trigger for advanced usage) ───────────────

/** ContextMenu root — groups all parts. */
export const ContextMenuRoot = BaseContextMenu.Root

/** ContextMenu trigger — the area that opens the menu on right-click. */
export const ContextMenuTrigger = BaseContextMenu.Trigger

/** ContextMenu portal — renders the popup outside the DOM hierarchy. */
export const ContextMenuPortal = BaseContextMenu.Portal

/** ContextMenu positioner — positions the popup at the pointer. */
export const ContextMenuPositioner = BaseContextMenu.Positioner

/** ContextMenu group — groups related items. */
export const ContextMenuGroup = BaseContextMenu.Group

/** ContextMenu popup container with themed styling. */
export const ContextMenuContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseContextMenu.Popup>
>(({ className, ...props }, ref) => (
  <BaseContextMenu.Portal>
    <BaseContextMenu.Positioner className="outline-none">
      <BaseContextMenu.Popup
        ref={ref}
        className={cn(
          'z-50 min-w-[10rem] overflow-hidden',
          'rounded-md border border-border bg-popover p-1',
          'text-popover-foreground',
          'opacity-0 scale-95',
          'data-[open]:opacity-100 data-[open]:scale-100',
          'transition-[opacity,transform] duration-fast ease-out',
          'data-[ending-style]:opacity-0 data-[ending-style]:scale-95',
          className
        )}
        {...props}
      />
    </BaseContextMenu.Positioner>
  </BaseContextMenu.Portal>
))
ContextMenuContent.displayName = 'ContextMenuContent'

// ─── ContextMenuItem ────────────────────────────────────────────────

export interface ContextMenuItemProps extends React.ComponentPropsWithoutRef<
  typeof BaseContextMenu.Item
> {
  /** Render as a destructive action (red text/hover). */
  danger?: boolean
  inset?: boolean
}

/** An individual context-menu option. */
export const ContextMenuItem = React.forwardRef<HTMLDivElement, ContextMenuItemProps>(
  ({ className, danger, inset, ...props }, ref) => (
    <BaseContextMenu.Item
      ref={ref}
      className={cn(
        'relative flex cursor-default select-none items-center gap-2',
        'rounded-sm px-2 py-1.5 text-sm outline-none',
        'transition-colors',
        'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        '[&>svg]:size-4 [&>svg]:shrink-0',
        inset && 'pl-8',
        danger &&
          'text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive',
        className
      )}
      {...props}
    />
  )
)
ContextMenuItem.displayName = 'ContextMenuItem'

// ─── ContextMenuCheckboxItem ────────────────────────────────────────

export const ContextMenuCheckboxItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseContextMenu.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <BaseContextMenu.CheckboxItem
    ref={ref}
    className={cn(
      'relative flex cursor-default select-none items-center',
      'rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none',
      'transition-colors',
      'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <BaseContextMenu.CheckboxItemIndicator>
        <Check className="h-4 w-4" />
      </BaseContextMenu.CheckboxItemIndicator>
    </span>
    {children}
  </BaseContextMenu.CheckboxItem>
))
ContextMenuCheckboxItem.displayName = 'ContextMenuCheckboxItem'

// ─── ContextMenuRadioGroup / RadioItem ──────────────────────────────

export const ContextMenuRadioGroup = BaseContextMenu.RadioGroup

export const ContextMenuRadioItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseContextMenu.RadioItem>
>(({ className, children, ...props }, ref) => (
  <BaseContextMenu.RadioItem
    ref={ref}
    className={cn(
      'relative flex cursor-default select-none items-center',
      'rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none',
      'transition-colors',
      'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <BaseContextMenu.RadioItemIndicator>
        <Circle className="h-2 w-2 fill-current" />
      </BaseContextMenu.RadioItemIndicator>
    </span>
    {children}
  </BaseContextMenu.RadioItem>
))
ContextMenuRadioItem.displayName = 'ContextMenuRadioItem'

// ─── ContextMenuLabel ───────────────────────────────────────────────

export const ContextMenuLabel = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseContextMenu.GroupLabel> & { inset?: boolean }
>(({ className, inset, ...props }, ref) => (
  <BaseContextMenu.GroupLabel
    ref={ref}
    className={cn(
      'px-2 py-1.5 text-xs font-semibold text-foreground-muted',
      inset && 'pl-8',
      className
    )}
    {...props}
  />
))
ContextMenuLabel.displayName = 'ContextMenuLabel'

// ─── ContextMenuSeparator ───────────────────────────────────────────

export function ContextMenuSeparator({ className }: { className?: string }) {
  return <BaseContextMenu.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} />
}

// ─── ContextMenuShortcut ────────────────────────────────────────────

export function ContextMenuShortcut({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('ml-auto text-xs text-foreground-muted', className)} {...props} />
}
ContextMenuShortcut.displayName = 'ContextMenuShortcut'

// ─── Submenu parts ──────────────────────────────────────────────────

/** ContextMenu submenu root. */
export const ContextMenuSub = BaseContextMenu.SubmenuRoot

/** ContextMenu submenu trigger — opens a nested menu ("Move to →"). */
export const ContextMenuSubTrigger = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseContextMenu.SubmenuTrigger> & { inset?: boolean }
>(({ className, inset, children, ...props }, ref) => (
  <BaseContextMenu.SubmenuTrigger
    ref={ref}
    className={cn(
      'flex cursor-default select-none items-center gap-2',
      'rounded-sm px-2 py-1.5 text-sm outline-none',
      'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
      'data-[open]:bg-accent',
      '[&>svg]:size-4 [&>svg]:shrink-0',
      inset && 'pl-8',
      className
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto h-4 w-4" />
  </BaseContextMenu.SubmenuTrigger>
))
ContextMenuSubTrigger.displayName = 'ContextMenuSubTrigger'

/** ContextMenu submenu popup. */
export const ContextMenuSubContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseContextMenu.Popup>
>(({ className, ...props }, ref) => (
  <BaseContextMenu.Portal>
    <BaseContextMenu.Positioner className="outline-none">
      <BaseContextMenu.Popup
        ref={ref}
        className={cn(
          'z-50 min-w-[10rem] overflow-hidden',
          'rounded-md border border-border bg-popover p-1',
          'text-popover-foreground',
          'opacity-0 scale-95',
          'data-[open]:opacity-100 data-[open]:scale-100',
          'transition-[opacity,transform] duration-fast',
          'data-[ending-style]:opacity-0 data-[ending-style]:scale-95',
          className
        )}
        {...props}
      />
    </BaseContextMenu.Positioner>
  </BaseContextMenu.Portal>
))
ContextMenuSubContent.displayName = 'ContextMenuSubContent'
