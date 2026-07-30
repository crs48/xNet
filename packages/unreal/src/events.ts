/**
 * Game-event → xNet-node mapping (exploration 0200).
 *
 * A connector's `pull` fetches a stream of normalized game events from the title's
 * events API and materializes each as a governed node. This module is the pure,
 * deterministic translation in the middle — no network, no store — so it is the
 * easy thing to test exhaustively. Every event maps to exactly one durable
 * game-interop schema; the connector runner stamps the target `space`, so the
 * mapping deliberately leaves space/visibility/authorization to the cascade.
 */

import type { ItemRarity, MatchResult } from '@xnetjs/data'
import {
  ACHIEVEMENT_SCHEMA_IRI,
  GAME_ECONOMY_ENTRY_SCHEMA_IRI,
  GAME_ITEM_SCHEMA_IRI,
  MATCH_SESSION_SCHEMA_IRI,
  PLAYER_IDENTITY_SCHEMA_IRI
} from '@xnetjs/data'

/** A player profile snapshot. */
export interface PlayerEvent {
  kind: 'player'
  displayName: string
  /** The player's portable xNet `did:key`, when known. */
  did?: string
  homeGame?: string
  bio?: string
}

/** A held/earned item. */
export interface ItemEvent {
  kind: 'item'
  name: string
  rarity?: ItemRarity
  sourceGame?: string
  quantity?: number
  /** Opaque, engine-interpreted attribute bag. */
  attributes?: Record<string, unknown>
}

/** An unlocked achievement. */
export interface AchievementEvent {
  kind: 'achievement'
  name: string
  description?: string
  /** Node id of the owning `PlayerIdentity`, when resolved. */
  player?: string
  game?: string
  /** ISO 8601 timestamp. */
  unlockedAt?: string
  points?: number
}

/** A completed match / session. */
export interface MatchEvent {
  kind: 'match'
  game: string
  player?: string
  result?: MatchResult
  score?: number
  startedAt?: string
  endedAt?: string
  stats?: Record<string, unknown>
}

/** A soft-currency economy movement. `amount` is integer minor units. */
export interface EconomyEvent {
  kind: 'economy'
  player?: string
  /** Display currency name (e.g. `gold`, `V-Bucks`). */
  currency: string
  /** Signed amount in integer minor units. */
  amount: number
  /**
   * ISO-4217 alphabetic code for the money value. Soft currencies have no ISO
   * code, so this defaults to `XXX` ("no currency") — the human-readable name
   * stays in {@link EconomyEvent.currency}. Pass a real code (e.g. `USD`) for a
   * real-money entry.
   */
  currencyCode?: string
  reason?: string
  game?: string
  /** ISO 8601 timestamp. */
  occurredAt?: string
}

/** ISO-4217 "no currency" — the money-value code for soft/in-game currencies. */
export const NO_CURRENCY_CODE = 'XXX'

/** Normalize a code to a valid ISO-4217 alphabetic code, or `XXX` when absent/invalid. */
export function toMoneyCode(code: string | undefined): string {
  return code && /^[A-Za-z]{3}$/.test(code) ? code.toUpperCase() : NO_CURRENCY_CODE
}

/** The normalized event union a connector ingests. */
export type GameEvent = PlayerEvent | ItemEvent | AchievementEvent | MatchEvent | EconomyEvent

/** A node ready for `ConnectorStore.create` (space stamped later by the runner). */
export interface MappedNode {
  schemaId: string
  properties: Record<string, unknown>
}

/** Drop undefined values so we never write empty properties. */
function compact(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(props)) {
    if (v !== undefined) out[k] = v
  }
  return out
}

/**
 * Map one normalized game event to a single durable node. Exhaustive over the
 * event union — an unknown `kind` throws so a new event type can't silently drop.
 */
export function mapGameEventToNode(event: GameEvent): MappedNode {
  switch (event.kind) {
    case 'player':
      return {
        schemaId: PLAYER_IDENTITY_SCHEMA_IRI,
        properties: compact({
          displayName: event.displayName,
          did: event.did,
          homeGame: event.homeGame,
          bio: event.bio
        })
      }
    case 'item':
      return {
        schemaId: GAME_ITEM_SCHEMA_IRI,
        properties: compact({
          name: event.name,
          rarity: event.rarity,
          sourceGame: event.sourceGame,
          quantity: event.quantity,
          attributes: event.attributes
        })
      }
    case 'achievement':
      return {
        schemaId: ACHIEVEMENT_SCHEMA_IRI,
        properties: compact({
          name: event.name,
          description: event.description,
          player: event.player,
          game: event.game,
          unlockedAt: event.unlockedAt,
          points: event.points
        })
      }
    case 'match':
      return {
        schemaId: MATCH_SESSION_SCHEMA_IRI,
        properties: compact({
          game: event.game,
          player: event.player,
          result: event.result,
          score: event.score,
          startedAt: event.startedAt,
          endedAt: event.endedAt,
          stats: event.stats
        })
      }
    case 'economy':
      return {
        schemaId: GAME_ECONOMY_ENTRY_SCHEMA_IRI,
        properties: compact({
          player: event.player,
          currency: event.currency,
          amount: { amount: event.amount, currency: toMoneyCode(event.currencyCode) },
          reason: event.reason,
          game: event.game,
          occurredAt: event.occurredAt
        })
      }
    default: {
      const exhaustive: never = event
      throw new Error(`unknown game event: ${JSON.stringify(exhaustive)}`)
    }
  }
}
