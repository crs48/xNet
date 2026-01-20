# @xnet/ui

Shared UI primitives for xNet applications, built on Radix UI.

## Overview

Provides accessible, unstyled UI components:

- **Primitives**: Button, Input, Select, Checkbox, Modal, Menu, Tooltip, Popover
- **Components**: DatePicker, ColorPicker, TagInput, SearchInput, EmptyState
- **Hooks**: useClickOutside, useDebounce, useKeyboardShortcut

## Installation

```bash
pnpm add @xnet/ui
```

## Usage

```typescript
import { Button, Input, Modal, useKeyboardShortcut } from '@xnet/ui'

// Use keyboard shortcuts
useKeyboardShortcut('mod+k', () => openSearch())

// Primitives work with Tailwind
<Button variant="primary" size="md">Save</Button>
<Input placeholder="Search..." />
```

## Dependencies

- Radix UI primitives (@radix-ui/react-\*)
- clsx + tailwind-merge for className handling

## Status

**Scaffold only** - Components are defined but not fully implemented. This package will be built out as views are implemented.

## Testing

```bash
pnpm test
```
