/** Ephemeral multiplayer authority belongs to one running extension surface. */
export type RoomValue =
  | null
  | boolean
  | number
  | string
  | RoomValue[]
  | { [key: string]: RoomValue }
export type RoomPeer = {
  id: string
  route: 'direct' | 'relay' | 'connecting'
  latencyMs: number | null
}
export type RoomState = {
  id: string
  self: string
  host: string
  role: 'host' | 'guest'
  invitation: string | null
  expiresAt: number
  relayAvailable: boolean
  peers: RoomPeer[]
}
export type RoomEvent =
  | { type: 'state'; room: RoomState | null }
  | { type: 'message'; peer: string; data: RoomValue }
  | { type: 'error'; message: string }
  | { type: 'status'; message: string }
export type RoomRequest =
  | { operation: 'host' | 'leave' }
  | { operation: 'join'; invitation: string }
