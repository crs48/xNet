/**
 * Built-in schemas for xNet.
 *
 * These are the core schema types that come with xNet.
 * Users can create their own schemas using defineSchema().
 */

export { PageSchema, type Page } from './page'
export { DatabaseSchema, type Database } from './database'
export { TaskSchema, type Task } from './task'
export { CanvasSchema, type Canvas } from './canvas'
export { CommentSchema, type Comment } from './comment'

// Comment anchor types
export {
  type AnchorType,
  type TextAnchor,
  type CellAnchor,
  type RowAnchor,
  type ColumnAnchor,
  type CanvasPositionAnchor,
  type CanvasObjectAnchor,
  type NodeAnchor,
  type AnchorData,
  encodeAnchor,
  decodeAnchor,
  isTextAnchor,
  isCellAnchor,
  isRowAnchor,
  isColumnAnchor,
  isCanvasPositionAnchor,
  isCanvasObjectAnchor,
  isNodeAnchor
} from './commentAnchors'

/**
 * All built-in schemas, keyed by their IRI.
 */
export const builtInSchemas = {
  'xnet://xnet.fyi/Page': () => import('./page').then((m) => m.PageSchema),
  'xnet://xnet.fyi/Database': () => import('./database').then((m) => m.DatabaseSchema),
  'xnet://xnet.fyi/Task': () => import('./task').then((m) => m.TaskSchema),
  'xnet://xnet.fyi/Canvas': () => import('./canvas').then((m) => m.CanvasSchema),
  'xnet://xnet.fyi/Comment': () => import('./comment').then((m) => m.CommentSchema)
} as const

/**
 * Built-in schema IRIs.
 */
export type BuiltInSchemaIRI = keyof typeof builtInSchemas
