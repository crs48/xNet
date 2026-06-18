import {
  ACHIEVEMENT_SCHEMA_IRI,
  GAME_ECONOMY_ENTRY_SCHEMA_IRI,
  GAME_ITEM_SCHEMA_IRI,
  MATCH_SESSION_SCHEMA_IRI,
  PLAYER_IDENTITY_SCHEMA_IRI
} from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import { mapGameEventToNode, type GameEvent } from './events'

describe('mapGameEventToNode', () => {
  it('maps a player event to a PlayerIdentity node', () => {
    const node = mapGameEventToNode({
      kind: 'player',
      displayName: 'Nova',
      did: 'did:key:zABC',
      homeGame: 'Aether'
    })
    expect(node.schemaId).toBe(PLAYER_IDENTITY_SCHEMA_IRI)
    expect(node.properties).toMatchObject({ displayName: 'Nova', did: 'did:key:zABC' })
  })

  it('maps an item event with an opaque attribute bag', () => {
    const node = mapGameEventToNode({
      kind: 'item',
      name: 'Aether Blade',
      rarity: 'legendary',
      attributes: { dmg: 42, sockets: 2 }
    })
    expect(node.schemaId).toBe(GAME_ITEM_SCHEMA_IRI)
    expect(node.properties.rarity).toBe('legendary')
    expect(node.properties.attributes).toEqual({ dmg: 42, sockets: 2 })
  })

  it('maps an achievement event', () => {
    const node = mapGameEventToNode({
      kind: 'achievement',
      name: 'First Blood',
      player: 'node:p1',
      points: 10
    })
    expect(node.schemaId).toBe(ACHIEVEMENT_SCHEMA_IRI)
    expect(node.properties).toMatchObject({ name: 'First Blood', player: 'node:p1', points: 10 })
  })

  it('maps a match event', () => {
    const node = mapGameEventToNode({ kind: 'match', game: 'Aether', result: 'win', score: 9001 })
    expect(node.schemaId).toBe(MATCH_SESSION_SCHEMA_IRI)
    expect(node.properties).toMatchObject({ game: 'Aether', result: 'win', score: 9001 })
  })

  it('maps a soft-currency economy event to an ISO XXX money value', () => {
    const node = mapGameEventToNode({
      kind: 'economy',
      currency: 'gold',
      amount: 1500,
      reason: 'quest reward'
    })
    expect(node.schemaId).toBe(GAME_ECONOMY_ENTRY_SCHEMA_IRI)
    // Human name kept in `currency`; money value uses ISO 'XXX' (no currency).
    expect(node.properties.currency).toBe('gold')
    expect(node.properties.amount).toEqual({ amount: 1500, currency: 'XXX' })
    expect(node.properties.reason).toBe('quest reward')
  })

  it('honors a real ISO-4217 code for real-money entries', () => {
    const node = mapGameEventToNode({
      kind: 'economy',
      currency: 'US Dollar',
      currencyCode: 'usd',
      amount: 800
    })
    expect(node.properties.amount).toEqual({ amount: 800, currency: 'USD' })
  })

  it('drops undefined properties (never writes empties)', () => {
    const node = mapGameEventToNode({ kind: 'player', displayName: 'Solo' })
    expect(Object.keys(node.properties)).toEqual(['displayName'])
  })

  it('throws on an unknown event kind', () => {
    expect(() => mapGameEventToNode({ kind: 'transform' } as unknown as GameEvent)).toThrow(
      /unknown game event/
    )
  })
})
