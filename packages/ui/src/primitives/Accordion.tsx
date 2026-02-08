/**
 * Accordion component built on Base UI
 *
 * A set of collapsible panels with headings.
 */

import { Accordion as BaseAccordion } from '@base-ui/react/accordion'
import { ChevronDown } from 'lucide-react'
import * as React from 'react'
import { cn } from '../utils'

// ─── Type Definitions ──────────────────────────────────────────────

export interface AccordionProps extends Omit<
  React.ComponentPropsWithoutRef<typeof BaseAccordion.Root>,
  'defaultValue'
> {
  /** Backward compat: 'single' or 'multiple' */
  type?: 'single' | 'multiple'
  /** Backward compat: whether single accordion can be fully collapsed */
  collapsible?: boolean
  /** Default expanded item(s) */
  defaultValue?: string | string[]
}

// ─── Accordion Root ────────────────────────────────────────────────

const Accordion = React.forwardRef<HTMLDivElement, AccordionProps>(
  ({ type, collapsible: _collapsible, defaultValue, className, ...props }, ref) => {
    // Convert Radix-style API to Base UI
    const multiple = type === 'multiple'
    const normalizedDefaultValue = defaultValue
      ? Array.isArray(defaultValue)
        ? defaultValue
        : [defaultValue]
      : undefined

    return (
      <BaseAccordion.Root
        ref={ref}
        multiple={multiple}
        defaultValue={normalizedDefaultValue}
        className={cn('w-full', className)}
        {...props}
      />
    )
  }
)
Accordion.displayName = 'Accordion'

// ─── Accordion Item ────────────────────────────────────────────────

const AccordionItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseAccordion.Item>
>(({ className, ...props }, ref) => (
  <BaseAccordion.Item ref={ref} className={cn('border-b border-border', className)} {...props} />
))
AccordionItem.displayName = 'AccordionItem'

// ─── Accordion Trigger ─────────────────────────────────────────────

const AccordionTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof BaseAccordion.Trigger>
>(({ className, children, ...props }, ref) => (
  <BaseAccordion.Header className="flex">
    <BaseAccordion.Trigger
      ref={ref}
      className={cn(
        'flex flex-1 items-center justify-between',
        'py-4 text-sm font-medium text-left',
        'transition-base',
        'hover:underline',
        // Chevron rotation using Base UI data attribute
        '[&>svg]:transition-transform [&>svg]:duration-slow',
        '[&[data-panel-open]>svg]:rotate-180',
        className
      )}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 shrink-0 text-foreground-muted" />
    </BaseAccordion.Trigger>
  </BaseAccordion.Header>
))
AccordionTrigger.displayName = 'AccordionTrigger'

// ─── Accordion Content ─────────────────────────────────────────────

const AccordionContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseAccordion.Panel>
>(({ className, children, ...props }, ref) => (
  <BaseAccordion.Panel
    ref={ref}
    className={cn(
      'overflow-hidden text-sm',
      // Animation using Base UI data attributes
      'data-[open]:animate-accordion-down',
      'data-[ending-style]:animate-accordion-up',
      className
    )}
    {...props}
  >
    <div className="pb-4 pt-0">{children}</div>
  </BaseAccordion.Panel>
))
AccordionContent.displayName = 'AccordionContent'

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
