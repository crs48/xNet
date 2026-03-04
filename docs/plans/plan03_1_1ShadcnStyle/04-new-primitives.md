# 04 - New Primitives

> Add Tabs, ScrollArea, Sheet, Separator, Command, Switch, Accordion, Collapsible, ResizablePanel

## Overview

These components are needed by the devtools (plan03_2_2), the editor (plan03_3), and general app UI. Each follows the shadcn pattern: Radix primitive + Tailwind styling + semantic tokens + `cn()` pass-through.

## New Dependencies

```bash
pnpm --filter @xnetjs/ui add \
  @radix-ui/react-tabs \
  @radix-ui/react-scroll-area \
  @radix-ui/react-separator \
  @radix-ui/react-switch \
  @radix-ui/react-accordion \
  @radix-ui/react-collapsible \
  react-resizable-panels \
  cmdk
```

## Component Specifications

### Tabs

**Used by:** DevTools panel navigation, settings pages.

```typescript
// primitives/Tabs.tsx
import * as TabsPrimitive from '@radix-ui/react-tabs'

const Tabs = TabsPrimitive.Root

const TabsList = forwardRef<...>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground',
      className
    )}
    {...props}
  />
))

const TabsTrigger = forwardRef<...>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow',
      className
    )}
    {...props}
  />
))

const TabsContent = forwardRef<...>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      className
    )}
    {...props}
  />
))

export { Tabs, TabsList, TabsTrigger, TabsContent }
```

### ScrollArea

**Used by:** DevTools event logs, Node Explorer, any scrollable list.

```typescript
// primitives/ScrollArea.tsx
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'

const ScrollArea = forwardRef<...>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={cn('relative overflow-hidden', className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
))

const ScrollBar = forwardRef<...>(({ className, orientation = 'vertical', ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      'flex touch-none select-none transition-colors',
      orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent p-[1px]',
      orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent p-[1px]',
      className
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
))

export { ScrollArea, ScrollBar }
```

### Separator

**Used by:** DevTools panels, form sections, menu dividers.

```typescript
// primitives/Separator.tsx
import * as SeparatorPrimitive from '@radix-ui/react-separator'

const Separator = forwardRef<...>(
  ({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => (
    <SeparatorPrimitive.Root
      ref={ref}
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
        className
      )}
      {...props}
    />
  )
)

export { Separator }
```

### Switch

**Used by:** Settings toggles, theme toggle, devtools options.

```typescript
// primitives/Switch.tsx
import * as SwitchPrimitive from '@radix-ui/react-switch'

const Switch = forwardRef<...>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    className={cn(
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitive.Thumb
      className="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
    />
  </SwitchPrimitive.Root>
))

export { Switch }
```

### Sheet (Slide-out Panel)

**Used by:** Mobile navigation, settings panels, devtools on mobile.

```typescript
// primitives/Sheet.tsx
import * as SheetPrimitive from '@radix-ui/react-dialog'

const sheetVariants = cva(
  'fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out',
  {
    variants: {
      side: {
        top: 'inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
        bottom:
          'inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
        left: 'inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm',
        right:
          'inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm'
      }
    },
    defaultVariants: {
      side: 'right'
    }
  }
)

export { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription }
```

### Accordion

**Used by:** Settings, FAQ sections, collapsible property groups.

```typescript
// primitives/Accordion.tsx
import * as AccordionPrimitive from '@radix-ui/react-accordion'

const AccordionItem = forwardRef<...>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    className={cn('border-b', className)}
    {...props}
  />
))

const AccordionTrigger = forwardRef<...>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        'flex flex-1 items-center justify-between py-4 text-sm font-medium transition-all hover:underline text-left [&[data-state=open]>svg]:rotate-180',
        className
      )}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200" />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
))

const AccordionContent = forwardRef<...>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}
  >
    <div className={cn('pb-4 pt-0', className)}>{children}</div>
  </AccordionPrimitive.Content>
))

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
```

### Collapsible

**Used by:** Devtools tree views, sidebar sections.

```typescript
// primitives/Collapsible.tsx
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible'

const Collapsible = CollapsiblePrimitive.Root
const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger
const CollapsibleContent = CollapsiblePrimitive.CollapsibleContent

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
```

### ResizablePanel

**Used by:** DevTools shell (resizable bottom/side panel).

```typescript
// primitives/ResizablePanel.tsx
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'

function ResizablePanelGroup({ className, ...props }) {
  return (
    <PanelGroup
      className={cn('flex h-full w-full data-[panel-group-direction=vertical]:flex-col', className)}
      {...props}
    />
  )
}

function ResizablePanel({ className, ...props }) {
  return <Panel className={cn(className)} {...props} />
}

function ResizableHandle({ className, withHandle, ...props }) {
  return (
    <PanelResizeHandle
      className={cn(
        'relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0 [&[data-panel-group-direction=vertical]>div]:rotate-90',
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
          <GripVertical className="h-2.5 w-2.5" />
        </div>
      )}
    </PanelResizeHandle>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
```

### Command (Command Palette)

**Used by:** Slash commands in editor, app-wide command palette.

```typescript
// primitives/Command.tsx
import { Command as CommandPrimitive } from 'cmdk'

const Command = forwardRef<...>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      'flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground',
      className
    )}
    {...props}
  />
))

const CommandInput = forwardRef<...>(({ className, ...props }, ref) => (
  <div className="flex items-center border-b px-3" cmdk-input-wrapper="">
    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  </div>
))

const CommandItem = forwardRef<...>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-default gap-2 select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
      className
    )}
    {...props}
  />
))

export { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator }
```

## Checklist

- [ ] Install all new Radix packages + react-resizable-panels + cmdk
- [ ] Implement Tabs (TabsList, TabsTrigger, TabsContent)
- [ ] Implement ScrollArea + ScrollBar
- [ ] Implement Separator
- [ ] Implement Switch
- [ ] Implement Sheet with side variants
- [ ] Implement Accordion (Item, Trigger, Content)
- [ ] Implement Collapsible
- [ ] Implement ResizablePanel (Group, Panel, Handle)
- [ ] Implement Command (Input, List, Item, Group, Empty)
- [ ] Export all new primitives from package index
- [ ] Verify all components render in light mode
- [ ] Verify all components render in dark mode
- [ ] Write basic render tests for each new primitive

---

[Previous: Primitive Migration](./03-primitive-migration.md) | [Next: App Theming](./05-app-theming.md)
