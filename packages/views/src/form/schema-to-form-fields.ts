/**
 * Schema → form fields adapter (exploration 0190).
 *
 * The *write* counterpart of `schemaToGridFields`. Where the grid adapter
 * produces columns for a table, this produces an ordered list of fields for a
 * stacked detail/edit form (the `NodeInspector` / `SchemaForm`). It reuses the
 * exact same `GridField` shape — and therefore the exact same per-type cell
 * editors via `getPropertyHandler` — so a node never needs a hand-coded form:
 * adding a property to a schema makes it editable everywhere automatically.
 *
 * On top of the grid mapping it adds three layout affordances a form needs but
 * a grid does not:
 *  - `highlight`: pin a field to the inspector header (Salesforce "highlights").
 *  - `group`: section label, so related fields cluster ("Address", "Forecast").
 *  - explicit `order` + `hidden`, so a domain surface can reorder/suppress
 *    fields without forking the schema.
 */

import type { GridField } from '../grid/model.js'
import type { Schema } from '@xnetjs/data'
import {
  schemaToGridFields,
  type SchemaToGridFieldsOptions
} from '../grid/schema-to-grid-fields.js'

export interface FormField extends GridField {
  /** Rendered in the pinned header zone of the inspector. */
  highlight?: boolean
  /** Optional section label for grouped forms. */
  group?: string
}

export interface SchemaToFormOptions extends SchemaToGridFieldsOptions {
  /** Field keys to pin to the form/inspector header. */
  highlights?: string[]
  /** Field keys to hide entirely (in addition to the always-internal set). */
  hidden?: string[]
  /** Explicit field ordering; unlisted fields keep schema order, after these. */
  order?: string[]
  /** Field key → section label. */
  groups?: Record<string, string>
  /**
   * Hide structural/internal plumbing fields that should never appear in a
   * human edit form. Default true.
   */
  hideInternal?: boolean
}

/**
 * Structural plumbing hidden by default everywhere (the grid may still show
 * these as columns). Note `source` is deliberately NOT here: it is
 * domain-meaningful for some types (Deal lead source, Activity direction) and
 * only plumbing for others (Task) — those callers hide it via `hidden`.
 */
const INTERNAL_FIELDS = new Set([
  'sortKey',
  'shortId',
  'anchorBlockId',
  'externalId',
  'piiErasedAt'
])

/**
 * Convert a schema into ordered form fields, reusing the grid field mapping so
 * the same cell editors render. Auto fields (created/updated/createdBy) are
 * hidden by default since they are not editable.
 */
export function schemaToFormFields(schema: Schema, options: SchemaToFormOptions = {}): FormField[] {
  const { highlights, hidden, order, groups, hideInternal = true, ...gridOptions } = options

  const hiddenKeys = new Set(hidden ?? [])
  if (hideInternal) for (const key of INTERNAL_FIELDS) hiddenKeys.add(key)

  // Forms default to hiding auto-populated fields (created/updated/createdBy);
  // a caller can opt back in via `hideAutoFields: false`.
  const gridFields = schemaToGridFields(schema, {
    hideAutoFields: gridOptions.hideAutoFields ?? true,
    ...(gridOptions.titleField ? { titleField: gridOptions.titleField } : {})
  })

  const highlightSet = new Set(highlights ?? [])

  const fields: FormField[] = gridFields
    .filter((f) => !hiddenKeys.has(f.id))
    .map((f) => ({
      ...f,
      ...(highlightSet.has(f.id) ? { highlight: true } : {}),
      ...(groups?.[f.id] ? { group: groups[f.id] } : {})
    }))

  if (!order || order.length === 0) return fields

  const rank = new Map(order.map((key, index) => [key, index]))
  const ranked = (f: FormField): number => rank.get(f.id) ?? order.length + 1
  // Stable sort: ordered fields first (in declared order), then the rest in
  // their original schema order.
  return fields
    .map((field, index) => ({ field, index }))
    .sort((a, b) => {
      const ra = ranked(a.field)
      const rb = ranked(b.field)
      return ra === rb ? a.index - b.index : ra - rb
    })
    .map((entry) => entry.field)
}
