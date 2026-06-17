/**
 * CanvasSchema - Infinite canvas for spatial visualization.
 *
 * Canvases support:
 * - Scene objects (pages, databases, notes, links, media, shapes, groups)
 * - Connectors (connections between scene objects)
 * - Collaborative editing via Yjs
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { text, relation, select } from '../properties'
import { spaceCascadeAuthorization } from './space-authorization'

export const CanvasSchema = defineSchema({
  name: 'Canvas',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Canvas title */
    title: text({ required: true, maxLength: 500 }),

    /** Emoji or icon URL */
    icon: text({}),

    /** Canonical home; empty = Unfiled (exploration 0169) */
    folder: relation({ target: 'xnet://xnet.fyi/Folder@1.0.0' as const }),

    /** Order among folder siblings — fractional index */
    sortKey: text({ maxLength: 500 }),

    /** Workspace-wide labels, referenced by id (exploration 0169) */
    tags: relation({ target: 'xnet://xnet.fyi/Tag@1.0.0' as const, multiple: true }),

    /** Canonical SECURITY home; empty = personal/private (exploration 0179) */
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const }),

    /** Per-node visibility; `inherit` defers to the Space (exploration 0179) */
    visibility: select({
      options: [
        { id: 'inherit', name: 'Inherit', color: 'gray' },
        { id: 'private', name: 'Private', color: 'gray' },
        { id: 'unlisted', name: 'Unlisted', color: 'yellow' },
        { id: 'public', name: 'Public', color: 'green' }
      ] as const,
      default: 'inherit'
    })
  },
  document: 'yjs', // Collaborative Y.Doc for canvas data (nodes, edges)
  // Inherits access from its home Space (exploration 0181/0192).
  authorization: spaceCascadeAuthorization()
})

/**
 * A Canvas node type (inferred from schema).
 */
export type Canvas = InferNode<(typeof CanvasSchema)['_properties']>
