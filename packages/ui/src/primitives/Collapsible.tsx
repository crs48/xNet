/**
 * Collapsible component built on Base UI
 *
 * A collapsible panel controlled by a button.
 */

import { Collapsible as BaseCollapsible } from '@base-ui/react/collapsible'
import * as React from 'react'
import { cn } from '../utils'

// ─── Collapsible Root ──────────────────────────────────────────────

const Collapsible = BaseCollapsible.Root

// ─── Collapsible Trigger ───────────────────────────────────────────

const CollapsibleTrigger = BaseCollapsible.Trigger

// ─── Collapsible Content ───────────────────────────────────────────

const CollapsibleContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseCollapsible.Panel>
>(({ className, ...props }, ref) => (
  <BaseCollapsible.Panel
    ref={ref}
    className={cn(
      'overflow-hidden',
      // Animation using Base UI data attributes
      'data-[open]:animate-collapsible-down',
      'data-[ending-style]:animate-collapsible-up',
      className
    )}
    {...props}
  />
))
CollapsibleContent.displayName = 'CollapsibleContent'

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
