/**
 * ResponsiveSidebar - Adaptive sidebar for all screen sizes
 *
 * - Mobile: Sheet triggered by hamburger menu
 * - Tablet: Collapsed icons-only sidebar
 * - Desktop: Full expanded sidebar
 */

import { Menu } from 'lucide-react'
import * as React from 'react'
import { Sheet, SheetContent, SheetTrigger } from '../primitives/Sheet'
import { cn } from '../utils'

// ─── Types ─────────────────────────────────────────────────────────

export interface ResponsiveSidebarProps {
  /** Full sidebar content (shown on desktop and mobile sheet) */
  children: React.ReactNode
  /** Collapsed content for tablet view (icons only) */
  collapsedContent?: React.ReactNode
  /** Additional class names for the sidebar container */
  className?: string
  /** Width of the full sidebar (default: 256px / w-64) */
  width?: string
  /** Width of the collapsed sidebar (default: 64px / w-16) */
  collapsedWidth?: string
  /** Custom trigger element for mobile sheet */
  trigger?: React.ReactElement
  /** Side for mobile sheet (default: left) */
  side?: 'left' | 'right'
  /** Whether the mobile sheet is open (controlled) */
  open?: boolean
  /** Callback when mobile sheet open state changes */
  onOpenChange?: (open: boolean) => void
}

// ─── Component ─────────────────────────────────────────────────────

/**
 * Responsive sidebar that adapts to screen size.
 *
 * @example
 * <ResponsiveSidebar
 *   collapsedContent={<IconOnlyNav />}
 * >
 *   <FullNavigation />
 * </ResponsiveSidebar>
 */
export function ResponsiveSidebar({
  children,
  collapsedContent,
  className,
  width = 'w-64',
  collapsedWidth = 'w-16',
  trigger,
  side = 'left',
  open,
  onOpenChange
}: ResponsiveSidebarProps) {
  return (
    <>
      {/* Mobile: Sheet triggered by hamburger */}
      <div className="md:hidden">
        <Sheet open={open} onOpenChange={onOpenChange}>
          {trigger ? (
            <SheetTrigger render={trigger} />
          ) : (
            <SheetTrigger
              className={cn(
                'inline-flex items-center justify-center',
                'h-11 w-11 touch-target', // 44px touch target
                'rounded-md text-foreground-muted',
                'hover:bg-background-muted hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2',
                'focus-visible:ring-ring focus-visible:ring-offset-2'
              )}
            >
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle menu</span>
            </SheetTrigger>
          )}
          <SheetContent side={side} className="w-72 p-0">
            {children}
          </SheetContent>
        </Sheet>
      </div>

      {/* Tablet: Collapsible sidebar (icons only) */}
      <aside
        className={cn(
          'hidden md:flex lg:hidden',
          collapsedWidth,
          'flex-col border-r border-border',
          'bg-sidebar',
          className
        )}
      >
        {collapsedContent || children}
      </aside>

      {/* Desktop: Full sidebar */}
      <aside
        className={cn(
          'hidden lg:flex',
          width,
          'flex-col border-r border-border',
          'bg-sidebar',
          className
        )}
      >
        {children}
      </aside>
    </>
  )
}

// ─── Sub-components ────────────────────────────────────────────────

export interface SidebarHeaderProps {
  children: React.ReactNode
  className?: string
}

/** Header section of the sidebar */
export function SidebarHeader({ children, className }: SidebarHeaderProps) {
  return (
    <div className={cn('flex h-14 items-center border-b border-border px-4', className)}>
      {children}
    </div>
  )
}

export interface SidebarContentProps {
  children: React.ReactNode
  className?: string
}

/** Scrollable content area of the sidebar */
export function SidebarContent({ children, className }: SidebarContentProps) {
  return (
    <div className={cn('flex-1 overflow-y-auto scrollbar-thin py-2', className)}>{children}</div>
  )
}

export interface SidebarFooterProps {
  children: React.ReactNode
  className?: string
}

/** Footer section of the sidebar */
export function SidebarFooter({ children, className }: SidebarFooterProps) {
  return <div className={cn('border-t border-border p-4', className)}>{children}</div>
}

export interface SidebarNavProps {
  children: React.ReactNode
  className?: string
}

/** Navigation container within the sidebar */
export function SidebarNav({ children, className }: SidebarNavProps) {
  return <nav className={cn('flex flex-col gap-1 px-2', className)}>{children}</nav>
}

export interface SidebarNavItemProps {
  children: React.ReactNode
  icon?: React.ReactNode
  active?: boolean
  className?: string
  onClick?: () => void
  href?: string
}

/** Individual navigation item */
export function SidebarNavItem({
  children,
  icon,
  active,
  className,
  onClick,
  href
}: SidebarNavItemProps) {
  const Comp = href ? 'a' : 'button'

  return (
    <Comp
      href={href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2',
        'text-sm font-medium',
        'transition-colors',
        'touch-target', // 44px minimum
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
        className
      )}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span className="truncate">{children}</span>
    </Comp>
  )
}

export interface SidebarSectionProps {
  title?: string
  children: React.ReactNode
  className?: string
}

/** Section with optional title */
export function SidebarSection({ title, children, className }: SidebarSectionProps) {
  return (
    <div className={cn('py-2', className)}>
      {title && (
        <h3 className="mb-2 px-4 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60">
          {title}
        </h3>
      )}
      {children}
    </div>
  )
}
