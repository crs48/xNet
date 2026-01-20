# @xnet/views

Database view components for xNet applications.

## Overview

Provides multiple ways to visualize database items:

- **Table** - Spreadsheet with virtual scrolling (TanStack Table)
- **Board** - Kanban with drag-drop (dnd-kit)
- **Gallery** - Card grid with cover images
- **Timeline** - Gantt chart with dependencies
- **Calendar** - Month/week/day views
- **List** - Simple list with grouping

## Status

**Not yet implemented** - This is a scaffold package.

## Planned Structure

```
src/
  table/      # TanStack Table integration
  board/      # Kanban board with dnd-kit
  gallery/    # Card-based gallery
  timeline/   # Gantt-style timeline
  calendar/   # Calendar views
  shared/     # Common components (filters, sorts)
```

## Dependencies

- @tanstack/react-table - Table virtualization
- @tanstack/react-virtual - Virtual scrolling
- @dnd-kit/core - Drag and drop
- @xnet/records - Property types and data

## Installation

```bash
pnpm add @xnet/views
```

## Testing

```bash
pnpm test
```
