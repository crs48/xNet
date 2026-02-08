/**
 * Modal/Dialog component built on Base UI
 *
 * An accessible modal dialog that interrupts the user's workflow
 * to communicate an important message and acquire a response.
 */

import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import * as React from 'react'
import { cn } from '../utils'

// ─── Simple Modal (Backward Compatible) ─────────────────────────────

export interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  className?: string
}

const sizes: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-4xl'
}

/**
 * Simple modal component with a convenient API.
 *
 * @example
 * <Modal open={isOpen} onOpenChange={setIsOpen} title="Confirm">
 *   <p>Are you sure?</p>
 *   <Button onClick={() => setIsOpen(false)}>Close</Button>
 * </Modal>
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = 'md',
  className
}: ModalProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop
          className={cn(
            'fixed inset-0 z-50 bg-black/80',
            // Animation
            'opacity-0 data-[open]:opacity-100',
            'transition-opacity duration-normal ease-out',
            'data-[ending-style]:opacity-0 data-[ending-style]:duration-fast'
          )}
        />
        <BaseDialog.Popup
          className={cn(
            'fixed left-1/2 top-1/2 z-50',
            '-translate-x-1/2 -translate-y-1/2',
            'w-full',
            'grid gap-4 p-6',
            'border border-border bg-background shadow-lg',
            'rounded-lg',
            'focus:outline-none',
            // Animation
            'opacity-0 scale-95',
            'data-[open]:opacity-100 data-[open]:scale-100',
            'transition-all duration-normal ease-out',
            'data-[ending-style]:opacity-0 data-[ending-style]:scale-95',
            'data-[ending-style]:duration-fast',
            sizes[size],
            className
          )}
        >
          {title && (
            <BaseDialog.Title className="text-lg font-semibold text-foreground">
              {title}
            </BaseDialog.Title>
          )}
          {description && (
            <BaseDialog.Description className="text-sm text-foreground-muted">
              {description}
            </BaseDialog.Description>
          )}
          <div>{children}</div>
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
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}

// ─── Compound Components (for advanced usage) ───────────────────────

/** Dialog root - groups all parts */
export const Dialog = BaseDialog.Root

/** Dialog trigger - the element that opens the dialog on click */
export const DialogTrigger = BaseDialog.Trigger

/** Dialog portal - renders content outside the DOM hierarchy */
export const DialogPortal = BaseDialog.Portal

/** Dialog close button */
export const DialogClose = BaseDialog.Close

/** Dialog overlay/backdrop */
export const DialogOverlay = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Backdrop>
>(({ className, ...props }, ref) => (
  <BaseDialog.Backdrop
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/80',
      // Animation
      'opacity-0 data-[open]:opacity-100',
      'transition-opacity duration-normal ease-out',
      'data-[ending-style]:opacity-0 data-[ending-style]:duration-fast',
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = 'DialogOverlay'

/** Dialog title */
export const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Title>
>(({ className, ...props }, ref) => (
  <BaseDialog.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
))
DialogTitle.displayName = 'DialogTitle'

/** Dialog description */
export const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Description>
>(({ className, ...props }, ref) => (
  <BaseDialog.Description
    ref={ref}
    className={cn('text-sm text-foreground-muted', className)}
    {...props}
  />
))
DialogDescription.displayName = 'DialogDescription'

/** Dialog header - container for title and description */
export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)}
      {...props}
    />
  )
}
DialogHeader.displayName = 'DialogHeader'

/** Dialog footer - container for action buttons */
export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
      {...props}
    />
  )
}
DialogFooter.displayName = 'DialogFooter'

/**
 * Styled dialog content for compound component usage.
 * Includes Portal, Backdrop, and Popup with default styling.
 *
 * @example
 * <Dialog open={open} onOpenChange={setOpen}>
 *   <DialogTrigger>Open</DialogTrigger>
 *   <DialogContent>
 *     <DialogHeader>
 *       <DialogTitle>Title</DialogTitle>
 *       <DialogDescription>Description</DialogDescription>
 *     </DialogHeader>
 *     <p>Content here</p>
 *     <DialogFooter>
 *       <Button>Save</Button>
 *     </DialogFooter>
 *   </DialogContent>
 * </Dialog>
 */
export const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Popup>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <BaseDialog.Popup
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-50',
        '-translate-x-1/2 -translate-y-1/2',
        'w-full max-w-lg',
        'grid gap-4 p-6',
        'border border-border bg-background shadow-lg',
        'rounded-lg',
        'focus:outline-none',
        // Animation
        'opacity-0 scale-95',
        'data-[open]:opacity-100 data-[open]:scale-100',
        'transition-all duration-normal ease-out',
        'data-[ending-style]:opacity-0 data-[ending-style]:scale-95',
        'data-[ending-style]:duration-fast',
        className
      )}
      {...props}
    >
      {children}
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
    </BaseDialog.Popup>
  </DialogPortal>
))
DialogContent.displayName = 'DialogContent'

// Alias for backward compatibility
export {
  Modal as ModalComponent,
  DialogContent as ModalContent,
  DialogHeader as ModalHeader,
  DialogFooter as ModalFooter,
  DialogTitle as ModalTitle,
  DialogDescription as ModalDescription,
  DialogTrigger as ModalTrigger,
  DialogClose as ModalClose
}
