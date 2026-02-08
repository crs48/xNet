/**
 * Popover component built on Base UI
 *
 * An accessible popup anchored to a button.
 */

import type { ReactNode } from 'react'
import { Popover as BasePopover } from '@base-ui/react/popover'
import * as React from 'react'
import { cn } from '../utils'

// ─── Simple Popover (Backward Compatible) ──────────────────────────

export interface PopoverProps {
  trigger: ReactNode
  children: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
  className?: string
}

/**
 * Simple popover component with a convenient API.
 *
 * @example
 * <Popover trigger={<button>Open</button>}>
 *   <p>Popover content</p>
 * </Popover>
 */
export function Popover({
  trigger,
  children,
  open,
  onOpenChange,
  side = 'bottom',
  align = 'start',
  sideOffset = 4,
  className
}: PopoverProps) {
  return (
    <BasePopover.Root open={open} onOpenChange={onOpenChange}>
      <BasePopover.Trigger render={trigger as React.ReactElement} />
      <BasePopover.Portal>
        <BasePopover.Positioner side={side} align={align} sideOffset={sideOffset}>
          <BasePopover.Popup
            className={cn(
              'z-50 w-72 rounded-md',
              'border border-border bg-popover p-4',
              'text-popover-foreground shadow-md',
              'outline-none',
              // Animation
              'opacity-0 translate-y-1',
              'data-[open]:opacity-100 data-[open]:translate-y-0',
              'data-[ending-style]:opacity-0 data-[ending-style]:translate-y-1',
              'transition-all duration-fast ease-out',
              className
            )}
          >
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  )
}

// ─── Compound Components (for advanced usage) ──────────────────────

/** Popover root - groups all parts */
export const PopoverRoot = BasePopover.Root

/** Popover trigger - the element that opens the popover on click */
export const PopoverTrigger = BasePopover.Trigger

/** Popover portal - renders content outside the DOM hierarchy */
export const PopoverPortal = BasePopover.Portal

/** Popover positioner - positions the popup relative to trigger */
export const PopoverPositioner = BasePopover.Positioner

/** Popover anchor - an element to anchor the popover to */
export const PopoverAnchor = BasePopover.Positioner

/** Popover close button */
export const PopoverClose = BasePopover.Close

/** Popover title */
export const PopoverTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof BasePopover.Title>
>(({ className, ...props }, ref) => (
  <BasePopover.Title
    ref={ref}
    className={cn('font-medium text-sm leading-none', className)}
    {...props}
  />
))
PopoverTitle.displayName = 'PopoverTitle'

/** Popover description */
export const PopoverDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof BasePopover.Description>
>(({ className, ...props }, ref) => (
  <BasePopover.Description
    ref={ref}
    className={cn('text-sm text-foreground-muted mt-2', className)}
    {...props}
  />
))
PopoverDescription.displayName = 'PopoverDescription'

/** Popover popup - the actual popover content container */
export const PopoverPopup = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BasePopover.Popup>
>(({ className, ...props }, ref) => (
  <BasePopover.Popup
    ref={ref}
    className={cn(
      'z-50 w-72 rounded-md',
      'border border-border bg-popover p-4',
      'text-popover-foreground shadow-md',
      'outline-none',
      // Animation
      'opacity-0 translate-y-1',
      'data-[open]:opacity-100 data-[open]:translate-y-0',
      'data-[ending-style]:opacity-0 data-[ending-style]:translate-y-1',
      'transition-all duration-fast ease-out',
      className
    )}
    {...props}
  />
))
PopoverPopup.displayName = 'PopoverPopup'

/** Popover arrow - optional arrow pointing to the trigger */
export const PopoverArrow = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BasePopover.Arrow>
>(({ className, ...props }, ref) => (
  <BasePopover.Arrow ref={ref} className={cn('fill-popover', className)} {...props} />
))
PopoverArrow.displayName = 'PopoverArrow'

/**
 * Styled popover content for compound component usage.
 * Includes Portal, Positioner, and Popup with default styling.
 *
 * @example
 * <PopoverRoot>
 *   <PopoverTrigger>Open</PopoverTrigger>
 *   <PopoverContent>Hello world</PopoverContent>
 * </PopoverRoot>
 */
export const PopoverContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BasePopover.Popup> & {
    side?: 'top' | 'right' | 'bottom' | 'left'
    align?: 'start' | 'center' | 'end'
    sideOffset?: number
  }
>(({ className, side = 'bottom', align = 'center', sideOffset = 4, children, ...props }, ref) => (
  <BasePopover.Portal>
    <BasePopover.Positioner side={side} align={align} sideOffset={sideOffset}>
      <BasePopover.Popup
        ref={ref}
        className={cn(
          'z-50 w-72 rounded-md',
          'border border-border bg-popover p-4',
          'text-popover-foreground shadow-md',
          'outline-none',
          // Animation
          'opacity-0 translate-y-1',
          'data-[open]:opacity-100 data-[open]:translate-y-0',
          'data-[ending-style]:opacity-0 data-[ending-style]:translate-y-1',
          'transition-all duration-fast ease-out',
          className
        )}
        {...props}
      >
        {children}
      </BasePopover.Popup>
    </BasePopover.Positioner>
  </BasePopover.Portal>
))
PopoverContent.displayName = 'PopoverContent'
