import { Tabs as BaseTabs } from '@base-ui/react/tabs'
import * as React from 'react'
import { cn } from '../utils'

// ─── Tabs Root ─────────────────────────────────────────────────────

const Tabs = BaseTabs.Root

// ─── Tabs List ─────────────────────────────────────────────────────

const TabsList = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseTabs.List>
>(({ className, ...props }, ref) => (
  <BaseTabs.List
    ref={ref}
    className={cn(
      'inline-flex h-9 items-center justify-center',
      'rounded-lg bg-muted p-1',
      'text-muted-foreground',
      className
    )}
    {...props}
  />
))
TabsList.displayName = 'TabsList'

// ─── Tabs Tab (Trigger) ────────────────────────────────────────────

const TabsTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof BaseTabs.Tab>
>(({ className, ...props }, ref) => (
  <BaseTabs.Tab
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center',
      'whitespace-nowrap rounded-md px-3 py-1',
      'text-sm font-medium',
      'ring-offset-background',
      'transition-base',
      // Focus state
      'focus-visible:outline-none focus-visible:ring-2',
      'focus-visible:ring-ring focus-visible:ring-offset-2',
      // Disabled state
      'disabled:pointer-events-none disabled:opacity-50',
      // Selected state
      'data-[selected]:bg-background data-[selected]:text-foreground',
      'data-[selected]:shadow',
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = 'TabsTrigger'

// ─── Tabs Panel (Content) ──────────────────────────────────────────

const TabsContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseTabs.Panel>
>(({ className, ...props }, ref) => (
  <BaseTabs.Panel
    ref={ref}
    className={cn(
      'mt-2 ring-offset-background',
      'focus-visible:outline-none focus-visible:ring-2',
      'focus-visible:ring-ring focus-visible:ring-offset-2',
      // Animation
      'data-[hidden]:hidden',
      'animate-fade-in',
      className
    )}
    {...props}
  />
))
TabsContent.displayName = 'TabsContent'

export { Tabs, TabsList, TabsTrigger, TabsContent }
