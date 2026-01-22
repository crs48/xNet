import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { cn } from '../utils'
import type { ReactNode } from 'react'

export interface MenuProps {
  trigger: ReactNode
  children: ReactNode
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
  className?: string
}

export function Menu({ trigger, children, align = 'end', sideOffset = 4, className }: MenuProps) {
  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>{trigger}</DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align={align}
          sideOffset={sideOffset}
          className={cn(
            'z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2',
            'data-[side=left]:slide-in-from-right-2',
            'data-[side=right]:slide-in-from-left-2',
            'data-[side=top]:slide-in-from-bottom-2',
            className
          )}
        >
          {children}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  )
}

export interface MenuItemProps {
  onSelect?: () => void
  disabled?: boolean
  danger?: boolean
  icon?: ReactNode
  shortcut?: string
  children: ReactNode
  className?: string
}

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
    <DropdownMenuPrimitive.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors',
        'focus:bg-accent focus:text-accent-foreground',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        danger && 'text-destructive focus:bg-destructive/10 focus:text-destructive',
        className
      )}
    >
      {icon && <span className="mr-2 h-4 w-4">{icon}</span>}
      <span className="flex-1">{children}</span>
      {shortcut && <span className="ml-auto text-xs text-muted-foreground">{shortcut}</span>}
    </DropdownMenuPrimitive.Item>
  )
}

export function MenuSeparator() {
  return <DropdownMenuPrimitive.Separator className="-mx-1 my-1 h-px bg-border" />
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <DropdownMenuPrimitive.Label className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
      {children}
    </DropdownMenuPrimitive.Label>
  )
}

// Export primitives for more control
export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
export const DropdownMenuContent = DropdownMenuPrimitive.Content
export const DropdownMenuItem = DropdownMenuPrimitive.Item
export const DropdownMenuSeparator = DropdownMenuPrimitive.Separator
export const DropdownMenuLabel = DropdownMenuPrimitive.Label
export const DropdownMenuGroup = DropdownMenuPrimitive.Group
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal
