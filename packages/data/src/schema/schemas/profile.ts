/**
 * ProfileSchema - User profile for a DID (explorations 0167/0168).
 *
 * DIDs are self-sovereign and opaque; a Profile is the human layer on top:
 * display name, avatar, status. Profiles are ordinary synced nodes authored
 * by their subject, so rosters, mention pills, and person properties can
 * resolve a DID to something readable.
 *
 * There is at most one canonical Profile per DID per workspace; consumers
 * should treat the newest node authored by the subject DID as canonical.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { created, createdBy, person, text } from '../properties'

export const ProfileSchema = defineSchema({
  name: 'Profile',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** The DID this profile describes (should match createdBy) */
    did: person({ required: true }),

    /** Human-readable display name */
    displayName: text({ required: true, maxLength: 120 }),

    /**
     * Optional @handle — a short, workspace-unique slug for typing mentions
     * (exploration 0172). The stable identity is always the DID; the handle is
     * a resolver input at compose time and a display option at read time, so a
     * rename never breaks an existing mention. Global uniqueness is out of
     * scope — the DID remains the source of truth.
     */
    handle: text({ maxLength: 32 }),

    /** Avatar URL or blob reference */
    avatar: text({ maxLength: 500 }),

    /** Short status emoji (e.g. 🔴, 🌴) */
    statusEmoji: text({ maxLength: 32 }),

    /** Free-form status message */
    statusMessage: text({ maxLength: 200 }),

    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined
})

export type Profile = InferNode<(typeof ProfileSchema)['_properties']>
