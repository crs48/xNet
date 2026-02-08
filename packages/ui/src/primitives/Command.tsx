/**
 * Command component built on cmdk
 *
 * A command palette / command menu for searching and executing actions.
 * Uses cmdk library which is actively maintained and provides excellent
 * fuzzy search and keyboard navigation.
 */

import { Command as CommandPrimitive } from 'cmdk'
import { Search } from 'lucide-react'
import { forwardRef, type ComponentPropsWithoutRef, type HTMLAttributes } from 'react'
import { cn } from '../utils'

// ─── Command Root ───────────────────────────────────────────────────

/**
 * Command root - the main container for the command palette.
 */
const Command = forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      'flex h-full w-full flex-col overflow-hidden',
      'rounded-md bg-popover text-popover-foreground',
      className
    )}
    {...props}
  />
))
Command.displayName = CommandPrimitive.displayName

// ─── Command Input ──────────────────────────────────────────────────

/**
 * Command input - the search input field.
 */
const CommandInput = forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div className="flex items-center border-b border-border px-3" cmdk-input-wrapper="">
    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none',
        'placeholder:text-foreground-faint',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  </div>
))
CommandInput.displayName = CommandPrimitive.Input.displayName

// ─── Command List ───────────────────────────────────────────────────

/**
 * Command list - container for command items.
 */
const CommandList = forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn('max-h-[300px] overflow-y-auto overflow-x-hidden', className)}
    {...props}
  />
))
CommandList.displayName = CommandPrimitive.List.displayName

// ─── Command Empty ──────────────────────────────────────────────────

/**
 * Command empty - shown when no results are found.
 */
const CommandEmpty = forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className="py-6 text-center text-sm text-foreground-muted"
    {...props}
  />
))
CommandEmpty.displayName = CommandPrimitive.Empty.displayName

// ─── Command Group ──────────────────────────────────────────────────

/**
 * Command group - groups related command items.
 */
const CommandGroup = forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      'overflow-hidden p-1 text-foreground',
      '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5',
      '[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium',
      '[&_[cmdk-group-heading]]:text-foreground-muted',
      className
    )}
    {...props}
  />
))
CommandGroup.displayName = CommandPrimitive.Group.displayName

// ─── Command Separator ──────────────────────────────────────────────

/**
 * Command separator - divider between groups or items.
 */
const CommandSeparator = forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 h-px bg-border', className)}
    {...props}
  />
))
CommandSeparator.displayName = CommandPrimitive.Separator.displayName

// ─── Command Item ───────────────────────────────────────────────────

/**
 * Command item - an individual command option.
 */
const CommandItem = forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-default gap-2 select-none items-center',
      'rounded-sm px-2 py-1.5 text-sm outline-none',
      'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
      'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
      '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
      className
    )}
    {...props}
  />
))
CommandItem.displayName = CommandPrimitive.Item.displayName

// ─── Command Shortcut ───────────────────────────────────────────────

/**
 * Command shortcut - keyboard shortcut hint.
 */
function CommandShortcut({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn('ml-auto text-xs tracking-widest text-foreground-muted', className)}
      {...props}
    />
  )
}

export {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut
}
