/**
 * Tile-scoped collaboration planning for Canvas v3.
 */

export const DEFAULT_CANVAS_TILE_ROOM_PREFIX = 'xnet-canvas-tile'

export type CanvasTilePresenceParticipant = {
  clientId: string
  tileId: string
}

export type CanvasTileAwarenessRoomPlan = {
  tileId: string
  roomId: string
  clientIds: readonly string[]
  peerDeliveryCount: number
}

export type CanvasTileAwarenessFanoutPlan = {
  tileRooms: readonly CanvasTileAwarenessRoomPlan[]
  uniqueClientCount: number
  totalClientSubscriptions: number
  maxRoomClientCount: number
  totalRoomDeliveryCount: number
  avoidedGlobalDeliveryCount: number
  crossTileDeliveryCount: number
}

export type CreateTileAwarenessFanoutPlanInput = {
  participants: readonly CanvasTilePresenceParticipant[]
  roomPrefix?: string
}

function normalizeRoomPrefix(roomPrefix: string | undefined): string {
  const prefix = roomPrefix?.trim() ?? DEFAULT_CANVAS_TILE_ROOM_PREFIX

  return prefix.length === 0 ? DEFAULT_CANVAS_TILE_ROOM_PREFIX : prefix.replace(/:+$/, '')
}

export function createCanvasTileRoomId(
  tileId: string,
  roomPrefix = DEFAULT_CANVAS_TILE_ROOM_PREFIX
): string {
  return `${normalizeRoomPrefix(roomPrefix)}:${tileId}`
}

function countRoomPeerDeliveries(clientCount: number): number {
  return clientCount * Math.max(clientCount - 1, 0)
}

export function createTileAwarenessFanoutPlan(
  input: CreateTileAwarenessFanoutPlanInput
): CanvasTileAwarenessFanoutPlan {
  const roomPrefix = normalizeRoomPrefix(input.roomPrefix)
  const roomClientIds = input.participants.reduce((rooms, participant) => {
    const clientIds = rooms.get(participant.tileId) ?? new Set<string>()
    clientIds.add(participant.clientId)
    rooms.set(participant.tileId, clientIds)

    return rooms
  }, new Map<string, Set<string>>())

  const tileRooms = Array.from(roomClientIds.entries())
    .map(([tileId, clientIds]) => {
      const orderedClientIds = Array.from(clientIds).sort()

      return {
        tileId,
        roomId: createCanvasTileRoomId(tileId, roomPrefix),
        clientIds: orderedClientIds,
        peerDeliveryCount: countRoomPeerDeliveries(orderedClientIds.length)
      }
    })
    .sort((left, right) => left.tileId.localeCompare(right.tileId))
  const uniqueClientCount = new Set(input.participants.map((participant) => participant.clientId))
    .size
  const totalClientSubscriptions = tileRooms.reduce(
    (total, room) => total + room.clientIds.length,
    0
  )
  const totalRoomDeliveryCount = tileRooms.reduce(
    (total, room) => total + room.peerDeliveryCount,
    0
  )
  const globalDeliveryCount = countRoomPeerDeliveries(uniqueClientCount)

  return {
    tileRooms,
    uniqueClientCount,
    totalClientSubscriptions,
    maxRoomClientCount: Math.max(0, ...tileRooms.map((room) => room.clientIds.length)),
    totalRoomDeliveryCount,
    avoidedGlobalDeliveryCount: Math.max(globalDeliveryCount - totalRoomDeliveryCount, 0),
    crossTileDeliveryCount: 0
  }
}
