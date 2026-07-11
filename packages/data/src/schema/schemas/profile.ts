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
 * The canonical node lives at the deterministic `profileNodeId(did)` so any
 * collaborator who knows a DID (e.g. from `createdBy` on shared content) can
 * acquire the profile without a directory lookup. Profiles are public
 * identity (see auth-exempt.ts): any authenticated peer may read them; only
 * the subject DID may write — the hub enforces this per profile room.
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

    /**
     * Avatar image: an https URL or a small inline `data:image/*` URL.
     * Inline data URLs keep the picture inside the Profile node itself, so it
     * reaches share recipients through the same sync path as the name — no
     * separate blob authorization. Uploads are downscaled/re-encoded
     * client-side (which also strips EXIF metadata) to fit this budget.
     */
    avatar: text({ maxLength: 65536 }),

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

/**
 * Deterministic node ID for a DID's canonical profile (same pattern as
 * `inboxStateNodeId`). Knowing a DID is enough to acquire its profile.
 */
export function profileNodeId(did: string): string {
  return `profile-${did}`
}

/** The DID a profile node ID describes, or null when it isn't a profile ID. */
export function didFromProfileNodeId(nodeId: string): string | null {
  if (!nodeId.startsWith('profile-did:')) return null
  return nodeId.slice('profile-'.length)
}
