/**
 * Built-in database views (exploration 0339) — registered through the
 * same ViewRegistry door plugins use. Table and Form are deliberately
 * absent: the grid engine (GridSurface) and the form share surface own
 * their own chrome in the database shell.
 */

import { BoardView } from './database-views/BoardView.js'
import { CalendarView } from './database-views/CalendarView.js'
import { DatabaseMapView } from './database-views/DatabaseMapView.js'
import { GalleryView } from './database-views/GalleryView.js'
import { ListView } from './database-views/ListView.js'
import { TimelineView } from './database-views/TimelineView.js'
import { viewRegistry, type ViewRegistration } from './registry.js'
import type { Disposable } from './types.js'

const CARD_SIZE_OPTIONS = [
  { label: 'Small', value: 'small' },
  { label: 'Medium', value: 'medium' },
  { label: 'Large', value: 'large' }
]

const COVER_FIT_OPTIONS = [
  { label: 'Crop', value: 'cover' },
  { label: 'Fit', value: 'contain' }
]

export const builtinViews: ViewRegistration[] = [
  {
    type: 'board',
    name: 'Board',
    icon: 'square-kanban',
    component: BoardView,
    description: 'Kanban stacks grouped by a select field',
    configFields: [
      {
        key: 'groupBy',
        label: 'Group by',
        type: 'field-select',
        fieldTypes: ['select', 'multiSelect'],
        required: true
      },
      { key: 'colorBy', label: 'Color by', type: 'field-select', fieldTypes: ['select'] },
      { key: 'coverField', label: 'Card cover', type: 'field-select', fieldTypes: ['file'] }
    ]
  },
  {
    type: 'gallery',
    name: 'Gallery',
    icon: 'layout-grid',
    component: GalleryView,
    description: 'Cards with cover images',
    configFields: [
      { key: 'coverField', label: 'Cover', type: 'field-select', fieldTypes: ['file'] },
      { key: 'coverFit', label: 'Image fit', type: 'select', options: COVER_FIT_OPTIONS },
      { key: 'cardSize', label: 'Card size', type: 'select', options: CARD_SIZE_OPTIONS }
    ]
  },
  {
    type: 'calendar',
    name: 'Calendar',
    icon: 'calendar',
    component: CalendarView,
    description: 'Month grid positioned by a date field',
    configFields: [
      {
        key: 'dateField',
        label: 'Date',
        type: 'field-select',
        fieldTypes: ['date', 'dateRange'],
        required: true
      },
      { key: 'endDateField', label: 'End date', type: 'field-select', fieldTypes: ['date'] },
      { key: 'colorBy', label: 'Color by', type: 'field-select', fieldTypes: ['select'] }
    ]
  },
  {
    type: 'timeline',
    name: 'Timeline',
    icon: 'chart-gantt',
    component: TimelineView,
    description: 'Roadmap bars over a time axis, swimlanes by group',
    configFields: [
      {
        key: 'dateField',
        label: 'Start',
        type: 'field-select',
        fieldTypes: ['date', 'dateRange'],
        required: true
      },
      { key: 'endDateField', label: 'End', type: 'field-select', fieldTypes: ['date'] },
      {
        key: 'groupBy',
        label: 'Swimlanes',
        type: 'field-select',
        fieldTypes: ['select', 'multiSelect']
      },
      { key: 'colorBy', label: 'Color by', type: 'field-select', fieldTypes: ['select'] }
    ]
  },
  {
    type: 'list',
    name: 'List',
    icon: 'list',
    component: ListView,
    description: 'Compact stacked list, optionally grouped',
    configFields: [
      {
        key: 'groupBy',
        label: 'Group by',
        type: 'field-select',
        fieldTypes: ['select', 'multiSelect']
      }
    ]
  },
  {
    type: 'map',
    name: 'Map',
    icon: 'map',
    component: DatabaseMapView,
    description: 'Rows as pins, bound by lat/lng number fields',
    configFields: [
      {
        key: 'latField',
        label: 'Latitude',
        type: 'field-select',
        fieldTypes: ['number'],
        required: true
      },
      {
        key: 'lngField',
        label: 'Longitude',
        type: 'field-select',
        fieldTypes: ['number'],
        required: true
      }
    ]
  }
]

/**
 * Register all built-in views on the global registry. Returns one
 * Disposable that unregisters everything.
 */
export function registerBuiltinViews(): Disposable {
  const disposables = builtinViews.map((view) => viewRegistry.register(view))
  return {
    dispose: () => {
      for (const d of disposables) d.dispose()
    }
  }
}

/** The built-in registrations (without registering them). */
export function getBuiltinViews(): ViewRegistration[] {
  return [...builtinViews]
}
