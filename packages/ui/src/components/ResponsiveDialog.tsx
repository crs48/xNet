/**
 * ResponsiveDialog - Adaptive dialog for all screen sizes
 *
 * - Mobile: Bottom sheet (85vh height)
 * - Desktop: Centered modal
 */

import * as React from 'react'
import { useIsMobile } from '../hooks/useMediaQuery'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '../primitives/Modal'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter
} from '../primitives/Sheet'

// ─── Types ─────────────────────────────────────────────────────────

export interface ResponsiveDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void
  /** Dialog title */
  title: string
  /** Optional description text */
  description?: string
  /** Dialog content */
  children: React.ReactNode
  /** Footer content (buttons, etc.) */
  footer?: React.ReactNode
  /** Additional class names for the content container */
  className?: string
  /** Height of the mobile sheet (default: 85vh) */
  mobileHeight?: string
  /** Max width of the desktop dialog */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
}

// ─── Size Mapping ──────────────────────────────────────────────────

const maxWidthClasses: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-4xl'
}

// ─── Component ─────────────────────────────────────────────────────

/**
 * Responsive dialog that shows as a bottom sheet on mobile
 * and a centered modal on desktop.
 *
 * @example
 * const [open, setOpen] = useState(false)
 *
 * <Button onClick={() => setOpen(true)}>Open</Button>
 * <ResponsiveDialog
 *   open={open}
 *   onOpenChange={setOpen}
 *   title="Edit Profile"
 *   description="Make changes to your profile here."
 *   footer={
 *     <>
 *       <Button variant="outline" onClick={() => setOpen(false)}>
 *         Cancel
 *       </Button>
 *       <Button onClick={handleSave}>Save</Button>
 *     </>
 *   }
 * >
 *   <ProfileForm />
 * </ResponsiveDialog>
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  mobileHeight = '85vh',
  maxWidth = 'md'
}: ResponsiveDialogProps) {
  const isMobile = useIsMobile()

  // Mobile: Bottom sheet
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="flex flex-col rounded-t-xl"
          style={{ height: mobileHeight }}
        >
          <SheetHeader className="text-left">
            <SheetTitle>{title}</SheetTitle>
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>
          <div className={`flex-1 overflow-auto py-4 ${className || ''}`}>{children}</div>
          {footer && (
            <SheetFooter className="flex-row gap-2 pt-4 border-t border-border">
              {footer}
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
    )
  }

  // Desktop: Centered modal
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={maxWidthClasses[maxWidth]}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className={className}>{children}</div>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}

// ─── Compound Components for Custom Layouts ────────────────────────

export interface ResponsiveDialogRootProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void
  /** Dialog content */
  children: React.ReactNode
}

/**
 * Root component for custom responsive dialog layouts.
 *
 * Use this when you need more control over the dialog structure.
 *
 * @example
 * <ResponsiveDialogRoot open={open} onOpenChange={setOpen}>
 *   <ResponsiveDialogContent>
 *     <ResponsiveDialogHeader>
 *       <ResponsiveDialogTitle>Custom Layout</ResponsiveDialogTitle>
 *     </ResponsiveDialogHeader>
 *     <div>Custom content</div>
 *   </ResponsiveDialogContent>
 * </ResponsiveDialogRoot>
 */
export function ResponsiveDialogRoot({ open, onOpenChange, children }: ResponsiveDialogRootProps) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        {children}
      </Sheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children}
    </Dialog>
  )
}

export interface ResponsiveDialogContentProps {
  children: React.ReactNode
  className?: string
  /** Height of the mobile sheet (default: 85vh) */
  mobileHeight?: string
}

/**
 * Content wrapper that adapts between Sheet and Dialog content.
 */
export function ResponsiveDialogContent({
  children,
  className,
  mobileHeight = '85vh'
}: ResponsiveDialogContentProps) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <SheetContent
        side="bottom"
        className={`flex flex-col rounded-t-xl ${className || ''}`}
        style={{ height: mobileHeight }}
      >
        {children}
      </SheetContent>
    )
  }

  return <DialogContent className={className}>{children}</DialogContent>
}

// Re-export header/footer components for convenience
export {
  DialogHeader as ResponsiveDialogHeader,
  DialogTitle as ResponsiveDialogTitle,
  DialogDescription as ResponsiveDialogDescription,
  DialogFooter as ResponsiveDialogFooter
}
