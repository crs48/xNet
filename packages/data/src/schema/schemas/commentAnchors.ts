/**
 * Comment anchor types and utilities.
 *
 * Anchors define where a comment attaches to content. The anchorData field
 * on Comment is JSON-encoded using these types.
 */

// ─── Anchor Type Constants ─────────────────────────────────────────────────────

export type AnchorType =
  | 'text'
  | 'cell'
  | 'row'
  | 'column'
  | 'canvas-position'
  | 'canvas-object'
  | 'node'

// ─── Text Anchors (Yjs RelativePosition) ───────────────────────────────────────

/**
 * Text selection in the rich text editor.
 * Uses Yjs RelativePosition to survive concurrent edits.
 */
export interface TextAnchor {
  /** Yjs relative position for selection start (Base64-encoded Uint8Array) */
  startRelative: string
  /** Yjs relative position for selection end */
  endRelative: string
  /** The quoted text at time of comment (fallback for orphaned anchors) */
  quotedText: string
}

// ─── Database Anchors ──────────────────────────────────────────────────────────

/** Database cell anchor */
export interface CellAnchor {
  /** Node ID of the database row */
  rowId: string
  /** Schema property key of the column */
  propertyKey: string
}

/** Database row anchor */
export interface RowAnchor {
  /** Node ID of the database row */
  rowId: string
}

/** Database column anchor */
export interface ColumnAnchor {
  /** Schema property key of the column */
  propertyKey: string
}

// ─── Canvas Anchors ────────────────────────────────────────────────────────────

/**
 * Fixed canvas position (Figma-style pin).
 * Does not move when canvas objects move.
 */
export interface CanvasPositionAnchor {
  /** Canvas-space X coordinate */
  x: number
  /** Canvas-space Y coordinate */
  y: number
}

/**
 * Canvas object attachment (follows object movement).
 */
export type CanvasObjectAnchorPlacement =
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'center'
  | 'auto'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

export interface CanvasObjectAnchor {
  /** ID of the canvas object */
  objectId: string
  /** Stable reusable anchor identity */
  anchorId?: string
  /** Logical attachment placement on the object */
  placement?: CanvasObjectAnchorPlacement
  /** Optional custom normalized anchor ratios (0..1) */
  xRatio?: number
  yRatio?: number
  /** Optional offset from object origin */
  offsetX?: number
  offsetY?: number
  /** Future block/deep-link target within the source content */
  blockAnchorId?: string
}

// ─── Node Anchor ───────────────────────────────────────────────────────────────

/**
 * Whole-node comment (no additional positioning needed).
 * The target on Comment is sufficient.
 */
export interface NodeAnchor {
  // Empty - target on Comment is sufficient
}

// ─── Union Type ────────────────────────────────────────────────────────────────

/** Union type for all anchor data */
export type AnchorData =
  | TextAnchor
  | CellAnchor
  | RowAnchor
  | ColumnAnchor
  | CanvasPositionAnchor
  | CanvasObjectAnchor
  | NodeAnchor

// ─── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Encode anchor data for storage.
 */
export function encodeAnchor(data: AnchorData): string {
  return JSON.stringify(data)
}

/**
 * Decode anchor data from storage.
 */
export function decodeAnchor<T extends AnchorData>(json: string): T {
  return JSON.parse(json) as T
}

/**
 * Type guard for text anchors.
 */
export function isTextAnchor(data: AnchorData): data is TextAnchor {
  return 'startRelative' in data && 'endRelative' in data
}

/**
 * Type guard for cell anchors.
 */
export function isCellAnchor(data: AnchorData): data is CellAnchor {
  return 'rowId' in data && 'propertyKey' in data
}

/**
 * Type guard for row anchors.
 */
export function isRowAnchor(data: AnchorData): data is RowAnchor {
  return 'rowId' in data && !('propertyKey' in data)
}

/**
 * Type guard for column anchors.
 */
export function isColumnAnchor(data: AnchorData): data is ColumnAnchor {
  return 'propertyKey' in data && !('rowId' in data)
}

/**
 * Type guard for canvas position anchors.
 */
export function isCanvasPositionAnchor(data: AnchorData): data is CanvasPositionAnchor {
  return 'x' in data && 'y' in data && !('objectId' in data)
}

/**
 * Type guard for canvas object anchors.
 */
export function isCanvasObjectAnchor(data: AnchorData): data is CanvasObjectAnchor {
  return 'objectId' in data
}

/**
 * Type guard for node anchors (empty object).
 */
export function isNodeAnchor(data: AnchorData): data is NodeAnchor {
  return Object.keys(data).length === 0
}
