/**
 * Game-interop schema pack (exploration 0200) — the durable, player-facing facts
 * that flow between a game engine (Unreal Engine 6) and xNet.
 *
 * The thesis of 0200: UE6's "portable content, code, and economies across games
 * and engines" needs a persistent, *user-owned*, cross-game data + identity layer
 * — exactly what xNet is. This pack is that layer's vocabulary. A `PlayerIdentity`
 * is keyed to the player's own xNet `did`, so it is portable across publishers in
 * a way Epic's per-ecosystem persistence is not; `Inventory`/`GameItem`/
 * `Achievement`/`MatchSession`/`GameEconomyEntry` are the save-file-grade facts a
 * connector ingests, and `GameAsset` is the standards-aligned (glTF/USD) asset
 * *reference* store — xNet holds the CID, never the mesh (xNet is not a 3D engine).
 *
 * Design decisions, argued in exploration 0200:
 *   - **Durable, not real-time**: every schema here is the kind of thing that
 *     belongs in a save file (inventory, identity, achievements, economy), never
 *     a netcode packet (transforms, physics). The `@xnetjs/unreal` connector
 *     enforces that boundary at the cadence layer; the pack enforces it by simply
 *     not modeling per-frame state.
 *   - **Space-scoped by default**: every node carries the standard `space` +
 *     `visibility` pair and `spaceCascadeAuthorization()`. So a personal profile
 *     is owner-only (no Space), while a game's data lives in a dedicated `game/*`
 *     Space the title is granted scoped access to — the cascade is what stops a
 *     game from ever seeing the player's finance/CRM/notes (exploration 0181/0192).
 *   - **Assets by reference**: glTF/USD/USDZ are stored as `file()` refs (CIDs),
 *     never parsed. xNet is a standards-compliant *reference* store; rendering and
 *     fidelity stay in the engine.
 *   - **Economy as a ledger fact**: `GameEconomyEntry.amount` is `money()` (integer
 *     minor units) so in-game currency reconciles through `@xnetjs/ledger` — a
 *     ledger of record, explicitly not a settlement/payment rail.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { date, file, json, money, number, relation, select, text } from '../properties'
import { spaceCascadeAuthorization } from './space-authorization'

export const GAME_NAMESPACE = 'xnet://xnet.fyi/' as const

// Schema IRIs (versioned, canonical) — one source of truth, re-exported by
// `@xnetjs/unreal` so the connector's `schemaWrite` grant references these.
export const PLAYER_IDENTITY_SCHEMA_IRI = 'xnet://xnet.fyi/PlayerIdentity@1.0.0' as const
export const INVENTORY_SCHEMA_IRI = 'xnet://xnet.fyi/Inventory@1.0.0' as const
export const GAME_ITEM_SCHEMA_IRI = 'xnet://xnet.fyi/GameItem@1.0.0' as const
export const ACHIEVEMENT_SCHEMA_IRI = 'xnet://xnet.fyi/Achievement@1.0.0' as const
export const MATCH_SESSION_SCHEMA_IRI = 'xnet://xnet.fyi/MatchSession@1.0.0' as const
export const GAME_ECONOMY_ENTRY_SCHEMA_IRI = 'xnet://xnet.fyi/GameEconomyEntry@1.0.0' as const
export const GAME_ASSET_SCHEMA_IRI = 'xnet://xnet.fyi/GameAsset@1.0.0' as const

const SPACE_TARGET = 'xnet://xnet.fyi/Space@1.0.0' as const

/**
 * Accepted 3D-asset MIME types — glTF (the "JPEG of 3D", runtime delivery) and
 * OpenUSD (high-fidelity scenes). xNet stores the ref, never the bytes' meaning.
 */
export const GAME_ASSET_MIME_TYPES = [
  'model/gltf-binary', // .glb
  'model/gltf+json', // .gltf
  'model/vnd.usdz+zip', // .usdz
  'model/vnd.usd', // .usd
  'model/vnd.usda' // .usda
] as const

/** Shared visibility ladder (mirrors CRM/Task): `inherit` → owner-only with no
 * Space, Space-roles inside a Space. */
const VISIBILITY_OPTIONS = [
  { id: 'inherit', name: 'Inherit', color: 'gray' },
  { id: 'private', name: 'Private', color: 'gray' },
  { id: 'unlisted', name: 'Unlisted', color: 'yellow' },
  { id: 'public', name: 'Public', color: 'green' }
] as const

const visibility = () => select({ options: VISIBILITY_OPTIONS, default: 'inherit' })
const space = () => relation({ target: SPACE_TARGET })

export type GameVisibility = (typeof VISIBILITY_OPTIONS)[number]['id']

// ---------------------------------------------------------------------------
// PlayerIdentity — the portable, user-owned cross-game identity (keyed to a DID)
// ---------------------------------------------------------------------------

export const PlayerIdentitySchema = defineSchema({
  name: 'PlayerIdentity',
  namespace: GAME_NAMESPACE,
  properties: {
    /** Display / gamer name. */
    displayName: text({ required: true, maxLength: 200 }),
    /** The player's own xNet `did:key` — the portable login across publishers. */
    did: text({ maxLength: 512 }),
    /** Avatar asset (glTF/USD), stored by reference. */
    avatarAsset: file({ accept: [...GAME_ASSET_MIME_TYPES] }),
    /** The title this identity is "homed" in (origin game). */
    homeGame: text({ maxLength: 200 }),
    /** Short bio / status the player chooses to surface in-game. */
    bio: text({ maxLength: 2000 }),
    space: space(),
    visibility: visibility()
  },
  document: undefined,
  authorization: spaceCascadeAuthorization()
})

export type PlayerIdentity = InferNode<(typeof PlayerIdentitySchema)['_properties']>

// ---------------------------------------------------------------------------
// GameItem + Inventory — portable, save-file-grade possessions
// ---------------------------------------------------------------------------

export const ITEM_RARITIES = [
  { id: 'common', name: 'Common', color: 'gray' },
  { id: 'uncommon', name: 'Uncommon', color: 'green' },
  { id: 'rare', name: 'Rare', color: 'blue' },
  { id: 'epic', name: 'Epic', color: 'purple' },
  { id: 'legendary', name: 'Legendary', color: 'orange' }
] as const

export type ItemRarity = (typeof ITEM_RARITIES)[number]['id']

export const GameItemSchema = defineSchema({
  name: 'GameItem',
  namespace: GAME_NAMESPACE,
  properties: {
    name: text({ required: true, maxLength: 300 }),
    rarity: select({ options: ITEM_RARITIES, default: 'common' }),
    /** The title that minted the item (provenance for cross-game portability). */
    sourceGame: text({ maxLength: 200 }),
    /** Visual/3D asset (glTF/USD), by reference. */
    asset: file({ accept: [...GAME_ASSET_MIME_TYPES] }),
    /** Stack count for fungible items. */
    quantity: number({ integer: true, min: 0 }),
    /** Opaque, engine-interpreted attribute bag (stats, sockets, bindings). */
    attributes: json({}),
    space: space(),
    visibility: visibility()
  },
  document: undefined,
  authorization: spaceCascadeAuthorization()
})

export type GameItem = InferNode<(typeof GameItemSchema)['_properties']>

export const InventorySchema = defineSchema({
  name: 'Inventory',
  namespace: GAME_NAMESPACE,
  properties: {
    /** Whose inventory this is. */
    owner: relation({ target: PLAYER_IDENTITY_SCHEMA_IRI }),
    label: text({ maxLength: 200 }),
    /** Held items. */
    items: relation({ target: GAME_ITEM_SCHEMA_IRI, multiple: true }),
    space: space(),
    visibility: visibility()
  },
  document: undefined,
  authorization: spaceCascadeAuthorization()
})

export type Inventory = InferNode<(typeof InventorySchema)['_properties']>

// ---------------------------------------------------------------------------
// Achievement + MatchSession — player history
// ---------------------------------------------------------------------------

export const AchievementSchema = defineSchema({
  name: 'Achievement',
  namespace: GAME_NAMESPACE,
  properties: {
    name: text({ required: true, maxLength: 300 }),
    description: text({ maxLength: 2000 }),
    player: relation({ target: PLAYER_IDENTITY_SCHEMA_IRI }),
    game: text({ maxLength: 200 }),
    unlockedAt: date({}),
    /** Gamerscore-style point value. */
    points: number({ integer: true, min: 0 }),
    space: space(),
    visibility: visibility()
  },
  document: undefined,
  authorization: spaceCascadeAuthorization()
})

export type Achievement = InferNode<(typeof AchievementSchema)['_properties']>

export const MATCH_RESULTS = [
  { id: 'win', name: 'Win', color: 'green' },
  { id: 'loss', name: 'Loss', color: 'red' },
  { id: 'draw', name: 'Draw', color: 'gray' },
  { id: 'incomplete', name: 'Incomplete', color: 'yellow' }
] as const

export type MatchResult = (typeof MATCH_RESULTS)[number]['id']

export const MatchSessionSchema = defineSchema({
  name: 'MatchSession',
  namespace: GAME_NAMESPACE,
  properties: {
    game: text({ required: true, maxLength: 200 }),
    player: relation({ target: PLAYER_IDENTITY_SCHEMA_IRI }),
    result: select({ options: MATCH_RESULTS }),
    score: number({}),
    startedAt: date({}),
    endedAt: date({}),
    /** Opaque per-match stat bag (mode, map, kills, etc.). */
    stats: json({}),
    space: space(),
    visibility: visibility()
  },
  document: undefined,
  authorization: spaceCascadeAuthorization()
})

export type MatchSession = InferNode<(typeof MatchSessionSchema)['_properties']>

// ---------------------------------------------------------------------------
// GameEconomyEntry — in-game currency as a ledger fact (not a payment rail)
// ---------------------------------------------------------------------------

export const GameEconomyEntrySchema = defineSchema({
  name: 'GameEconomyEntry',
  namespace: GAME_NAMESPACE,
  properties: {
    player: relation({ target: PLAYER_IDENTITY_SCHEMA_IRI }),
    /** Currency code / soft-currency name (e.g. `V-Bucks`, `gold`). */
    currency: text({ required: true, maxLength: 60 }),
    /** Signed amount, integer minor units — reconciles via `@xnetjs/ledger`. */
    amount: money({ required: true }),
    /** What caused the entry (purchase, reward, trade). */
    reason: text({ maxLength: 500 }),
    game: text({ maxLength: 200 }),
    occurredAt: date({}),
    space: space(),
    visibility: visibility()
  },
  document: undefined,
  authorization: spaceCascadeAuthorization()
})

export type GameEconomyEntry = InferNode<(typeof GameEconomyEntrySchema)['_properties']>

// ---------------------------------------------------------------------------
// GameAsset — the standards-aligned (glTF/USD) asset reference store
// ---------------------------------------------------------------------------

export const GAME_ASSET_FORMATS = [
  { id: 'glb', name: 'glTF (binary)' },
  { id: 'gltf', name: 'glTF (JSON)' },
  { id: 'usd', name: 'OpenUSD' },
  { id: 'usdz', name: 'USDZ' },
  { id: 'other', name: 'Other' }
] as const

export type GameAssetFormat = (typeof GAME_ASSET_FORMATS)[number]['id']

export const GameAssetSchema = defineSchema({
  name: 'GameAsset',
  namespace: GAME_NAMESPACE,
  properties: {
    title: text({ required: true, maxLength: 300 }),
    /** The asset payload, by reference (CID) — never parsed by xNet. */
    file: file({ required: true, accept: [...GAME_ASSET_MIME_TYPES] }),
    format: select({ options: GAME_ASSET_FORMATS, default: 'glb' }),
    sourceGame: text({ maxLength: 200 }),
    description: text({ maxLength: 2000 }),
    space: space(),
    visibility: visibility()
  },
  document: undefined,
  authorization: spaceCascadeAuthorization()
})

export type GameAsset = InferNode<(typeof GameAssetSchema)['_properties']>

// ---------------------------------------------------------------------------
// Pack aggregate
// ---------------------------------------------------------------------------

/** Every durable game-interop schema IRI (versioned). The connector's
 * `schemaWrite` grant is a subset of this; the `@xnetjs/unreal` granularity guard
 * rejects any sync target outside it. */
export const GAME_SCHEMA_IRIS = [
  PLAYER_IDENTITY_SCHEMA_IRI,
  INVENTORY_SCHEMA_IRI,
  GAME_ITEM_SCHEMA_IRI,
  ACHIEVEMENT_SCHEMA_IRI,
  MATCH_SESSION_SCHEMA_IRI,
  GAME_ECONOMY_ENTRY_SCHEMA_IRI,
  GAME_ASSET_SCHEMA_IRI
] as const

/** All game-interop schemas, for bulk registration / iteration. */
export const gameSchemas = [
  PlayerIdentitySchema,
  GameItemSchema,
  InventorySchema,
  AchievementSchema,
  MatchSessionSchema,
  GameEconomyEntrySchema,
  GameAssetSchema
] as const
