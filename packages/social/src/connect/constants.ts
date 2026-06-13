/**
 * Shared constants for the people-matching layer (exploration 0174).
 */

import { SOCIAL_NAMESPACE } from '../schemas/constants'

export const CONNECT_NAMESPACE = SOCIAL_NAMESPACE

/**
 * What kind of connection a person is open to. One person → many intents; the
 * same mechanism serves romance, friendship, collaboration, hiring, mentorship,
 * and local meetups (the whole point of 0174 is that these are facets, not apps).
 */
export const connectionIntentKinds = [
  { id: 'friends', name: 'Friendship' },
  { id: 'collab', name: 'Project collaborators' },
  { id: 'hiring', name: 'Hiring' },
  { id: 'seeking-work', name: 'Seeking work' },
  { id: 'mentor', name: 'Mentorship' },
  { id: 'local', name: 'Local meetup' },
  { id: 'romance', name: 'Romance' }
] as const

export type ConnectionIntentKind = (typeof connectionIntentKinds)[number]['id']

/** How far a discoverable intent reaches. */
export const intentReachOptions = [
  { id: 'friends-of-friends', name: 'Friends of friends' },
  { id: 'hub', name: 'This community (hub)' },
  { id: 'public', name: 'Open / federated' }
] as const

export type IntentReach = (typeof intentReachOptions)[number]['id']

/** Provenance of a wave commitment, used for evidence + the intro card. */
export const waveStatuses = [
  { id: 'pending', name: 'Pending' },
  { id: 'mutual', name: 'Mutual' },
  { id: 'expired', name: 'Expired' }
] as const

export type WaveStatus = (typeof waveStatuses)[number]['id']

export const CONNECT_INTENT_KIND_VALUES: readonly ConnectionIntentKind[] =
  connectionIntentKinds.map((kind) => kind.id)
