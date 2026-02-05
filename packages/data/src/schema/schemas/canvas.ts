/**
 * CanvasSchema - Infinite canvas for spatial visualization.
 *
 * Canvases support:
 * - Nodes (cards, shapes, embeds)
 * - Edges (connections between nodes)
 * - Collaborative editing via Yjs
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { text } from '../properties'

export const CanvasSchema = defineSchema({
  name: 'Canvas',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Canvas title */
    title: text({ required: true, maxLength: 500 }),

    /** Emoji or icon URL */
    icon: text({})
  },
  document: 'yjs' // Collaborative Y.Doc for canvas data (nodes, edges)
})

/**
 * A Canvas node type (inferred from schema).
 */
export type Canvas = InferNode<(typeof CanvasSchema)['_properties']>
