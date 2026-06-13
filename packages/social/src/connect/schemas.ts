/**
 * People-matching schemas (exploration 0174).
 *
 * A `ConnectableProfile` is an opt-in, intent-scoped projection of a person's
 * owned graph into something discoverable. The DID stays the source of truth
 * (via `did`); this is the matchable layer on top of it. Consent is OFF until
 * `enabled` is set and `visibility` is raised past `private`.
 */

import type { InferNode } from '@xnetjs/data'
import {
  checkbox,
  created,
  createdBy,
  defineSchema,
  number,
  person,
  relation,
  select,
  text
} from '@xnetjs/data'
import { visibilityOptions } from '../schemas/constants'
import {
  CONNECT_NAMESPACE,
  connectionIntentKinds,
  intentReachOptions,
  waveStatuses
} from './constants'

export const ConnectableProfileSchema = defineSchema({
  name: 'ConnectableProfile',
  namespace: CONNECT_NAMESPACE,
  properties: {
    /** The DID this connectable profile describes (should match createdBy). */
    did: person({ required: true }),
    /** One-line headline, user-authored. */
    headline: text({ maxLength: 140 }),
    /** Free-form, user-curated; seeded by derivation but always editable. */
    about: text({ maxLength: 2000 }),
    /** Top interest tags (TagSchema relations) derived from the owned graph. */
    interests: relation({ multiple: true }),
    /** Base64-encoded affinity vector computed locally via @xnetjs/vectors. */
    affinityVector: text({ maxLength: 8000 }),
    /** Coarse geohash cell (5 chars ≈ 5km); only used by in-person intents. */
    geohashCell: text({ maxLength: 12 }),
    /** Master opt-in. Nothing is discoverable while false. */
    enabled: checkbox({ default: false }),
    visibility: select({ options: visibilityOptions, required: true, default: 'private' }),
    /** Provenance of the derivation for the "why" card + audit. */
    derivedFromJson: text({ maxLength: 8000 }),
    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined
})

export const ConnectionIntentSchema = defineSchema({
  name: 'ConnectionIntent',
  namespace: CONNECT_NAMESPACE,
  properties: {
    profile: relation({ required: true }),
    kind: select({ options: connectionIntentKinds, required: true, default: 'friends' }),
    reach: select({ options: intentReachOptions, required: true, default: 'friends-of-friends' }),
    inPerson: checkbox({ default: false }),
    note: text({ maxLength: 280 }),
    active: checkbox({ default: true }),
    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined
})

export const ConnectionWaveSchema = defineSchema({
  name: 'ConnectionWave',
  namespace: CONNECT_NAMESPACE,
  properties: {
    fromDid: person({ required: true }),
    toDid: person({ required: true }),
    intentKind: select({ options: connectionIntentKinds, required: true, default: 'friends' }),
    /** hash(fromDid || toDid || intent || salt) — a commitment, never plaintext intent. */
    commitment: text({ required: true, maxLength: 128 }),
    status: select({ options: waveStatuses, required: true, default: 'pending' }),
    score: number({ min: 0, max: 1 }),
    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined
})

export type ConnectableProfile = InferNode<(typeof ConnectableProfileSchema)['_properties']>
export type ConnectionIntent = InferNode<(typeof ConnectionIntentSchema)['_properties']>
export type ConnectionWave = InferNode<(typeof ConnectionWaveSchema)['_properties']>

export const connectSchemas = [
  ConnectableProfileSchema,
  ConnectionIntentSchema,
  ConnectionWaveSchema
] as const
