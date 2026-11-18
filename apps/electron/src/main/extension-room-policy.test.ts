import { describe, expect, it } from 'vitest'
import {
  authorizeRoomJoin,
  decodeRoomFrame,
  decodeRoomInvitation,
  decodeRoomRequest,
  encodeRoomFrame,
  encodeRoomInvitation,
  roomBudget,
  ROOM_LIFETIME
} from './extension-room-policy'
const now = 10000
const invite = {
  version: 1 as const,
  room: '1'.repeat(64),
  secret: '2'.repeat(64),
  application: '3'.repeat(64),
  ticket: 'ticket',
  expiresAt: now + ROOM_LIFETIME
}
describe('extension room authority', () => {
  it('accepts only an unexpired invitation for this exact version', () => {
    expect(decodeRoomInvitation(encodeRoomInvitation(invite), invite.application, now)).toEqual(
      invite
    )
    for (const value of [
      { ...invite, expiresAt: now },
      { ...invite, expiresAt: now + ROOM_LIFETIME + 1 },
      { ...invite, secret: 'bad' },
      { ...invite, application: '4'.repeat(64) }
    ])
      expect(() =>
        decodeRoomInvitation(encodeRoomInvitation(value), invite.application, now)
      ).toThrow()
    expect(() =>
      decodeRoomInvitation('https://evil.example/#token', invite.application, now)
    ).toThrow()
  })
  it('requires the room, secret, version and application at admission', () => {
    expect(() => authorizeRoomJoin(invite, invite, now)).not.toThrow()
    for (const value of [
      null,
      {},
      { ...invite, secret: '4'.repeat(64) },
      { ...invite, room: '4'.repeat(64) },
      { ...invite, application: '4'.repeat(64) },
      { ...invite, version: 2 }
    ])
      expect(() => authorizeRoomJoin(value, invite, now)).toThrow()
    expect(() => authorizeRoomJoin(invite, invite, invite.expiresAt)).toThrow()
  })
  it('bounds payloads and rejects malformed frames and nonfinite sequence numbers', () => {
    expect(decodeRoomFrame(encodeRoomFrame(1, { x: 2 }))).toEqual({
      sequence: 1,
      data: { x: 2 },
      heartbeat: false
    })
    expect(() => encodeRoomFrame(1, 'x'.repeat(1000))).toThrow()
    for (const value of [
      { sequence: -1, data: 1, heartbeat: false },
      { sequence: 2.5, data: 1, heartbeat: false },
      { sequence: 1, heartbeat: false },
      { sequence: 1, data: 1, heartbeat: false, peer: 'forged' }
    ])
      expect(() => decodeRoomFrame(Array.from(Buffer.from(JSON.stringify(value))))).toThrow()
    expect(() => decodeRoomFrame(Array(1001).fill(0))).toThrow()
  })
  it('never accepts caller-selected endpoints or relays through the API', () => {
    expect(decodeRoomRequest({ operation: 'host' })).toEqual({ operation: 'host' })
    for (const value of [
      null,
      { operation: 'host', relay: 'http://localhost' },
      { operation: 'connect', url: 'anything' },
      { operation: 'join', invitation: 3 }
    ])
      expect(() => decodeRoomRequest(value)).toThrow()
  })
  it('enforces and replenishes a finite send budget', () => {
    const budget = roomBudget(2)
    budget(now)
    budget(now)
    expect(() => budget(now)).toThrow()
    expect(() => budget(now + 1000)).not.toThrow()
  })
})
