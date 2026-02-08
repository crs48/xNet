/**
 * ScrollArea component built on Base UI
 *
 * A native scroll container with custom scrollbars.
 */

import { ScrollArea as BaseScrollArea } from '@base-ui/react/scroll-area'
import * as React from 'react'
import { cn } from '../utils'

// ─── ScrollArea Root ───────────────────────────────────────────────

const ScrollArea = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseScrollArea.Root>
>(({ className, children, ...props }, ref) => (
  <BaseScrollArea.Root ref={ref} className={cn('relative overflow-hidden', className)} {...props}>
    <BaseScrollArea.Viewport className="h-full w-full rounded-[inherit]">
      {children}
    </BaseScrollArea.Viewport>
    <ScrollBar />
    <BaseScrollArea.Corner />
  </BaseScrollArea.Root>
))
ScrollArea.displayName = 'ScrollArea'

// ─── ScrollBar ─────────────────────────────────────────────────────

const ScrollBar = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseScrollArea.Scrollbar> & {
    orientation?: 'vertical' | 'horizontal'
  }
>(({ className, orientation = 'vertical', ...props }, ref) => (
  <BaseScrollArea.Scrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      'flex touch-none select-none transition-colors',
      orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent p-px',
      orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent p-px',
      className
    )}
    {...props}
  >
    <BaseScrollArea.Thumb
      className={cn(
        'relative flex-1 rounded-full bg-border',
        'transition-colors hover:bg-border-emphasis'
      )}
    />
  </BaseScrollArea.Scrollbar>
))
ScrollBar.displayName = 'ScrollBar'

// ─── Compound Components (for advanced usage) ──────────────────────

/** ScrollArea root - groups all parts */
export const ScrollAreaRoot = BaseScrollArea.Root

/** ScrollArea viewport - the actual scrollable container */
export const ScrollAreaViewport = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseScrollArea.Viewport>
>(({ className, ...props }, ref) => (
  <BaseScrollArea.Viewport
    ref={ref}
    className={cn('h-full w-full rounded-[inherit]', className)}
    {...props}
  />
))
ScrollAreaViewport.displayName = 'ScrollAreaViewport'

/** ScrollArea content - container for the content */
export const ScrollAreaContent = BaseScrollArea.Content

/** ScrollArea scrollbar - vertical or horizontal scrollbar */
export const ScrollAreaScrollbar = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseScrollArea.Scrollbar>
>(({ className, orientation = 'vertical', ...props }, ref) => (
  <BaseScrollArea.Scrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      'flex touch-none select-none transition-colors',
      orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent p-px',
      orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent p-px',
      className
    )}
    {...props}
  />
))
ScrollAreaScrollbar.displayName = 'ScrollAreaScrollbar'

/** ScrollArea thumb - the draggable part of the scrollbar */
export const ScrollAreaThumb = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseScrollArea.Thumb>
>(({ className, ...props }, ref) => (
  <BaseScrollArea.Thumb
    ref={ref}
    className={cn(
      'relative flex-1 rounded-full bg-border',
      'transition-colors hover:bg-border-emphasis',
      className
    )}
    {...props}
  />
))
ScrollAreaThumb.displayName = 'ScrollAreaThumb'

/** ScrollArea corner - appears at intersection of scrollbars */
export const ScrollAreaCorner = BaseScrollArea.Corner

export { ScrollArea, ScrollBar }
