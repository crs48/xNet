/**
 * GrantSchema - Built-in authorization delegation node.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { number, person, text } from '../properties'

export const GrantSchema = defineSchema({
  name: 'Grant',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    issuer: person({ required: true }),
    grantee: person({ required: true }),
    resource: text({ required: true }),
    resourceSchema: text({ required: true }),
    actions: text({ required: true }),
    expiresAt: number({}),
    revokedAt: number({}),
    revokedBy: person({}),
    ucanToken: text({}),
    proofDepth: number({}),
    parentGrantId: text({})
  }
})

export type Grant = InferNode<(typeof GrantSchema)['_properties']>
