/**
 * BottomNav - Mobile bottom navigation bar
 *
 * Fixed bottom navigation for mobile devices with touch-friendly
 * targets and iOS safe area support.
 */

import * as React from 'react'
import { cn } from '../utils'

// ─── Types ─────────────────────────────────────────────────────────

export interface BottomNavItem {
  /** Icon element to display */
  icon: React.ReactNode
  /** Label text below the icon */
  label: string
  /** Link href (renders as anchor) */
  href?: string
  /** Click handler (renders as button) */
  onClick?: () => void
  /** Whether this item is currently active */
  active?: boolean
  /** Badge count to display */
  badge?: number
  /** Disable the item */
  disabled?: boolean
}

export interface BottomNavProps {
  /** Navigation items to display */
  items: BottomNavItem[]
  /** Additional class names */
  className?: string
  /** Maximum number of items (default: 5) */
  maxItems?: number
}

// ─── Component ─────────────────────────────────────────────────────

/**
 * Mobile bottom navigation bar.
 *
 * Only visible on mobile (< md breakpoint). Includes iOS safe area
 * padding and touch-friendly 56px minimum height items.
 *
 * @example
 * <BottomNav
 *   items={[
 *     { icon: <Home />, label: 'Home', href: '/', active: true },
 *     { icon: <Search />, label: 'Search', href: '/search' },
 *     { icon: <Bell />, label: 'Alerts', href: '/alerts', badge: 3 },
 *     { icon: <User />, label: 'Profile', href: '/profile' },
 *   ]}
 * />
 */
export function BottomNav({ items, className, maxItems = 5 }: BottomNavProps) {
  // Limit items to maxItems
  const displayItems = items.slice(0, maxItems)

  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50',
        'md:hidden', // Only show on mobile
        'border-t border-border bg-background',
        'safe-area-inset-bottom', // iOS safe area
        className
      )}
      role="navigation"
      aria-label="Bottom navigation"
    >
      <div className="flex items-center justify-around">
        {displayItems.map((item, index) => (
          <BottomNavButton key={index} item={item} />
        ))}
      </div>
    </nav>
  )
}

// ─── Internal Components ───────────────────────────────────────────

interface BottomNavButtonProps {
  item: BottomNavItem
}

function BottomNavButton({ item }: BottomNavButtonProps) {
  const Comp = item.href ? 'a' : 'button'

  return (
    <Comp
      href={item.href}
      onClick={item.onClick}
      disabled={item.disabled}
      className={cn(
        'relative flex flex-col items-center justify-center',
        'min-h-[56px] min-w-[64px] px-3 py-2', // Touch-friendly
        'text-xs',
        'transition-colors',
        'tap-highlight-none', // Remove tap highlight on mobile
        item.disabled && 'pointer-events-none opacity-50',
        item.active
          ? 'text-primary'
          : 'text-foreground-muted hover:text-foreground active:text-foreground'
      )}
      aria-current={item.active ? 'page' : undefined}
    >
      {/* Icon container with badge */}
      <span className="relative mb-1">
        {item.icon}
        {item.badge !== undefined && item.badge > 0 && (
          <span
            className={cn(
              'absolute -right-2 -top-1',
              'flex h-4 min-w-4 items-center justify-center',
              'rounded-full bg-destructive px-1',
              'text-[10px] font-medium text-destructive-foreground'
            )}
          >
            {item.badge > 99 ? '99+' : item.badge}
          </span>
        )}
      </span>
      <span className="truncate max-w-[64px]">{item.label}</span>
    </Comp>
  )
}

// ─── Spacer Component ──────────────────────────────────────────────

export interface BottomNavSpacerProps {
  className?: string
}

/**
 * Spacer to prevent content from being hidden behind BottomNav.
 *
 * Add this at the bottom of your scrollable content area.
 *
 * @example
 * <main>
 *   <Content />
 *   <BottomNavSpacer />
 * </main>
 * <BottomNav items={items} />
 */
export function BottomNavSpacer({ className }: BottomNavSpacerProps) {
  return (
    <div
      className={cn(
        'h-[72px] md:h-0', // 56px nav + 16px padding
        'safe-area-margin-bottom',
        className
      )}
      aria-hidden="true"
    />
  )
}
