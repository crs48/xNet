import { describe, expect, it } from 'vitest'
import {
  createCanvasTileRoomId,
  createTileAwarenessFanoutPlan,
  DEFAULT_CANVAS_TILE_ROOM_PREFIX
} from './collaboration'
import { createTileId } from './tiles'

function createParticipants(input: {
  tileId: string
  clientPrefix: string
  count: number
}): { clientId: string; tileId: string }[] {
  return Array.from({ length: input.count }, (_, index) => {
    return {
      clientId: `${input.clientPrefix}-${String(index).padStart(3, '0')}`,
      tileId: input.tileId
    }
  })
}

describe('tile awareness fanout planning', () => {
  it('creates stable room IDs from tile IDs', () => {
    expect(createCanvasTileRoomId('10/511/382')).toBe(
      `${DEFAULT_CANVAS_TILE_ROOM_PREFIX}:10/511/382`
    )
    expect(createCanvasTileRoomId('10/511/382', 'custom-room:')).toBe('custom-room:10/511/382')
  })

  it('isolates 100 users in one tile and 100 users in another tile', () => {
    const firstTileId = createTileId({ z: 10, x: 511, y: 382 })
    const secondTileId = createTileId({ z: 10, x: 998, y: 100 })
    const plan = createTileAwarenessFanoutPlan({
      participants: [
        ...createParticipants({ tileId: firstTileId, clientPrefix: 'first', count: 100 }),
        ...createParticipants({ tileId: secondTileId, clientPrefix: 'second', count: 100 })
      ]
    })

    expect(plan.tileRooms).toHaveLength(2)
    expect(plan.uniqueClientCount).toBe(200)
    expect(plan.totalClientSubscriptions).toBe(200)
    expect(plan.maxRoomClientCount).toBe(100)
    expect(plan.crossTileDeliveryCount).toBe(0)
    expect(plan.totalRoomDeliveryCount).toBe(19_800)
    expect(plan.avoidedGlobalDeliveryCount).toBe(20_000)
    expect(plan.tileRooms.map((room) => room.peerDeliveryCount)).toEqual([9_900, 9_900])
    expect(plan.tileRooms.every((room) => room.clientIds.length === 100)).toBe(true)
  })

  it('deduplicates repeated client subscriptions in the same tile room', () => {
    const plan = createTileAwarenessFanoutPlan({
      participants: [
        { clientId: 'client-1', tileId: '0/0/0' },
        { clientId: 'client-1', tileId: '0/0/0' },
        { clientId: 'client-2', tileId: '0/0/0' }
      ]
    })

    expect(plan.tileRooms).toHaveLength(1)
    expect(plan.tileRooms[0]?.clientIds).toEqual(['client-1', 'client-2'])
    expect(plan.tileRooms[0]?.peerDeliveryCount).toBe(2)
    expect(plan.totalClientSubscriptions).toBe(2)
  })
})
