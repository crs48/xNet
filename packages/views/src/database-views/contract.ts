/**
 * V2 database-view contract (exploration 0339).
 *
 * Every non-grid database view (board, gallery, calendar, timeline, list,
 * map) renders from the same prop shape, derived by the app shell from
 * `useGridDatabase`: the grid's field/row models plus the per-view
 * presentation config persisted on the DatabaseView node. Views stay
 * store-agnostic — models in, mutation callbacks out — exactly like
 * GridSurface.
 *
 * Date semantics: date cells store "floating" wall-clock dates
 * (`YYYY-MM-DD`, no timezone). Calendar/timeline views parse and compare
 * them as local dates and never convert through UTC — a task due
 * 2026-03-14 is due March 14 everywhere. See the exploration's
 * "timezone semantics" decision.
 */

import type { GridField } from '../grid/model.js'
import type { CellValue, FileRef, MapViewport, ViewGroupMeta } from '@xnetjs/data'

// ─── Rows and windowing ─────────────────────────────────────────────────────

export interface DatabaseViewRow {
  id: string
  /** Fractional row order (code-unit collation) — card order within groups */
  sortKey: string
  cells: Record<string, CellValue>
}

/**
 * Honesty about the fetched window (exploration 0318): views render at
 * most `size` rows; when `total` is known and larger, grouped views must
 * say so ("12 of 340") instead of silently truncating.
 */
export interface DatabaseViewWindow {
  /** Rows available to the view (after filter/sort, capped by the fetch window) */
  size: number
  /** Total matching rows when known; null when the total is unknown */
  total: number | null
}

// ─── Per-view presentation config ───────────────────────────────────────────

export type CardSize = 'small' | 'medium' | 'large'
export type CoverFit = 'cover' | 'contain'

/** Presentation config persisted on the DatabaseView node. */
export interface DatabaseViewConfig {
  groupBy: string | null
  collapsedGroups: string[]
  groupMeta: Record<string, ViewGroupMeta>
  coverField: string | null
  cardSize: CardSize | null
  coverFit: CoverFit | null
  colorBy: string | null
  dateField: string | null
  endDateField: string | null
  latField: string | null
  lngField: string | null
  mapViewport: MapViewport | null
}

export const EMPTY_VIEW_CONFIG: DatabaseViewConfig = {
  groupBy: null,
  collapsedGroups: [],
  groupMeta: {},
  coverField: null,
  cardSize: null,
  coverFit: null,
  colorBy: null,
  dateField: null,
  endDateField: null,
  latField: null,
  lngField: null,
  mapViewport: null
}

// ─── View props ─────────────────────────────────────────────────────────────

export interface DatabaseViewProps {
  /** All fields (config pickers offer hidden ones too) */
  fields: GridField[]
  /** Fields visible in this view, view order applied */
  visibleFields: GridField[]
  /** Rows after view filters/sorts, capped by the fetch window */
  rows: DatabaseViewRow[]
  window: DatabaseViewWindow
  config: DatabaseViewConfig
  /** True when the active view has explicit sorts (manual reorder disabled) */
  sorted?: boolean
  /** Tile-constrained rendering (dashboard widgets, compact shells) */
  compact?: boolean
  className?: string

  /** Patch the view's presentation config (one LWW write per patch) */
  onPatchConfig?: (patch: Partial<DatabaseViewConfig>) => void
  /** Persist one cell edit */
  onUpdateCell?: (rowId: string, fieldId: string, value: CellValue) => void
  /**
   * Move a card between groups and/or reposition it: writes the group
   * cell and the fractional sortKey as ONE node update.
   */
  onMoveCard?: (
    rowId: string,
    cells: Record<string, CellValue>,
    opts?: { sortKey?: string }
  ) => void
  /** Persist a group's collapsed state */
  onToggleGroupCollapsed?: (groupKey: string, collapsed: boolean) => void
  /** Open the row (peek panel / detail route) */
  onOpenRow?: (rowId: string) => void
  /** Create a row, optionally pre-filled (e.g. the column's group value) */
  onCreateRow?: (cells?: Record<string, CellValue>) => void
  /** Create a select option (board "+ Add group") */
  onCreateOption?: (fieldId: string, name: string) => Promise<string | null>
  /** Resolve a FileRef to a displayable URL (covers, thumbnails) */
  onResolveFileUrl?: (ref: FileRef) => Promise<string>
  /** Resolve a ref's small preview, preferred over the full file (0385 W4) */
  onResolveThumbUrl?: (ref: FileRef) => Promise<string | null>
  /**
   * Map views: the visible `[west, south, east, north]` bounds changed.
   * The shell feeds this back as a spatial query window so only visible
   * rows are fetched.
   */
  onBoundsChange?: (bounds: [number, number, number, number]) => void
}

// ─── Config field defaults ──────────────────────────────────────────────────

/** First field of one of the given types, if any. */
export function firstFieldOfType(fields: GridField[], types: string[]): GridField | undefined {
  return fields.find((f) => types.includes(f.type))
}

/**
 * Effective group-by field for board/timeline: the configured field when
 * it exists and is groupable, else the first select field.
 */
export function resolveGroupField(
  fields: GridField[],
  config: DatabaseViewConfig
): GridField | undefined {
  if (config.groupBy) {
    const configured = fields.find((f) => f.id === config.groupBy)
    if (configured && (configured.type === 'select' || configured.type === 'multiSelect')) {
      return configured
    }
  }
  return firstFieldOfType(fields, ['select'])
}

/** Effective date field for calendar/timeline: configured, else first date-ish. */
export function resolveDateField(
  fields: GridField[],
  config: DatabaseViewConfig
): GridField | undefined {
  if (config.dateField) {
    const configured = fields.find((f) => f.id === config.dateField)
    if (configured) return configured
  }
  return firstFieldOfType(fields, ['date', 'dateRange'])
}

/** Effective end-date field for timeline ranges (never the start field). */
export function resolveEndDateField(
  fields: GridField[],
  config: DatabaseViewConfig,
  startField: GridField | undefined
): GridField | undefined {
  if (config.endDateField) {
    const configured = fields.find((f) => f.id === config.endDateField)
    if (configured && configured.id !== startField?.id) return configured
  }
  if (startField?.type === 'dateRange') return undefined
  return fields.find((f) => f.type === 'date' && f.id !== startField?.id)
}

/** Effective cover field for gallery/board cards: configured, else first file. */
export function resolveCoverField(
  fields: GridField[],
  config: DatabaseViewConfig
): GridField | undefined {
  if (config.coverField) {
    const configured = fields.find((f) => f.id === config.coverField)
    if (configured) return configured
  }
  return firstFieldOfType(fields, ['file'])
}

const LAT_NAMES = ['lat', 'latitude']
const LNG_NAMES = ['lng', 'lon', 'long', 'longitude']

/** The map view's resolved location binding: ONE geo field, or a lat/lng pair. */
export interface ResolvedGeoBinding {
  /** First-class geo field — set iff the binding is a single geo column */
  geo: GridField | undefined
  lat: GridField | undefined
  lng: GridField | undefined
}

/**
 * Effective location binding for the map view. A first-class `geo` field
 * is preferred over the lat/lng number-pair convention (0339, Map
 * sub-decision B): a geo field configured in either slot wins outright,
 * an explicitly configured pair is honored next, then any geo field,
 * then the lat/lng name convention. No view-config migration — `latField`
 * doubles as the geo-field slot.
 */
export function resolveGeoFields(
  fields: GridField[],
  config: DatabaseViewConfig
): ResolvedGeoBinding {
  const byId = (id: string | null) => (id ? fields.find((f) => f.id === id) : undefined)
  const numberByName = (names: string[]) =>
    fields.find((f) => f.type === 'number' && names.includes(f.name.trim().toLowerCase()))

  const configuredLat = byId(config.latField)
  const configuredLng = byId(config.lngField)
  const configuredGeo = [configuredLat, configuredLng].find((f) => f?.type === 'geo')
  if (configuredGeo) return { geo: configuredGeo, lat: undefined, lng: undefined }
  if (configuredLat && configuredLng) {
    return { geo: undefined, lat: configuredLat, lng: configuredLng }
  }

  const firstGeo = firstFieldOfType(fields, ['geo'])
  if (firstGeo) return { geo: firstGeo, lat: undefined, lng: undefined }

  return {
    geo: undefined,
    lat: configuredLat ?? numberByName(LAT_NAMES),
    lng: configuredLng ?? numberByName(LNG_NAMES)
  }
}

/** The row's title text (title field, else first text-ish value). */
export function rowTitle(row: DatabaseViewRow, fields: GridField[]): string {
  const titleField = fields.find((f) => f.isTitle) ?? fields[0]
  const value = titleField ? row.cells[titleField.id] : null
  if (typeof value === 'string' && value.trim()) return value
  if (value != null && typeof value !== 'object') return String(value)
  return 'Untitled'
}
