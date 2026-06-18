import type { DID } from '../node'
import { describe, expect, it } from 'vitest'
import { getAuthMode } from '../../auth'
import {
  AchievementSchema,
  GAME_ASSET_MIME_TYPES,
  GAME_SCHEMA_IRIS,
  GameAssetSchema,
  GameEconomyEntrySchema,
  GameItemSchema,
  InventorySchema,
  MatchSessionSchema,
  PlayerIdentitySchema,
  gameSchemas
} from './game'

const testDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID

describe('game-interop schema pack', () => {
  it('exposes one IRI per schema, all versioned and canonical', () => {
    expect(GAME_SCHEMA_IRIS).toHaveLength(gameSchemas.length)
    for (const iri of GAME_SCHEMA_IRIS) {
      expect(iri).toMatch(/^xnet:\/\/xnet\.fyi\/[A-Za-z]+@1\.0\.0$/)
    }
    // Every aggregated schema's @id is in the IRI list.
    const ids = gameSchemas.map((s) => s.schema['@id']).sort()
    expect([...GAME_SCHEMA_IRIS].sort()).toEqual(ids)
  })

  it('every schema declares authorization (never legacy/owner-only fallback)', () => {
    for (const schema of gameSchemas) {
      expect(getAuthMode(schema.schema), schema.schema.name).not.toBe('legacy')
    }
  })

  it('every schema carries the space relation the cascade reads', () => {
    for (const schema of gameSchemas) {
      const propIds = schema.schema.properties.map((p) => p['@id'])
      const id = schema.schema['@id']
      expect(propIds, schema.schema.name).toContain(`${id}#space`)
    }
  })

  it('PlayerIdentity is keyed to a portable DID + glTF/USD avatar ref', () => {
    const player = PlayerIdentitySchema.create(
      { displayName: 'Nova', did: testDID, homeGame: 'Aether' },
      { createdBy: testDID }
    )
    expect(player.displayName).toBe('Nova')
    expect(player.did).toBe(testDID)

    const avatar = PlayerIdentitySchema.schema.properties.find((p) =>
      p['@id'].endsWith('#avatarAsset')
    )
    expect(avatar).toBeDefined()
  })

  it('GameItem accepts only 3D asset MIME types and an opaque attribute bag', () => {
    const asset = GameItemSchema.schema.properties.find((p) => p['@id'].endsWith('#asset'))
    // The file property carries the glTF/USD accept allowlist.
    expect(JSON.stringify(asset)).toContain('model/gltf-binary')
    expect(GAME_ASSET_MIME_TYPES).toContain('model/vnd.usdz+zip')

    const item = GameItemSchema.create(
      { name: 'Aether Blade', rarity: 'legendary', quantity: 1, attributes: { dmg: 42 } },
      { createdBy: testDID }
    )
    expect(item.rarity).toBe('legendary')
    expect((item.attributes as { dmg: number }).dmg).toBe(42)
  })

  it('Inventory links a player to held items', () => {
    const inv = InventorySchema.create(
      { label: 'Backpack', owner: 'node:player1', items: ['node:item1', 'node:item2'] },
      { createdBy: testDID }
    )
    expect(inv.items).toHaveLength(2)
  })

  it('GameEconomyEntry models currency as integer minor units (ledger-grade)', () => {
    const entry = GameEconomyEntrySchema.create(
      // Human-readable name in `currency`; money value uses ISO 'XXX' (no currency).
      { currency: 'gold', amount: { amount: 1500, currency: 'XXX' }, reason: 'quest reward' },
      { createdBy: testDID }
    )
    expect(entry.currency).toBe('gold')
    expect((entry.amount as { amount: number }).amount).toBe(1500)
  })

  it('Achievement and MatchSession record player history', () => {
    const ach = AchievementSchema.create(
      { name: 'First Blood', player: 'node:player1', points: 10 },
      { createdBy: testDID }
    )
    expect(ach.name).toBe('First Blood')

    const match = MatchSessionSchema.create(
      { game: 'Aether', result: 'win', score: 9001 },
      { createdBy: testDID }
    )
    expect(match.result).toBe('win')
  })

  it('GameAsset is a standards-aligned (glTF/USD) reference store', () => {
    const asset = GameAssetSchema.create(
      {
        title: 'Hero Mesh',
        format: 'glb',
        file: {
          cid: 'cid:blake3:test-mesh',
          name: 'hero.glb',
          mimeType: 'model/gltf-binary',
          size: 4096
        }
      },
      { createdBy: testDID }
    )
    expect(asset.format).toBe('glb')
    expect(asset.file?.mimeType).toBe('model/gltf-binary')
  })
})
