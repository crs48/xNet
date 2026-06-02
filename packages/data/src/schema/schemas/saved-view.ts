/**
 * SavedViewSchema - Persisted query/view descriptor.
 *
 * Saved views store the canonical query AST descriptor as JSON text so the
 * runtime can validate shared dashboards and views before executing them.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { relation, select, text } from '../properties'

export const SavedViewSchema = defineSchema({
  name: 'SavedView',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Human-readable view title */
    title: text({ required: true, maxLength: 500 }),

    /** Optional user-facing description */
    description: text({ maxLength: 4000 }),

    /** JSON-serialized SavedViewDescriptor from store/query-ast */
    descriptor: text({ required: true }),

    /** Visibility and ownership boundary for the saved descriptor */
    scope: select({
      options: [
        { id: 'user', name: 'User' },
        { id: 'workspace', name: 'Workspace' },
        { id: 'database', name: 'Database' }
      ] as const,
      default: 'workspace'
    }),

    /** Optional database that owns database-scoped views */
    database: relation({ target: 'xnet://xnet.fyi/Database@1.0.0' as const })
  }
})

export type SavedView = InferNode<(typeof SavedViewSchema)['_properties']>
