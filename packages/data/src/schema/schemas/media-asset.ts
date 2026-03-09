/**
 * MediaAssetSchema - Reusable media/file node for canvas and page references.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { file, number, select, text } from '../properties'

export const MediaAssetSchema = defineSchema({
  name: 'MediaAsset',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Display title */
    title: text({ required: true, maxLength: 500 }),

    /** Primary file reference */
    file: file({ required: true }),

    /** Normalized media kind */
    kind: select({
      options: [
        { id: 'image', name: 'Image' },
        { id: 'video', name: 'Video' },
        { id: 'audio', name: 'Audio' },
        { id: 'document', name: 'Document' },
        { id: 'file', name: 'File' }
      ] as const,
      default: 'file'
    }),

    /** Optional alt text or description */
    alt: text({ maxLength: 2000 }),

    /** Natural width when known */
    width: number({ integer: true, min: 0 }),

    /** Natural height when known */
    height: number({ integer: true, min: 0 })
  },
  document: undefined
})

export type MediaAsset = InferNode<(typeof MediaAssetSchema)['_properties']>
