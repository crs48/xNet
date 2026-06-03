/**
 * ReactionSchema - Universal social reaction type for public counters.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { created, createdBy, person, relation, select, text } from '../properties'

const reactionTypes = [
  { id: 'like', name: 'Like', color: 'green' },
  { id: 'repost', name: 'Repost', color: 'blue' },
  { id: 'bookmark', name: 'Bookmark', color: 'purple' },
  { id: 'emoji', name: 'Emoji', color: 'yellow' }
] as const

export const ReactionSchema = defineSchema({
  name: 'Reaction',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    target: relation({ required: true }),
    targetSchema: text({}),
    reactionType: select({
      options: reactionTypes,
      required: true,
      default: 'like'
    }),
    reactor: person({ required: true }),
    emoji: text({ maxLength: 32 }),
    annotation: text({ maxLength: 1000 }),
    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined
})

export type Reaction = InferNode<(typeof ReactionSchema)['_properties']>
