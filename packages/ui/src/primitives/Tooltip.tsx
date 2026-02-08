/**
 * Tooltip component built on Base UI
 *
 * A popup that appears when an element is hovered or focused,
 * showing a hint for sighted users.
 */

import type { ReactNode } from 'react'
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'
import * as React from 'react'
import { cn } from '../utils'

// ─── Simple Tooltip (Backward Compatible) ──────────────────────────

export interface TooltipProps {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  sideOffset?: number
  delayDuration?: number
  className?: string
}

/**
 * Simple tooltip component with a convenient API.
 * Wraps the trigger and shows content on hover.
 *
 * @example
 * <Tooltip content="Hello world">
 *   <button>Hover me</button>
 * </Tooltip>
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  sideOffset = 4,
  delayDuration = 200,
  className
}: TooltipProps) {
  return (
    <BaseTooltip.Provider delay={delayDuration}>
      <BaseTooltip.Root>
        <BaseTooltip.Trigger render={children as React.ReactElement} />
        <BaseTooltip.Portal>
          <BaseTooltip.Positioner side={side} sideOffset={sideOffset}>
            <BaseTooltip.Popup
              className={cn(
                'z-50 overflow-hidden rounded-md',
                'bg-primary px-3 py-1.5',
                'text-xs text-primary-foreground',
                'shadow-md',
                // Animation
                'opacity-0 scale-95',
                'data-[open]:opacity-100 data-[open]:scale-100',
                'data-[ending-style]:opacity-0 data-[ending-style]:scale-95',
                'transition-all duration-fast ease-out',
                className
              )}
            >
              {content}
              <BaseTooltip.Arrow className="fill-primary" />
            </BaseTooltip.Popup>
          </BaseTooltip.Positioner>
        </BaseTooltip.Portal>
      </BaseTooltip.Root>
    </BaseTooltip.Provider>
  )
}

// ─── Compound Components (for advanced usage) ──────────────────────

/**
 * Tooltip provider for shared delay across multiple tooltips.
 * Wrap your app or a section with this to enable instant tooltips
 * when hovering between multiple tooltip triggers.
 */
export const TooltipProvider = ({
  children,
  delayDuration = 200,
  ...props
}: {
  children: React.ReactNode
  delayDuration?: number
} & Omit<React.ComponentPropsWithoutRef<typeof BaseTooltip.Provider>, 'delay'>) => (
  <BaseTooltip.Provider delay={delayDuration} {...props}>
    {children}
  </BaseTooltip.Provider>
)

/** Tooltip root - groups all parts */
export const TooltipRoot = BaseTooltip.Root

/** Tooltip trigger - the element that opens the tooltip on hover */
export const TooltipTrigger = BaseTooltip.Trigger

/** Tooltip portal - renders content outside the DOM hierarchy */
export const TooltipPortal = BaseTooltip.Portal

/** Tooltip positioner - positions the popup relative to trigger */
export const TooltipPositioner = BaseTooltip.Positioner

/** Tooltip popup - the actual tooltip content container */
export const TooltipPopup = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseTooltip.Popup>
>(({ className, ...props }, ref) => (
  <BaseTooltip.Popup
    ref={ref}
    className={cn(
      'z-50 overflow-hidden rounded-md',
      'bg-primary px-3 py-1.5',
      'text-xs text-primary-foreground',
      'shadow-md',
      // Animation
      'opacity-0 scale-95',
      'data-[open]:opacity-100 data-[open]:scale-100',
      'data-[ending-style]:opacity-0 data-[ending-style]:scale-95',
      'transition-all duration-fast ease-out',
      className
    )}
    {...props}
  />
))
TooltipPopup.displayName = 'TooltipPopup'

/** Tooltip arrow - optional arrow pointing to the trigger */
export const TooltipArrow = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseTooltip.Arrow>
>(({ className, ...props }, ref) => (
  <BaseTooltip.Arrow ref={ref} className={cn('fill-primary', className)} {...props} />
))
TooltipArrow.displayName = 'TooltipArrow'

/**
 * Styled tooltip content for compound component usage.
 * Includes Portal, Positioner, and Popup with default styling.
 *
 * @example
 * <TooltipProvider>
 *   <TooltipRoot>
 *     <TooltipTrigger>Hover me</TooltipTrigger>
 *     <TooltipContent>Hello world</TooltipContent>
 *   </TooltipRoot>
 * </TooltipProvider>
 */
export const TooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseTooltip.Popup> & {
    side?: 'top' | 'right' | 'bottom' | 'left'
    sideOffset?: number
  }
>(({ className, side = 'top', sideOffset = 4, children, ...props }, ref) => (
  <BaseTooltip.Portal>
    <BaseTooltip.Positioner side={side} sideOffset={sideOffset}>
      <BaseTooltip.Popup
        ref={ref}
        className={cn(
          'z-50 overflow-hidden rounded-md',
          'bg-primary px-3 py-1.5',
          'text-xs text-primary-foreground',
          'shadow-md',
          // Animation
          'opacity-0 scale-95',
          'data-[open]:opacity-100 data-[open]:scale-100',
          'data-[ending-style]:opacity-0 data-[ending-style]:scale-95',
          'transition-all duration-fast ease-out',
          className
        )}
        {...props}
      >
        {children}
        <BaseTooltip.Arrow className="fill-primary" />
      </BaseTooltip.Popup>
    </BaseTooltip.Positioner>
  </BaseTooltip.Portal>
))
TooltipContent.displayName = 'TooltipContent'
