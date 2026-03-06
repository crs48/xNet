/**
 * Built-in schemas for xNet.
 *
 * These are the core schema types that come with xNet.
 * Users can create their own schemas using defineSchema().
 */

export { PageSchema, type Page } from './page'
export { DatabaseSchema, type Database } from './database'
export { DatabaseRowSchema, type DatabaseRow } from './database-row'
export { TaskSchema, type Task } from './task'
export { ExternalReferenceSchema, type ExternalReference } from './external-reference'
export { CanvasSchema, type Canvas } from './canvas'
export { CommentSchema, type Comment } from './comment'
export { GrantSchema, type Grant } from './grant'

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

// Comment reference extraction
export {
  type Mention,
  type CommentRef,
  type NodeRef,
  type Reference,
  extractReferences,
  extractMentions,
  getMentionedUsers,
  isMentioned,
  isUsernameMentioned,
  extractNodeRefs,
  extractCommentRefs,
  replaceAt,
  convertRefsToLinks
} from './commentReferences'

// Comment orphan detection
export {
  type OrphanReason,
  type OrphanStatus,
  type OrphanResolvers,
  checkOrphanStatus,
  filterOrphanedComments
} from './commentOrphans'

/**
 * All built-in schemas, keyed by their IRI.
 *
 * Both unversioned (legacy) and versioned (@1.0.0) IRIs are supported.
 * The unversioned IRIs are aliases for @1.0.0 versions.
 */
export const builtInSchemas = {
  // Versioned IRIs (canonical)
  'xnet://xnet.fyi/Page@1.0.0': () => import('./page').then((m) => m.PageSchema),
  'xnet://xnet.fyi/Database@1.0.0': () => import('./database').then((m) => m.DatabaseSchema),
  'xnet://xnet.fyi/DatabaseRow@1.0.0': () =>
    import('./database-row').then((m) => m.DatabaseRowSchema),
  'xnet://xnet.fyi/Task@1.0.0': () => import('./task').then((m) => m.TaskSchema),
  'xnet://xnet.fyi/ExternalReference@1.0.0': () =>
    import('./external-reference').then((m) => m.ExternalReferenceSchema),
  'xnet://xnet.fyi/Canvas@1.0.0': () => import('./canvas').then((m) => m.CanvasSchema),
  'xnet://xnet.fyi/Comment@1.0.0': () => import('./comment').then((m) => m.CommentSchema),
  'xnet://xnet.fyi/Grant@1.0.0': () => import('./grant').then((m) => m.GrantSchema),

  // Legacy unversioned IRIs (aliases for @1.0.0)
  'xnet://xnet.fyi/Page': () => import('./page').then((m) => m.PageSchema),
  'xnet://xnet.fyi/Database': () => import('./database').then((m) => m.DatabaseSchema),
  'xnet://xnet.fyi/DatabaseRow': () => import('./database-row').then((m) => m.DatabaseRowSchema),
  'xnet://xnet.fyi/Task': () => import('./task').then((m) => m.TaskSchema),
  'xnet://xnet.fyi/ExternalReference': () =>
    import('./external-reference').then((m) => m.ExternalReferenceSchema),
  'xnet://xnet.fyi/Canvas': () => import('./canvas').then((m) => m.CanvasSchema),
  'xnet://xnet.fyi/Comment': () => import('./comment').then((m) => m.CommentSchema),
  'xnet://xnet.fyi/Grant': () => import('./grant').then((m) => m.GrantSchema)
} as const

/**
 * Built-in schema IRIs.
 */
export type BuiltInSchemaIRI = keyof typeof builtInSchemas
