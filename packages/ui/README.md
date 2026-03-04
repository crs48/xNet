# @xnetjs/ui

Shared UI primitives and composed components for xNet applications, built on Base UI and Tailwind CSS.

## Installation

```bash
pnpm add @xnetjs/ui
```

## Features

This is a standalone UI package with no `@xnetjs/*` dependencies.

### Primitives (Base UI)

Button, Input, Select, Checkbox, Badge, IconButton, Popover, Modal, Menu, Tooltip, Tabs, ScrollArea, Separator, Switch, Sheet, Accordion, Collapsible, ResizablePanel, Command

### Composed Components

DIDAvatar, DatePicker, ColorPicker, TagInput, SearchInput, EmptyState, Skeleton, MarkdownContent, ThemeToggle, TreeView, StatusDot, LogEntry, KeyValue, CodeBlock, DataTable, CommandPalette, SettingsView, Comments

### Hooks

`useClickOutside`, `useDebounce`, `useKeyboardShortcut`

### Theme

ThemeProvider with light/dark mode support, design tokens via CSS custom properties.

## Usage

```tsx
import { Button, Input, Modal, useKeyboardShortcut } from '@xnetjs/ui'

useKeyboardShortcut('mod+k', () => openSearch())

<Button variant="primary" size="md">Save</Button>
<Input placeholder="Search..." />
```

```tsx
import { ThemeProvider, ThemeToggle } from '@xnetjs/ui'
;<ThemeProvider>
  <ThemeToggle />
  <App />
</ThemeProvider>
```

```tsx
import { CommandPalette, DataTable, TreeView } from '@xnetjs/ui'

<CommandPalette commands={commands} />
<DataTable columns={columns} data={rows} />
<TreeView items={tree} onSelect={handleSelect} />
```

## Exports

```ts
// Main entry -- all primitives, components, hooks
import { Button, Modal, useDebounce } from '@xnetjs/ui'

// CSS tokens
import '@xnetjs/ui/tokens.css'

// Tailwind config preset
import { tailwindConfig } from '@xnetjs/ui/tailwind.config'
```

## Dependencies

- `@base-ui/react` -- Accessible headless UI primitives
- `class-variance-authority` -- Variant styling
- `clsx` + `tailwind-merge` -- Class name handling
- `cmdk` -- Command palette
- `lucide-react` -- Icons
- `react-resizable-panels` -- Resizable layouts
- `react-markdown` + `remark-gfm` -- Markdown rendering

## Testing

```bash
pnpm --filter @xnetjs/ui test
```
