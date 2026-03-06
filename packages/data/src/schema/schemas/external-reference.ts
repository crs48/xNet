/**
 * ExternalReferenceSchema - Normalized external artifact metadata.
 *
 * External references let tasks and pages attach structured links to external
 * systems like GitHub, Figma, or YouTube without collapsing everything into
 * raw URL strings. Rich previews remain a surface concern; this schema stores
 * the stable metadata needed for querying and reuse.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { select, text, url } from '../properties'

export const ExternalReferenceSchema = defineSchema({
  name: 'ExternalReference',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Canonical external URL */
    url: url({ required: true }),

    /** Normalized provider identifier */
    provider: select({
      options: [
        { id: 'github', name: 'GitHub' },
        { id: 'figma', name: 'Figma' },
        { id: 'youtube', name: 'YouTube' },
        { id: 'loom', name: 'Loom' },
        { id: 'vimeo', name: 'Vimeo' },
        { id: 'codesandbox', name: 'CodeSandbox' },
        { id: 'spotify', name: 'Spotify' },
        { id: 'twitter', name: 'Twitter' },
        { id: 'generic', name: 'Generic Link' }
      ] as const,
      default: 'generic'
    }),

    /** Normalized reference kind */
    kind: select({
      options: [
        { id: 'issue', name: 'Issue' },
        { id: 'pull-request', name: 'Pull Request' },
        { id: 'design', name: 'Design' },
        { id: 'video', name: 'Video' },
        { id: 'sandbox', name: 'Sandbox' },
        { id: 'social', name: 'Social Post' },
        { id: 'audio', name: 'Audio' },
        { id: 'link', name: 'Link' }
      ] as const,
      default: 'link'
    }),

    /** Provider-specific stable identifier */
    refId: text({}),

    /** Compact display title */
    title: text({ required: true, maxLength: 500 }),

    /** Secondary display label */
    subtitle: text({ maxLength: 500 }),

    /** Small icon or provider marker */
    icon: text({ maxLength: 32 }),

    /** Optional richer preview/embed URL */
    embedUrl: url({}),

    /** Provider-specific metadata stored as JSON */
    metadata: text({ maxLength: 10000 })
  },
  document: undefined
})

/**
 * An ExternalReference node type (inferred from schema).
 */
export type ExternalReference = InferNode<(typeof ExternalReferenceSchema)['_properties']>
