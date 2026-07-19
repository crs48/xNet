/**
 * PublicationSchema — a site: the thing readers subscribe to (exploration 0362).
 *
 * A Publication groups posts under one identity, feed and base URL. It is
 * deliberately separate from its authors so it can be **followed on its own**
 * — Leaflet.pub's primitive, and the reason a publication survives an author
 * changing accounts. Posts join a publication through `Page.publication`.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { text, relation, checkbox } from '../properties'
import { spaceCascadeAuthorization } from './space-authorization'

export const PublicationSchema = defineSchema({
  name: 'Publication',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Display title, used as the feed title */
    title: text({ required: true, maxLength: 200 }),

    /** Feed description / tagline */
    description: text({ maxLength: 1000 }),

    /** Absolute site root the posts publish under, e.g. `https://xnet.fyi` */
    baseUrl: text({ maxLength: 500 }),

    /** Path prefix beneath `baseUrl`, e.g. `/blog` */
    basePath: text({ maxLength: 200 }),

    /** Feed language tag (BCP 47), e.g. `en-gb` */
    language: text({ maxLength: 20 }),

    /** Canonical SECURITY home (exploration 0179) */
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const }),

    /** Byline pool; a post may credit any subset (exploration 0269) */
    authors: relation({ target: 'xnet://xnet.fyi/Profile@1.0.0' as const, multiple: true }),

    /**
     * Whether readers may follow this publication independently of its
     * authors. Off makes it an archive: readable, but not subscribable.
     */
    followable: checkbox({ default: true })
  },
  // Inherits access from its home Space (exploration 0181/0192).
  authorization: spaceCascadeAuthorization()
})

/**
 * A Publication node type (inferred from schema).
 */
export type Publication = InferNode<(typeof PublicationSchema)['_properties']>
