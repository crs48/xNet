/**
 * Menu/DropdownMenu component built on Base UI
 *
 * A menu that appears when triggered, typically used for actions or navigation.
 */

import { Menu as BaseMenu } from '@base-ui/react/menu'
import { Check, ChevronRight, Circle } from 'lucide-react'
import * as React from 'react'
import { cn } from '../utils'

// ─── Simple Menu (Backward Compatible) ──────────────────────────────

export interface MenuProps {
  trigger: React.ReactNode
  children: React.ReactNode
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
  className?: string
}

/**
 * Simple menu component with a convenient API.
 *
 * @example
 * <Menu trigger={<Button>Open Menu</Button>}>
 *   <MenuItem onSelect={() => console.log('Edit')}>Edit</MenuItem>
 *   <MenuItem onSelect={() => console.log('Delete')} danger>Delete</MenuItem>
 * </Menu>
 */
export function Menu({ trigger, children, align = 'end', sideOffset = 4, className }: MenuProps) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger render={trigger as React.ReactElement} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner align={align} sideOffset={sideOffset}>
          <BaseMenu.Popup
            className={cn(
              'z-50 min-w-[8rem] overflow-hidden',
              'rounded-md border border-border bg-popover p-1',
              'text-popover-foreground shadow-md',
              // Animation
              'opacity-0 scale-95',
              'data-[open]:opacity-100 data-[open]:scale-100',
              'transition-all duration-fast ease-out',
              'data-[ending-style]:opacity-0 data-[ending-style]:scale-95',
              className
            )}
          >
            {children}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  )
}

// ─── Simple MenuItem ────────────────────────────────────────────────

export interface MenuItemProps {
  onSelect?: () => void
  disabled?: boolean
  danger?: boolean
  icon?: React.ReactNode
  shortcut?: string
  children: React.ReactNode
  className?: string
}

/**
 * A menu item for use with the simple Menu component.
 */
export function MenuItem({
  onSelect,
  disabled = false,
  danger = false,
  icon,
  shortcut,
  children,
  className
}: MenuItemProps) {
  return (
    <BaseMenu.Item
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none',
        'transition-colors',
        'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        danger &&
          'text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive',
        className
      )}
    >
      {icon && <span className="mr-2 h-4 w-4">{icon}</span>}
      <span className="flex-1">{children}</span>
      {shortcut && <span className="ml-auto text-xs text-foreground-muted">{shortcut}</span>}
    </BaseMenu.Item>
  )
}

// ─── Simple MenuSeparator ───────────────────────────────────────────

/**
 * A separator for use with the simple Menu component.
 */
export function MenuSeparator() {
  return <BaseMenu.Separator className="-mx-1 my-1 h-px bg-border" />
}

// ─── Simple MenuLabel ───────────────────────────────────────────────

/**
 * A label for use with the simple Menu component.
 */
export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2 py-1.5 text-xs font-semibold text-foreground-muted">{children}</div>
}

// ─── Compound Components (for advanced usage) ───────────────────────

/** DropdownMenu root - groups all parts */
export const DropdownMenu = BaseMenu.Root

/** DropdownMenu trigger - the element that opens the menu */
export const DropdownMenuTrigger = BaseMenu.Trigger

/** DropdownMenu group - groups related items */
export const DropdownMenuGroup = BaseMenu.Group

/** DropdownMenu portal - renders content outside the DOM hierarchy */
export const DropdownMenuPortal = BaseMenu.Portal

/** DropdownMenu positioner - positions the popup relative to trigger */
export const DropdownMenuPositioner = BaseMenu.Positioner

/** DropdownMenu content - the popup container with styling */
export const DropdownMenuContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseMenu.Popup> & {
    sideOffset?: number
    align?: 'start' | 'center' | 'end'
  }
>(({ className, sideOffset = 4, align = 'end', ...props }, ref) => (
  <BaseMenu.Portal>
    <BaseMenu.Positioner sideOffset={sideOffset} align={align}>
      <BaseMenu.Popup
        ref={ref}
        className={cn(
          'z-50 min-w-[8rem] overflow-hidden',
          'rounded-md border border-border bg-popover p-1',
          'text-popover-foreground shadow-md',
          // Animation
          'opacity-0 scale-95',
          'data-[open]:opacity-100 data-[open]:scale-100',
          'transition-all duration-fast ease-out',
          'data-[ending-style]:opacity-0 data-[ending-style]:scale-95',
          className
        )}
        {...props}
      />
    </BaseMenu.Positioner>
  </BaseMenu.Portal>
))
DropdownMenuContent.displayName = 'DropdownMenuContent'

/** DropdownMenu item - an individual menu option */
export const DropdownMenuItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseMenu.Item> & {
    inset?: boolean
  }
>(({ className, inset, ...props }, ref) => (
  <BaseMenu.Item
    ref={ref}
    className={cn(
      'relative flex cursor-default select-none items-center gap-2',
      'rounded-sm px-2 py-1.5 text-sm outline-none',
      'transition-colors',
      'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      '[&>svg]:size-4 [&>svg]:shrink-0',
      inset && 'pl-8',
      className
    )}
    {...props}
  />
))
DropdownMenuItem.displayName = 'DropdownMenuItem'

/** DropdownMenu checkbox item */
export const DropdownMenuCheckboxItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseMenu.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <BaseMenu.CheckboxItem
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
      <BaseMenu.CheckboxItemIndicator>
        <Check className="h-4 w-4" />
      </BaseMenu.CheckboxItemIndicator>
    </span>
    {children}
  </BaseMenu.CheckboxItem>
))
DropdownMenuCheckboxItem.displayName = 'DropdownMenuCheckboxItem'

/** DropdownMenu radio group */
export const DropdownMenuRadioGroup = BaseMenu.RadioGroup

/** DropdownMenu radio item */
export const DropdownMenuRadioItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseMenu.RadioItem>
>(({ className, children, ...props }, ref) => (
  <BaseMenu.RadioItem
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
      <BaseMenu.RadioItemIndicator>
        <Circle className="h-2 w-2 fill-current" />
      </BaseMenu.RadioItemIndicator>
    </span>
    {children}
  </BaseMenu.RadioItem>
))
DropdownMenuRadioItem.displayName = 'DropdownMenuRadioItem'

/** DropdownMenu label */
export const DropdownMenuLabel = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseMenu.GroupLabel> & {
    inset?: boolean
  }
>(({ className, inset, ...props }, ref) => (
  <BaseMenu.GroupLabel
    ref={ref}
    className={cn('px-2 py-1.5 text-sm font-semibold', inset && 'pl-8', className)}
    {...props}
  />
))
DropdownMenuLabel.displayName = 'DropdownMenuLabel'

/** DropdownMenu separator */
export const DropdownMenuSeparator = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseMenu.Separator>
>(({ className, ...props }, ref) => (
  <BaseMenu.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-muted', className)} {...props} />
))
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator'

/** DropdownMenu shortcut - keyboard shortcut hint */
export function DropdownMenuShortcut({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('ml-auto text-xs tracking-widest opacity-60', className)} {...props} />
}
DropdownMenuShortcut.displayName = 'DropdownMenuShortcut'

// ─── Submenu Components ─────────────────────────────────────────────

/** DropdownMenu sub - submenu root */
export const DropdownMenuSub = BaseMenu.Root

/** DropdownMenu sub trigger */
export const DropdownMenuSubTrigger = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseMenu.SubmenuTrigger> & {
    inset?: boolean
  }
>(({ className, inset, children, ...props }, ref) => (
  <BaseMenu.SubmenuTrigger
    ref={ref}
    className={cn(
      'flex cursor-default select-none items-center gap-2',
      'rounded-sm px-2 py-1.5 text-sm outline-none',
      'data-[highlighted]:bg-accent',
      'data-[open]:bg-accent',
      inset && 'pl-8',
      className
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto h-4 w-4" />
  </BaseMenu.SubmenuTrigger>
))
DropdownMenuSubTrigger.displayName = 'DropdownMenuSubTrigger'

/** DropdownMenu sub content */
export const DropdownMenuSubContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseMenu.Popup>
>(({ className, ...props }, ref) => (
  <BaseMenu.Portal>
    <BaseMenu.Positioner>
      <BaseMenu.Popup
        ref={ref}
        className={cn(
          'z-50 min-w-[8rem] overflow-hidden',
          'rounded-md border border-border bg-popover p-1',
          'text-popover-foreground shadow-lg',
          // Animation
          'opacity-0 scale-95',
          'data-[open]:opacity-100 data-[open]:scale-100',
          'transition-all duration-fast',
          'data-[ending-style]:opacity-0 data-[ending-style]:scale-95',
          className
        )}
        {...props}
      />
    </BaseMenu.Positioner>
  </BaseMenu.Portal>
))
DropdownMenuSubContent.displayName = 'DropdownMenuSubContent'
