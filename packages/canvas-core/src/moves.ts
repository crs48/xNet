/**
 * Cross-tile move helpers for Canvas v3 object ownership.
 */

import type { CanvasObjectRecord, CanvasObjectTombstone, CanvasTileMutation } from './provider'

export type CreateCanvasObjectMoveIdInput = {
  objectId: string
  sourceTileId: string
  targetTileId: string
  movedAt: number
  actorId?: string
}

export type CreateCrossTileObjectMoveInput = {
  object: CanvasObjectRecord
  sourceTileId: string
  targetTileId: string
  movedAt: number
  actorId?: string
  moveId?: string
}

export type CrossTileObjectMove = {
  moveId: string
  tombstone: CanvasObjectTombstone
  mutations: readonly [CanvasTileMutation, CanvasTileMutation]
}

export type CanvasObjectPlacementCandidate = {
  tileId: string
  object: CanvasObjectRecord
  updatedAt: number
  moveId?: string
}

export type CanvasDuplicateObjectResolution = {
  objectId: string
  retainedTileId?: string
  discardedTileIds: readonly string[]
  moveId?: string
  reason: 'tombstone-target' | 'tombstone-pending-target' | 'newest-candidate'
}

export type ReconcileCrossTileObjectMovesInput = {
  candidates: readonly CanvasObjectPlacementCandidate[]
  tombstones?: readonly CanvasObjectTombstone[]
}

export type ReconcileCrossTileObjectMovesResult = {
  placements: readonly CanvasObjectPlacementCandidate[]
  cleanupMutations: readonly CanvasTileMutation[]
  duplicates: readonly CanvasDuplicateObjectResolution[]
}

function stableMovePart(value: string | number | undefined): string {
  return encodeURIComponent(String(value ?? 'local'))
}

export function createCanvasObjectMoveId({
  objectId,
  sourceTileId,
  targetTileId,
  movedAt,
  actorId
}: CreateCanvasObjectMoveIdInput): string {
  return [
    stableMovePart(actorId),
    stableMovePart(objectId),
    stableMovePart(sourceTileId),
    stableMovePart(targetTileId),
    stableMovePart(movedAt)
  ].join(':')
}

export function createCrossTileObjectMove({
  object,
  sourceTileId,
  targetTileId,
  movedAt,
  actorId,
  moveId = createCanvasObjectMoveId({
    objectId: object.id,
    sourceTileId,
    targetTileId,
    movedAt,
    actorId
  })
}: CreateCrossTileObjectMoveInput): CrossTileObjectMove {
  const tombstone: CanvasObjectTombstone = {
    objectId: object.id,
    moveId,
    sourceTileId,
    targetTileId,
    deletedAt: movedAt,
    actorId
  }

  return {
    moveId,
    tombstone,
    mutations: [
      {
        tileId: sourceTileId,
        objects: [],
        deletedObjectIds: [object.id],
        tombstones: [tombstone],
        moveId
      },
      {
        tileId: targetTileId,
        objects: [object],
        deletedObjectIds: [],
        tombstones: [],
        moveId
      }
    ]
  }
}

function compareText(left: string | undefined, right: string | undefined): number {
  return (left ?? '').localeCompare(right ?? '')
}

function compareTombstone(
  left: CanvasObjectTombstone,
  right: CanvasObjectTombstone | undefined
): number {
  if (!right) {
    return 1
  }

  return (
    left.deletedAt - right.deletedAt ||
    compareText(left.moveId, right.moveId) ||
    compareText(left.targetTileId, right.targetTileId)
  )
}

function compareCandidate(
  left: CanvasObjectPlacementCandidate,
  right: CanvasObjectPlacementCandidate
): number {
  return (
    left.updatedAt - right.updatedAt ||
    compareText(left.moveId, right.moveId) ||
    compareText(left.tileId, right.tileId)
  )
}

function getLatestTombstones(
  tombstones: readonly CanvasObjectTombstone[]
): Map<string, CanvasObjectTombstone> {
  return tombstones.reduce<Map<string, CanvasObjectTombstone>>((latest, tombstone) => {
    const existing = latest.get(tombstone.objectId)

    if (compareTombstone(tombstone, existing) > 0) {
      latest.set(tombstone.objectId, tombstone)
    }

    return latest
  }, new Map())
}

function groupCandidatesByObjectId(
  candidates: readonly CanvasObjectPlacementCandidate[]
): Map<string, CanvasObjectPlacementCandidate[]> {
  return candidates.reduce<Map<string, CanvasObjectPlacementCandidate[]>>((groups, candidate) => {
    const existing = groups.get(candidate.object.id) ?? []

    groups.set(candidate.object.id, [...existing, candidate])
    return groups
  }, new Map())
}

function newestCandidate(
  candidates: readonly CanvasObjectPlacementCandidate[]
): CanvasObjectPlacementCandidate | undefined {
  return [...candidates].sort(compareCandidate).at(-1)
}

function choosePlacement(input: {
  candidates: readonly CanvasObjectPlacementCandidate[]
  tombstone?: CanvasObjectTombstone
}): {
  placement?: CanvasObjectPlacementCandidate
  reason: CanvasDuplicateObjectResolution['reason']
} {
  if (!input.tombstone) {
    return {
      placement: newestCandidate(input.candidates),
      reason: 'newest-candidate'
    }
  }

  const matchingTarget = input.candidates.filter((candidate) => {
    return (
      candidate.tileId === input.tombstone?.targetTileId &&
      candidate.moveId === input.tombstone.moveId
    )
  })
  const fallbackTarget = input.candidates.filter((candidate) => {
    return candidate.tileId === input.tombstone?.targetTileId
  })
  const nonSourceCandidates = input.candidates.filter((candidate) => {
    return candidate.tileId !== input.tombstone?.sourceTileId
  })

  return {
    placement:
      newestCandidate(matchingTarget) ??
      newestCandidate(fallbackTarget) ??
      newestCandidate(nonSourceCandidates),
    reason:
      matchingTarget.length > 0 || fallbackTarget.length > 0
        ? 'tombstone-target'
        : 'tombstone-pending-target'
  }
}

function createCleanupMutations(input: {
  discarded: readonly CanvasObjectPlacementCandidate[]
  tombstonesByObjectId: ReadonlyMap<string, CanvasObjectTombstone>
}): CanvasTileMutation[] {
  const tileIds = Array.from(new Set(input.discarded.map((candidate) => candidate.tileId))).sort()

  return tileIds.map((tileId) => {
    const discardedInTile = input.discarded.filter((candidate) => candidate.tileId === tileId)
    const tombstones = discardedInTile
      .map((candidate) => input.tombstonesByObjectId.get(candidate.object.id))
      .filter((tombstone): tombstone is CanvasObjectTombstone => {
        return Boolean(tombstone && tombstone.sourceTileId === tileId)
      })

    return {
      tileId,
      objects: [],
      deletedObjectIds: discardedInTile.map((candidate) => candidate.object.id).sort(),
      tombstones,
      moveId: tombstones.at(-1)?.moveId
    }
  })
}

export function reconcileCrossTileObjectMoves({
  candidates,
  tombstones = []
}: ReconcileCrossTileObjectMovesInput): ReconcileCrossTileObjectMovesResult {
  const latestTombstones = getLatestTombstones(tombstones)
  const candidateGroups = groupCandidatesByObjectId(candidates)
  const resolutionRows = Array.from(candidateGroups.entries()).map(
    ([objectId, objectCandidates]) => {
      const tombstone = latestTombstones.get(objectId)
      const { placement, reason } = choosePlacement({
        candidates: objectCandidates,
        tombstone
      })
      const discarded = objectCandidates.filter((candidate) => candidate !== placement)

      return {
        objectId,
        placement,
        discarded,
        duplicate:
          discarded.length > 0
            ? {
                objectId,
                retainedTileId: placement?.tileId,
                discardedTileIds: discarded.map((candidate) => candidate.tileId).sort(),
                moveId: tombstone?.moveId ?? placement?.moveId,
                reason
              }
            : undefined
      }
    }
  )
  const placements = resolutionRows
    .flatMap((row) => (row.placement ? [row.placement] : []))
    .sort(
      (left, right) =>
        compareText(left.object.id, right.object.id) || compareText(left.tileId, right.tileId)
    )
  const discarded = resolutionRows.flatMap((row) => row.discarded)

  return {
    placements,
    cleanupMutations: createCleanupMutations({
      discarded,
      tombstonesByObjectId: latestTombstones
    }),
    duplicates: resolutionRows
      .flatMap((row) => (row.duplicate ? [row.duplicate] : []))
      .sort((left, right) => compareText(left.objectId, right.objectId))
  }
}
