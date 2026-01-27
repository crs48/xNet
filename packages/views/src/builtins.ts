/**
 * Built-in view registrations
 *
 * Registers the standard views (table, board, gallery, timeline, calendar)
 * with the ViewRegistry at startup.
 */

import React from 'react'
import { viewRegistry, type ViewProps, type ViewRegistration } from './registry.js'
import { TableView } from './table/TableView.js'
import { BoardView } from './board/BoardView.js'
import { GalleryView } from './gallery/GalleryView.js'
import { TimelineView } from './timeline/TimelineView.js'
import { CalendarView } from './calendar/CalendarView.js'

// ─── Adapter Components ─────────────────────────────────────────────────────
// These adapt the standard ViewProps to each view's specific prop interface

/**
 * Table view adapter
 */
function TableViewAdapter(props: ViewProps): React.JSX.Element {
  return React.createElement(TableView, {
    schema: props.schema,
    view: props.view,
    data: props.data,
    onUpdateView: props.onUpdateView,
    onUpdateRow: props.onUpdateRow,
    onAddRow: props.onCreateRow ? () => props.onCreateRow?.() : undefined,
    className: props.className
  })
}

/**
 * Board view adapter
 */
function BoardViewAdapter(props: ViewProps): React.JSX.Element {
  return React.createElement(BoardView, {
    schema: props.schema,
    view: props.view,
    data: props.data,
    onUpdateView: props.onUpdateView,
    onUpdateRow: props.onUpdateRow,
    onCardClick: props.onRowClick,
    onAddCard: props.onCreateRow ? (_columnId: string) => props.onCreateRow?.() : undefined,
    className: props.className
  })
}

/**
 * Gallery view adapter
 */
function GalleryViewAdapter(props: ViewProps): React.JSX.Element {
  return React.createElement(GalleryView, {
    schema: props.schema,
    view: props.view,
    data: props.data,
    onUpdateView: props.onUpdateView,
    onCardClick: props.onRowClick,
    onAddCard: props.onCreateRow ? () => props.onCreateRow?.() : undefined,
    className: props.className
  })
}

/**
 * Timeline view adapter
 */
function TimelineViewAdapter(props: ViewProps): React.JSX.Element {
  return React.createElement(TimelineView, {
    schema: props.schema,
    view: props.view,
    data: props.data,
    onUpdateView: props.onUpdateView,
    onItemClick: props.onRowClick,
    className: props.className
  })
}

/**
 * Calendar view adapter
 */
function CalendarViewAdapter(props: ViewProps): React.JSX.Element {
  return React.createElement(CalendarView, {
    schema: props.schema,
    view: props.view,
    data: props.data,
    onUpdateView: props.onUpdateView,
    onEventClick: props.onRowClick,
    onDateClick: props.onCreateRow ? (_date: Date) => props.onCreateRow?.() : undefined,
    className: props.className
  })
}

// ─── Built-in View Definitions ──────────────────────────────────────────────

const builtinViews: ViewRegistration[] = [
  {
    type: 'table',
    name: 'Table',
    icon: 'table',
    component: TableViewAdapter,
    description: 'Spreadsheet-like table with sorting and filtering',
    configFields: [
      {
        key: 'rowHeight',
        label: 'Row Height',
        type: 'select',
        options: [
          { label: 'Compact', value: 'compact' },
          { label: 'Normal', value: 'normal' },
          { label: 'Tall', value: 'tall' }
        ],
        defaultValue: 'normal'
      }
    ]
  },
  {
    type: 'board',
    name: 'Board',
    icon: 'columns',
    component: BoardViewAdapter,
    description: 'Kanban board with drag-and-drop',
    configFields: [
      {
        key: 'groupByProperty',
        label: 'Group By',
        type: 'property-select',
        required: true,
        description: 'Select property to group cards by (must be a select or status type)'
      }
    ]
  },
  {
    type: 'gallery',
    name: 'Gallery',
    icon: 'grid-3x3',
    component: GalleryViewAdapter,
    description: 'Card gallery with cover images',
    configFields: [
      {
        key: 'coverProperty',
        label: 'Cover Image',
        type: 'property-select',
        description: 'Property containing the cover image URL'
      },
      {
        key: 'galleryCardSize',
        label: 'Card Size',
        type: 'select',
        options: [
          { label: 'Small', value: 'small' },
          { label: 'Medium', value: 'medium' },
          { label: 'Large', value: 'large' }
        ],
        defaultValue: 'medium'
      },
      {
        key: 'galleryImageFit',
        label: 'Image Fit',
        type: 'select',
        options: [
          { label: 'Cover', value: 'cover' },
          { label: 'Contain', value: 'contain' }
        ],
        defaultValue: 'cover'
      },
      {
        key: 'galleryShowTitle',
        label: 'Show Title',
        type: 'checkbox',
        defaultValue: true
      }
    ]
  },
  {
    type: 'timeline',
    name: 'Timeline',
    icon: 'gantt-chart',
    component: TimelineViewAdapter,
    description: 'Gantt-style timeline view',
    configFields: [
      {
        key: 'dateProperty',
        label: 'Start Date',
        type: 'property-select',
        required: true,
        description: 'Property for the start date'
      },
      {
        key: 'endDateProperty',
        label: 'End Date',
        type: 'property-select',
        description: 'Property for the end date (optional for ranges)'
      }
    ]
  },
  {
    type: 'calendar',
    name: 'Calendar',
    icon: 'calendar',
    component: CalendarViewAdapter,
    description: 'Month/week/day calendar view',
    configFields: [
      {
        key: 'dateProperty',
        label: 'Date Field',
        type: 'property-select',
        required: true,
        description: 'Property containing the event date'
      }
    ]
  }
]

// ─── Registration ───────────────────────────────────────────────────────────

let registered = false

/**
 * Register all built-in views with the ViewRegistry
 *
 * This should be called once at application startup.
 * Safe to call multiple times (only registers once).
 *
 * @example
 * ```ts
 * import { registerBuiltinViews } from '@xnet/views'
 * registerBuiltinViews()
 * ```
 */
export function registerBuiltinViews(): void {
  if (registered) return
  registered = true

  for (const view of builtinViews) {
    viewRegistry.register(view)
  }
}

/**
 * Get the built-in view definitions (without registering)
 *
 * Useful for testing or custom registration.
 */
export function getBuiltinViews(): ViewRegistration[] {
  return [...builtinViews]
}
