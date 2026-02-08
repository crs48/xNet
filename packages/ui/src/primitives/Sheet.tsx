/**
 * Sheet component built on Base UI Dialog
 *
 * A slide-out panel that extends from the edge of the screen.
 * Useful for navigation, filters, or secondary content.
 */

import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import * as React from 'react'
import { cn, cva, type VariantProps } from '../utils'

// ─── Sheet Root ─────────────────────────────────────────────────────

/** Sheet root - groups all parts */
export const Sheet = BaseDialog.Root

// ─── Sheet Trigger ──────────────────────────────────────────────────

/** Sheet trigger - the element that opens the sheet on click */
export const SheetTrigger = BaseDialog.Trigger

// ─── Sheet Close ────────────────────────────────────────────────────

/** Sheet close button */
export const SheetClose = BaseDialog.Close

// ─── Sheet Portal ───────────────────────────────────────────────────

/** Sheet portal - renders content outside the DOM hierarchy */
export const SheetPortal = BaseDialog.Portal

// ─── Sheet Overlay ──────────────────────────────────────────────────

/** Sheet overlay/backdrop */
export const SheetOverlay = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Backdrop>
>(({ className, ...props }, ref) => (
  <BaseDialog.Backdrop
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/80',
      // Animation
      'opacity-0 data-[open]:opacity-100',
      'transition-opacity duration-normal',
      'data-[ending-style]:opacity-0',
      className
    )}
    {...props}
  />
))
SheetOverlay.displayName = 'SheetOverlay'

// ─── Sheet Content Variants ─────────────────────────────────────────

const sheetVariants = cva(
  [
    'fixed z-50 gap-4 bg-background p-6 shadow-lg',
    'transition-transform duration-slow ease-out',
    'data-[ending-style]:duration-normal',
    'focus:outline-none'
  ],
  {
    variants: {
      side: {
        top: [
          'inset-x-0 top-0 border-b border-border',
          '-translate-y-full data-[open]:translate-y-0',
          'data-[ending-style]:-translate-y-full'
        ],
        bottom: [
          'inset-x-0 bottom-0 border-t border-border',
          'translate-y-full data-[open]:translate-y-0',
          'data-[ending-style]:translate-y-full'
        ],
        left: [
          'inset-y-0 left-0 h-full w-3/4 border-r border-border sm:max-w-sm',
          '-translate-x-full data-[open]:translate-x-0',
          'data-[ending-style]:-translate-x-full'
        ],
        right: [
          'inset-y-0 right-0 h-full w-3/4 border-l border-border sm:max-w-sm',
          'translate-x-full data-[open]:translate-x-0',
          'data-[ending-style]:translate-x-full'
        ]
      }
    },
    defaultVariants: {
      side: 'right'
    }
  }
)

// ─── Sheet Content ──────────────────────────────────────────────────

export interface SheetContentProps
  extends
    React.ComponentPropsWithoutRef<typeof BaseDialog.Popup>,
    VariantProps<typeof sheetVariants> {}

/**
 * Sheet content - the slide-out panel.
 *
 * @example
 * <Sheet>
 *   <SheetTrigger>Open</SheetTrigger>
 *   <SheetContent side="right">
 *     <SheetHeader>
 *       <SheetTitle>Settings</SheetTitle>
 *       <SheetDescription>Configure your preferences</SheetDescription>
 *     </SheetHeader>
 *     <div>Content here</div>
 *   </SheetContent>
 * </Sheet>
 */
export const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  ({ side = 'right', className, children, ...props }, ref) => (
    <SheetPortal>
      <SheetOverlay />
      <BaseDialog.Popup ref={ref} className={cn(sheetVariants({ side }), className)} {...props}>
        <BaseDialog.Close
          className={cn(
            'absolute right-4 top-4',
            'rounded-sm opacity-70',
            'ring-offset-background',
            'transition-opacity',
            'hover:opacity-100',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            'disabled:pointer-events-none'
          )}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </BaseDialog.Close>
        {children}
      </BaseDialog.Popup>
    </SheetPortal>
  )
)
SheetContent.displayName = 'SheetContent'

// ─── Sheet Header ───────────────────────────────────────────────────

/** Sheet header - container for title and description */
export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex flex-col space-y-2 text-center sm:text-left', className)} {...props} />
  )
}
SheetHeader.displayName = 'SheetHeader'

// ─── Sheet Footer ───────────────────────────────────────────────────

/** Sheet footer - container for action buttons */
export function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
      {...props}
    />
  )
}
SheetFooter.displayName = 'SheetFooter'

// ─── Sheet Title ────────────────────────────────────────────────────

/** Sheet title */
export const SheetTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Title>
>(({ className, ...props }, ref) => (
  <BaseDialog.Title
    ref={ref}
    className={cn('text-lg font-semibold text-foreground', className)}
    {...props}
  />
))
SheetTitle.displayName = 'SheetTitle'

// ─── Sheet Description ──────────────────────────────────────────────

/** Sheet description */
export const SheetDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Description>
>(({ className, ...props }, ref) => (
  <BaseDialog.Description
    ref={ref}
    className={cn('text-sm text-foreground-muted', className)}
    {...props}
  />
))
SheetDescription.displayName = 'SheetDescription'
