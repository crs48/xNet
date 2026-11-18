import type {
  RoomRequest,
  RoomValue
} from '../../../../packages/workbench/src/communities/extension-room-contract'
import { timingSafeEqual } from 'node:crypto'

export const ROOM_ALPN = Array.from(Buffer.from('xnet/extension-room/1'))
export const ROOM_LIFETIME = 60 * 60_000
export const ROOM_FRAME_LIMIT = 1000
export const ROOM_PEER_LIMIT = 3
const hex = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
export type RoomInvitation = {
  version: 1
  room: string
  secret: string
  application: string
  ticket: string
  expiresAt: number
}
export function decodeRoomRequest(value: unknown): RoomRequest {
  const request = value as RoomRequest
  if (
    !request ||
    !['host', 'join', 'leave'].includes(request.operation) ||
    Object.keys(request).some((key) => !['operation', 'invitation'].includes(key)) ||
    (request.operation === 'join' &&
      (typeof request.invitation !== 'string' || request.invitation.length > 12000))
  )
    throw new Error('Invalid multiplayer request.')
  return request
}
export const encodeRoomInvitation = (value: RoomInvitation) =>
  `xnet://play#${Buffer.from(JSON.stringify(value)).toString('base64url')}`
export function decodeRoomInvitation(
  raw: string,
  application: string,
  now = Date.now()
): RoomInvitation {
  if (typeof raw !== 'string' || raw.length > 12000) throw new Error('Invalid room invitation.')
  const url = new URL(raw.trim())
  if (
    url.protocol !== 'xnet:' ||
    url.hostname !== 'play' ||
    url.pathname ||
    url.search ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error('Paste an xNet game invitation.')
  const value = JSON.parse(Buffer.from(url.hash.slice(1), 'base64url').toString()) as RoomInvitation
  if (
    !value ||
    value.version !== 1 ||
    !hex(value.room) ||
    !hex(value.secret) ||
    !hex(value.application) ||
    value.application !== application ||
    typeof value.ticket !== 'string' ||
    value.ticket.length > 4096 ||
    !Number.isSafeInteger(value.expiresAt) ||
    value.expiresAt <= now ||
    value.expiresAt > now + ROOM_LIFETIME
  )
    throw new Error('This invitation is expired or belongs to a different extension version.')
  return value
}
export function authorizeRoomJoin(raw: unknown, expected: RoomInvitation, now = Date.now()): void {
  const value = raw as Partial<RoomInvitation> | null
  if (
    !value ||
    value.version !== 1 ||
    value.room !== expected.room ||
    value.application !== expected.application ||
    expected.expiresAt <= now ||
    !hex(value.secret) ||
    !timingSafeEqual(Buffer.from(value.secret, 'hex'), Buffer.from(expected.secret, 'hex'))
  )
    throw new Error('Room access denied.')
}
export function encodeRoomFrame(sequence: number, data: RoomValue, heartbeat = false): number[] {
  const bytes = Buffer.from(JSON.stringify({ sequence, data, heartbeat }))
  if (bytes.length > ROOM_FRAME_LIMIT)
    throw new Error('Room update exceeds 1,000 bytes. Send compact state snapshots.')
  return Array.from(bytes)
}
export function decodeRoomFrame(bytes: number[]): {
  sequence: number
  data: RoomValue
  heartbeat: boolean
} {
  if (bytes.length > ROOM_FRAME_LIMIT) throw new Error('Oversized room update.')
  const value = JSON.parse(Buffer.from(bytes).toString()) as {
    sequence: number
    data: RoomValue
    heartbeat: boolean
  }
  if (
    !value ||
    !Number.isSafeInteger(value.sequence) ||
    value.sequence < 0 ||
    typeof value.heartbeat !== 'boolean' ||
    !Object.hasOwn(value, 'data') ||
    Object.keys(value).some((key) => !['sequence', 'data', 'heartbeat'].includes(key))
  )
    throw new Error('Invalid room update.')
  return value
}
/** Fixed windows bound work; the maps that own these budgets are bounded separately. */
export function roomBudget(limit: number, interval = 1000) {
  let start = 0,
    count = 0
  return (now = Date.now()) => {
    if (now - start >= interval) {
      start = now
      count = 0
    }
    if (++count > limit) throw new Error('Multiplayer rate limit exceeded.')
  }
}
