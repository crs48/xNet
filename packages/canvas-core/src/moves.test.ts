import type { CanvasObjectRecord } from './provider'
import { describe, expect, it } from 'vitest'
import {
  createCanvasObjectMoveId,
  createCrossTileObjectMove,
  reconcileCrossTileObjectMoves
} from './moves'

function createObject(id = 'object-1', x = 0, y = 0): CanvasObjectRecord {
  return {
    id,
    kind: 'shape',
    position: {
      x,
      y,
      width: 40,
      height: 40
    },
    display: {},
    preview: {}
  }
}

describe('cross-tile object moves', () => {
  it('creates source tombstone and target insert mutations with one move ID', () => {
    const object = createObject('shape-1', 400, 20)
    const move = createCrossTileObjectMove({
      object,
      sourceTileId: '0/0/0',
      targetTileId: '0/1/0',
      movedAt: 12,
      actorId: 'alice'
    })

    expect(move.moveId).toBe(
      createCanvasObjectMoveId({
        objectId: 'shape-1',
        sourceTileId: '0/0/0',
        targetTileId: '0/1/0',
        movedAt: 12,
        actorId: 'alice'
      })
    )
    expect(move.mutations[0]).toEqual({
      tileId: '0/0/0',
      objects: [],
      deletedObjectIds: ['shape-1'],
      tombstones: [move.tombstone],
      moveId: move.moveId
    })
    expect(move.mutations[1]).toEqual({
      tileId: '0/1/0',
      objects: [object],
      deletedObjectIds: [],
      tombstones: [],
      moveId: move.moveId
    })
  })

  it('keeps moved target copies and schedules stale source cleanup', () => {
    const sourceObject = createObject('shape-1', 20, 20)
    const targetObject = createObject('shape-1', 420, 20)
    const move = createCrossTileObjectMove({
      object: targetObject,
      sourceTileId: '0/0/0',
      targetTileId: '0/1/0',
      movedAt: 12,
      actorId: 'alice',
      moveId: 'move-a'
    })

    const result = reconcileCrossTileObjectMoves({
      candidates: [
        { tileId: '0/0/0', object: sourceObject, updatedAt: 10 },
        { tileId: '0/1/0', object: targetObject, updatedAt: 12, moveId: 'move-a' }
      ],
      tombstones: [move.tombstone]
    })

    expect(result.placements.map((placement) => placement.tileId)).toEqual(['0/1/0'])
    expect(result.cleanupMutations).toEqual([
      {
        tileId: '0/0/0',
        objects: [],
        deletedObjectIds: ['shape-1'],
        tombstones: [move.tombstone],
        moveId: 'move-a'
      }
    ])
    expect(result.duplicates).toEqual([
      {
        objectId: 'shape-1',
        retainedTileId: '0/1/0',
        discardedTileIds: ['0/0/0'],
        moveId: 'move-a',
        reason: 'tombstone-target'
      }
    ])
  })

  it('resolves concurrent cross-tile moves by latest tombstone', () => {
    const sourceObject = createObject('shape-1', 20, 20)
    const firstTarget = createObject('shape-1', 420, 20)
    const secondTarget = createObject('shape-1', 820, 20)
    const firstMove = createCrossTileObjectMove({
      object: firstTarget,
      sourceTileId: '0/0/0',
      targetTileId: '0/1/0',
      movedAt: 12,
      moveId: 'move-a'
    })
    const secondMove = createCrossTileObjectMove({
      object: secondTarget,
      sourceTileId: '0/0/0',
      targetTileId: '0/2/0',
      movedAt: 14,
      moveId: 'move-b'
    })

    const result = reconcileCrossTileObjectMoves({
      candidates: [
        { tileId: '0/0/0', object: sourceObject, updatedAt: 10 },
        { tileId: '0/1/0', object: firstTarget, updatedAt: 12, moveId: 'move-a' },
        { tileId: '0/2/0', object: secondTarget, updatedAt: 14, moveId: 'move-b' }
      ],
      tombstones: [firstMove.tombstone, secondMove.tombstone]
    })

    expect(result.placements.map((placement) => placement.tileId)).toEqual(['0/2/0'])
    expect(result.cleanupMutations.map((mutation) => mutation.tileId)).toEqual(['0/0/0', '0/1/0'])
    expect(result.duplicates[0]).toMatchObject({
      objectId: 'shape-1',
      retainedTileId: '0/2/0',
      discardedTileIds: ['0/0/0', '0/1/0'],
      moveId: 'move-b',
      reason: 'tombstone-target'
    })
  })

  it('falls back to newest candidate when a duplicate has no tombstone', () => {
    const result = reconcileCrossTileObjectMoves({
      candidates: [
        { tileId: '0/0/0', object: createObject('shape-1', 20, 20), updatedAt: 10 },
        { tileId: '0/1/0', object: createObject('shape-1', 420, 20), updatedAt: 11 }
      ]
    })

    expect(result.placements.map((placement) => placement.tileId)).toEqual(['0/1/0'])
    expect(result.cleanupMutations).toHaveLength(1)
    expect(result.duplicates[0]).toMatchObject({
      retainedTileId: '0/1/0',
      discardedTileIds: ['0/0/0'],
      reason: 'newest-candidate'
    })
  })

  it('hides tombstoned source copies until the target insert arrives', () => {
    const sourceObject = createObject('shape-1', 20, 20)
    const targetObject = createObject('shape-1', 420, 20)
    const move = createCrossTileObjectMove({
      object: targetObject,
      sourceTileId: '0/0/0',
      targetTileId: '0/1/0',
      movedAt: 12,
      moveId: 'move-a'
    })

    const result = reconcileCrossTileObjectMoves({
      candidates: [{ tileId: '0/0/0', object: sourceObject, updatedAt: 10 }],
      tombstones: [move.tombstone]
    })

    expect(result.placements).toEqual([])
    expect(result.cleanupMutations).toEqual([
      {
        tileId: '0/0/0',
        objects: [],
        deletedObjectIds: ['shape-1'],
        tombstones: [move.tombstone],
        moveId: 'move-a'
      }
    ])
  })

  it('reconciles offline edits replayed from multiple tile rooms after reconnect', () => {
    const sourceObject = createObject('shape-1', 20, 20)
    const firstTarget = createObject('shape-1', 420, 20)
    const secondTarget = createObject('shape-1', 820, 20)
    const firstMove = createCrossTileObjectMove({
      object: firstTarget,
      sourceTileId: '0/0/0',
      targetTileId: '0/1/0',
      movedAt: 20,
      actorId: 'offline-client',
      moveId: 'offline-move-a'
    })
    const secondMove = createCrossTileObjectMove({
      object: secondTarget,
      sourceTileId: '0/1/0',
      targetTileId: '0/2/0',
      movedAt: 30,
      actorId: 'offline-client',
      moveId: 'offline-move-b'
    })
    const replayedMutations = [
      secondMove.mutations[1],
      firstMove.mutations[1],
      firstMove.mutations[0],
      secondMove.mutations[0]
    ]

    const result = reconcileCrossTileObjectMoves({
      candidates: [
        { tileId: '0/0/0', object: sourceObject, updatedAt: 10 },
        { tileId: '0/1/0', object: firstTarget, updatedAt: 20, moveId: firstMove.moveId },
        { tileId: '0/2/0', object: secondTarget, updatedAt: 30, moveId: secondMove.moveId }
      ],
      tombstones: replayedMutations.flatMap((mutation) => mutation.tombstones)
    })

    expect(result.placements).toEqual([
      {
        tileId: '0/2/0',
        object: secondTarget,
        updatedAt: 30,
        moveId: 'offline-move-b'
      }
    ])
    expect(result.cleanupMutations.map((mutation) => mutation.tileId)).toEqual(['0/0/0', '0/1/0'])
    expect(result.cleanupMutations.map((mutation) => mutation.deletedObjectIds)).toEqual([
      ['shape-1'],
      ['shape-1']
    ])
    expect(result.cleanupMutations[1]?.tombstones).toEqual([secondMove.tombstone])
    expect(result.duplicates[0]).toMatchObject({
      objectId: 'shape-1',
      retainedTileId: '0/2/0',
      discardedTileIds: ['0/0/0', '0/1/0'],
      moveId: 'offline-move-b',
      reason: 'tombstone-target'
    })
  })
})
