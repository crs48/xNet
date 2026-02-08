/**
 * SkipLink - Accessibility skip navigation link
 *
 * Allows keyboard users to skip repetitive navigation and jump
 * directly to main content. Hidden until focused.
 */

import * as React from 'react'
import { cn } from '../utils'

// ─── Types ─────────────────────────────────────────────────────────

export interface SkipLinkProps {
  /** Target element ID to skip to (default: #main-content) */
  href?: string
  /** Link text (default: Skip to main content) */
  children?: React.ReactNode
  /** Additional class names */
  className?: string
}

// ─── Component ─────────────────────────────────────────────────────

/**
 * Skip link for keyboard navigation.
 *
 * Place at the very beginning of your page, before any navigation.
 * The link is hidden until focused via keyboard.
 *
 * @example
 * // In your layout component:
 * <body>
 *   <SkipLink />
 *   <nav>...</nav>
 *   <main id="main-content">...</main>
 * </body>
 *
 * @example
 * // Custom target and text:
 * <SkipLink href="#article-content">
 *   Skip to article
 * </SkipLink>
 */
export function SkipLink({
  href = '#main-content',
  children = 'Skip to main content',
  className
}: SkipLinkProps) {
  return (
    <a href={href} className={cn('skip-link', className)}>
      {children}
    </a>
  )
}

// ─── Multiple Skip Links ───────────────────────────────────────────

export interface SkipLinksProps {
  /** Array of skip link targets */
  links: Array<{
    href: string
    label: string
  }>
  /** Additional class names */
  className?: string
}

/**
 * Multiple skip links for complex pages.
 *
 * @example
 * <SkipLinks
 *   links={[
 *     { href: '#main-content', label: 'Skip to main content' },
 *     { href: '#navigation', label: 'Skip to navigation' },
 *     { href: '#search', label: 'Skip to search' },
 *   ]}
 * />
 */
export function SkipLinks({ links, className }: SkipLinksProps) {
  return (
    <div className={cn('skip-links', className)}>
      {links.map((link) => (
        <a key={link.href} href={link.href} className="skip-link">
          {link.label}
        </a>
      ))}
    </div>
  )
}
