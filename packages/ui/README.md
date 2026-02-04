# @xnet/ui

Shared UI primitives and composed components for xNet applications, built on Radix UI and Tailwind CSS.

## Installation

```bash
pnpm add @xnet/ui
```

## Features

This is a standalone UI package with no `@xnet/*` dependencies.

### Primitives (Radix UI)

Button, Input, Select, Checkbox, Badge, IconButton, Popover, Modal, Menu, Tooltip, Tabs, ScrollArea, Separator, Switch, Sheet, Accordion, Collapsible, ResizablePanel, Command

### Composed Components

DIDAvatar, DatePicker, ColorPicker, TagInput, SearchInput, EmptyState, Skeleton, MarkdownContent, ThemeToggle, TreeView, StatusDot, LogEntry, KeyValue, CodeBlock, DataTable, CommandPalette, SettingsView, Comments

### Hooks

`useClickOutside`, `useDebounce`, `useKeyboardShortcut`

### Theme

ThemeProvider with light/dark mode support, design tokens via CSS custom properties.

## Usage

```tsx
import { Button, Input, Modal, useKeyboardShortcut } from '@xnet/ui'

useKeyboardShortcut('mod+k', () => openSearch())

<Button variant="primary" size="md">Save</Button>
<Input placeholder="Search..." />
```

```tsx
import { ThemeProvider, ThemeToggle } from '@xnet/ui'

;<ThemeProvider>
  <ThemeToggle />
  <App />
</ThemeProvider>
```

```tsx
import { CommandPalette, DataTable, TreeView } from '@xnet/ui'

<CommandPalette commands={commands} />
<DataTable columns={columns} data={rows} />
<TreeView items={tree} onSelect={handleSelect} />
```

## Exports

```ts
// Main entry -- all primitives, components, hooks
import { Button, Modal, useDebounce } from '@xnet/ui'

// CSS tokens
import '@xnet/ui/tokens.css'

// Tailwind config preset
import { tailwindConfig } from '@xnet/ui/tailwind.config'
```

## Dependencies

- `@radix-ui/react-*` -- Accessible UI primitives
- `class-variance-authority` -- Variant styling
- `clsx` + `tailwind-merge` -- Class name handling
- `cmdk` -- Command palette
- `lucide-react` -- Icons
- `react-resizable-panels` -- Resizable layouts
- `react-markdown` + `remark-gfm` -- Markdown rendering

## Testing

```bash
pnpm --filter @xnet/ui test
```
