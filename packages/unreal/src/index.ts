/**
 * @xnetjs/unreal — Unreal Engine 6 interop (exploration 0200).
 *
 * The governed, user-owned, cross-game data plane UE6's portability vision implies
 * but does not itself supply. This package provides:
 *
 *   - {@link buildUnrealConnector} — a `@xnetjs/plugins` connector that syncs a
 *     title's durable player data (identity, inventory, achievements, matches,
 *     economy) into space-scoped xNet nodes;
 *   - the **granularity guardrail** ({@link assertDurableCadence} /
 *     {@link assertDurableSchemas}) enforcing "save-file-grade, not netcode-packet";
 *   - the pure {@link mapGameEventToNode} event → node translation; and
 *   - a re-export of the `@xnetjs/data` game-interop schema vocabulary.
 */

export {
  MIN_SYNC_INTERVAL_MS,
  GranularityError,
  cadenceIntervalMs,
  isHighFrequencyCadence,
  assertDurableCadence,
  assertDurableSchemas,
  type SyncCadence
} from './granularity'

export {
  mapGameEventToNode,
  toMoneyCode,
  NO_CURRENCY_CODE,
  type GameEvent,
  type PlayerEvent,
  type ItemEvent,
  type AchievementEvent,
  type MatchEvent,
  type EconomyEvent,
  type MappedNode
} from './events'

export {
  buildUnrealConnector,
  extractEvents,
  type UnrealConnectorOptions,
  type UnrealNodeQuery
} from './connector'

// The game-interop schema vocabulary lives in @xnetjs/data; re-export the surface
// a connector author references so `@xnetjs/unreal` is a one-stop import.
export {
  GAME_SCHEMA_IRIS,
  GAME_ASSET_MIME_TYPES,
  PLAYER_IDENTITY_SCHEMA_IRI,
  INVENTORY_SCHEMA_IRI,
  GAME_ITEM_SCHEMA_IRI,
  ACHIEVEMENT_SCHEMA_IRI,
  MATCH_SESSION_SCHEMA_IRI,
  GAME_ECONOMY_ENTRY_SCHEMA_IRI,
  GAME_ASSET_SCHEMA_IRI,
  type PlayerIdentity,
  type Inventory,
  type GameItem,
  type Achievement,
  type MatchSession,
  type GameEconomyEntry,
  type GameAsset,
  type ItemRarity,
  type MatchResult
} from '@xnetjs/data'
