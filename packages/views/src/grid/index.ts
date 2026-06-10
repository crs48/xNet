/**
 * Grid engine — the V2 database grid (exploration 0159).
 *
 * Pure core (no React):
 * - types: positions, ranges, selection model
 * - state: GridState reducer (selection, focus, editing lifecycle)
 * - keymap: normalized key input -> GridCommand
 * - clipboard: TSV interchange + per-type paste coercion
 */

export {
  type GridPos,
  type GridRange,
  type GridRect,
  type GridSelection,
  type GridState,
  type GridCommand,
  type EditingState,
  type CommitReason,
  type MoveDirection,
  type KeyInput,
  rangeToRect,
  isSelected,
  selectionRect
} from './types'

export { createGridState, gridReducer, type GridAction } from './state'

export { interpretKeyDown, isPrintableKey } from './keymap'

export {
  serializeTsv,
  parseTsv,
  formatCellText,
  coerceCellText,
  type CopyField,
  type PasteField,
  type CoerceResult
} from './clipboard'

export {
  type GridField,
  type GridFieldOption,
  type GridRowData,
  type CellRef,
  type GridCallbacks
} from './model'

export { GridSurface, type GridSurfaceProps } from './GridSurface'
export { GridCell, type GridCellProps } from './GridCell'
export { GridPeek, type GridPeekProps } from './GridPeek'
export { GridHeader, type GridHeaderProps } from './GridHeader'
export {
  GridToolbar,
  type GridToolbarProps,
  type GridViewTab,
  toSurfaceFilter,
  fromSurfaceFilter
} from './GridToolbar'
