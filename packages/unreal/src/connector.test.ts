import type { GameEvent } from './events'
import type { ConnectorSyncContext } from '@xnetjs/plugins'
import { GAME_SCHEMA_IRIS } from '@xnetjs/data'
import { defineConnector } from '@xnetjs/plugins'
import { describe, expect, it, vi } from 'vitest'
import { buildUnrealConnector, extractEvents } from './connector'
import { GranularityError } from './granularity'

/** A fake sync context that records created nodes and serves a fixed event list. */
function fakeContext(events: GameEvent[]): {
  ctx: ConnectorSyncContext
  created: Array<{ schemaId: string; properties: Record<string, unknown> }>
} {
  const created: Array<{ schemaId: string; properties: Record<string, unknown> }> = []
  const ctx = {
    env: { UNREAL_API_TOKEN: 'secret-token' },
    fetch: vi.fn(async () => events),
    store: {
      create: async (node: { schemaId: string; properties: Record<string, unknown> }) => {
        created.push(node)
        return { id: `node:${created.length}`, schemaId: node.schemaId }
      },
      get: async () => null,
      update: async () => undefined
    },
    space: 'space:game-aether'
  } as unknown as ConnectorSyncContext
  return { ctx, created }
}

describe('buildUnrealConnector', () => {
  it('produces a coherent definition over the whole durable pack', () => {
    const def = buildUnrealConnector({ apiBaseUrl: 'https://api.example-game.com' })
    expect(def.id).toBe('fyi.xnet.connector.unreal')
    expect(def.capabilities.schemaWrite).toEqual([...GAME_SCHEMA_IRIS])
    expect(def.capabilities.network).toContain('api.example-game.com')
    expect(def.sync.schemas).toEqual([...GAME_SCHEMA_IRIS])
    expect(def.capabilities.secrets).toContain('UNREAL_*')
  })

  it('is a valid input to the real defineConnector (no structural drift)', () => {
    const def = buildUnrealConnector({ apiBaseUrl: 'https://api.example-game.com' })
    const connector = defineConnector(def)
    expect(connector.module.hub?.featureId).toBe('fyi.xnet.connector.unreal.sync')
    expect(connector.sync.schemas.length).toBeGreaterThan(0)
  })

  it('rejects a netcode-frequency cadence at build time', () => {
    expect(() =>
      buildUnrealConnector({ apiBaseUrl: 'https://api.example-game.com', cadence: { everyMs: 16 } })
    ).toThrow(GranularityError)
  })

  it('rejects a non-durable schema target', () => {
    expect(() =>
      buildUnrealConnector({
        apiBaseUrl: 'https://api.example-game.com',
        schemas: ['xnet://xnet.fyi/ActorTransform@1.0.0']
      })
    ).toThrow(GranularityError)
  })

  it('allows narrowing to a subset of durable schemas', () => {
    const def = buildUnrealConnector({
      apiBaseUrl: 'https://api.example-game.com',
      schemas: ['xnet://xnet.fyi/Achievement@1.0.0']
    })
    expect(def.sync.schemas).toEqual(['xnet://xnet.fyi/Achievement@1.0.0'])
  })

  it('only contributes agent tools when a query reader is provided', () => {
    const without = buildUnrealConnector({ apiBaseUrl: 'https://api.example-game.com' })
    expect(without.agentTools).toBeUndefined()

    const query = vi.fn(async () => [{ id: 'node:1' }])
    const withTools = buildUnrealConnector({ apiBaseUrl: 'https://api.example-game.com', query })
    expect(withTools.agentTools).toHaveLength(1)
    expect(withTools.agentTools?.[0].name).toBe('unreal_list_game_nodes')
  })

  it('agent tool invoke reads through the injected governed query', async () => {
    const query = vi.fn(async () => [{ id: 'node:1' }])
    const def = buildUnrealConnector({ apiBaseUrl: 'https://api.example-game.com', query })
    await def.agentTools?.[0].invoke({ schemaId: 'xnet://xnet.fyi/Achievement@1.0.0', limit: 5 })
    expect(query).toHaveBeenCalledWith('xnet://xnet.fyi/Achievement@1.0.0', 5)
  })

  describe('pull', () => {
    it('maps fetched events into created nodes and counts writes', async () => {
      const def = buildUnrealConnector({ apiBaseUrl: 'https://api.example-game.com' })
      const events: GameEvent[] = [
        { kind: 'player', displayName: 'Nova' },
        { kind: 'item', name: 'Aether Blade', rarity: 'epic' },
        { kind: 'economy', currency: 'gold', amount: 500 }
      ]
      const { ctx, created } = fakeContext(events)
      const result = await def.sync.pull(ctx)
      expect(result.written).toBe(3)
      expect(created.map((n) => n.schemaId)).toEqual([
        'xnet://xnet.fyi/PlayerIdentity@1.0.0',
        'xnet://xnet.fyi/GameItem@1.0.0',
        'xnet://xnet.fyi/GameEconomyEntry@1.0.0'
      ])
    })

    it('sends the broker-scoped bearer token and hits the /events endpoint', async () => {
      const def = buildUnrealConnector({ apiBaseUrl: 'https://api.example-game.com' })
      const { ctx } = fakeContext([])
      await def.sync.pull(ctx)
      expect(ctx.fetch).toHaveBeenCalledWith('https://api.example-game.com/events', {
        headers: { Authorization: 'Bearer secret-token' }
      })
    })
  })
})

describe('extractEvents', () => {
  it('accepts a bare array', () => {
    expect(extractEvents([{ kind: 'player', displayName: 'A' }])).toHaveLength(1)
  })
  it('accepts an { events } envelope', () => {
    expect(extractEvents({ events: [{ kind: 'player', displayName: 'A' }] })).toHaveLength(1)
  })
  it('returns empty for anything else', () => {
    expect(extractEvents(null)).toEqual([])
    expect(extractEvents({ data: 1 })).toEqual([])
  })
})
