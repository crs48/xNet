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

/**
 * All built-in schemas, keyed by their IRI.
 */
export const builtInSchemas = {
  'xnet://xnet.dev/Page': () => import('./page').then((m) => m.PageSchema),
  'xnet://xnet.dev/Database': () => import('./database').then((m) => m.DatabaseSchema),
  'xnet://xnet.dev/Task': () => import('./task').then((m) => m.TaskSchema),
  'xnet://xnet.dev/Canvas': () => import('./canvas').then((m) => m.CanvasSchema)
} as const

/**
 * Built-in schema IRIs.
 */
export type BuiltInSchemaIRI = keyof typeof builtInSchemas
