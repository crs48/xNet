/**
 * First-contact gating (exploration 0176/0177).
 *
 * A DM to someone you've never connected with is a "first contact": it becomes
 * a MessageRequest the recipient must accept, rather than landing directly in
 * their inbox. Someone is *known* (skips the request) when you already share a
 * DM channel or have a mutual wave (the 0174 double opt-in). Pure helpers so the
 * decision is unit-testable without a store.
 */
import { dmChannelId } from '@xnetjs/comms'

export type WaveEdge = { fromDid: string; toDid: string }

/** True when both sides have waved (any intent) — the mutual half of 0174. */
export function hasMutualWave(waves: readonly WaveEdge[], me: string, them: string): boolean {
  const iWaved = waves.some((w) => w.fromDid === me && w.toDid === them)
  const theyWaved = waves.some((w) => w.fromDid === them && w.toDid === me)
  return iWaved && theyWaved
}

export type FirstContactInput = {
  me: string
  them: string
  waves: readonly WaveEdge[]
  /** Ids of DM channels that already exist for me. */
  knownChannelIds: ReadonlySet<string>
}

/** A DM is first-contact when there's no existing channel and no mutual wave. */
export function isFirstContact({ me, them, waves, knownChannelIds }: FirstContactInput): boolean {
  if (me === them) return false
  if (knownChannelIds.has(dmChannelId([me, them]))) return false
  return !hasMutualWave(waves, me, them)
}
