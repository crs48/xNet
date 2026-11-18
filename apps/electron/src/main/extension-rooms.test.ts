import type { RoomEvent } from '../../../../packages/workbench/src/communities/extension-room-contract'
import { EndpointAddr, EndpointId, EndpointTicket } from '@number0/iroh'
import { describe, expect, it, vi } from 'vitest'
import { decodeRoomInvitation, encodeRoomInvitation } from './extension-room-policy'
import { createExtensionRooms } from './extension-rooms'
const application = 'a'.repeat(64)
const waitUntil = async (test: () => boolean) => {
  const until = Date.now() + 5000
  while (!test()) {
    if (Date.now() > until) throw new Error('No expected room event.')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
describe('real Iroh extension rooms', () => {
  it('requires consent before binding, and handles revoked pending consent', async () => {
    const denied = createExtensionRooms({
      application,
      active: () => true,
      confirm: async () => false,
      emit: () => {},
      nearbyOnly: true
    })
    expect(await denied.request({ operation: 'host' })).toBeNull()
    expect(() => denied.send('not authorized')).toThrow()
    let active = true
    const revoked = createExtensionRooms({
      application,
      active: () => active,
      confirm: async () => {
        active = false
        return true
      },
      emit: () => {},
      nearbyOnly: true
    })
    await expect(revoked.request({ operation: 'host' })).rejects.toThrow('closed')
    await denied.close()
    await revoked.close()
  })
  it('authenticates two native endpoints, sends both ways, and revokes on leave', async () => {
    const received: RoomEvent[] = [],
      hostEvents: RoomEvent[] = []
    const host = createExtensionRooms({
      application,
      active: () => true,
      confirm: async () => true,
      emit: (event) => hostEvents.push(event),
      nearbyOnly: true
    })
    const guest = createExtensionRooms({
      application,
      active: () => true,
      confirm: async () => true,
      emit: (event) => received.push(event),
      nearbyOnly: true
    })
    try {
      const hosted = await host.request({ operation: 'host' })
      const joined = await guest.request({ operation: 'join', invitation: hosted!.invitation! })
      expect(joined?.host).toBe(hosted?.self)
      await waitUntil(() =>
        hostEvents.some((event) => event.type === 'state' && event.room?.peers.length === 1)
      )
      guest.send({ input: [1, 0] })
      await waitUntil(() =>
        hostEvents.some((event) => event.type === 'message' && event.peer === joined?.self)
      )
      host.send({ tick: 1, x: 3 })
      await waitUntil(() =>
        received.some((event) => event.type === 'message' && event.peer === hosted?.self)
      )
      expect(received.find((event) => event.type === 'message')).toMatchObject({
        data: { tick: 1, x: 3 }
      })
      await host.close()
      await waitUntil(() => received.some((event) => event.type === 'state' && event.room === null))
      expect(() => guest.send({ input: [1, 0] })).toThrow()
    } finally {
      await guest.close()
      await host.close()
    }
  }, 20000)
  it('rejects a forged secret at the remote host, not just the local parser', async () => {
    const events: RoomEvent[] = []
    const host = createExtensionRooms({
      application,
      active: () => true,
      confirm: async () => true,
      emit: (event) => events.push(event),
      nearbyOnly: true
    })
    const guest = createExtensionRooms({
      application,
      active: () => true,
      confirm: async () => true,
      emit: () => {},
      nearbyOnly: true
    })
    try {
      const hosted = await host.request({ operation: 'host' })
      const invite = decodeRoomInvitation(hosted!.invitation!, application)
      const forged = encodeRoomInvitation({ ...invite, secret: 'b'.repeat(64) })
      await expect(guest.request({ operation: 'join', invitation: forged })).rejects.toThrow()
      expect(events.some((event) => event.type === 'state' && event.room?.peers.length)).toBe(false)
    } finally {
      await guest.close()
      await host.close()
    }
  }, 20000)
  it('rejects arbitrary relays before asking for consent or dialing', async () => {
    const confirm = vi.fn(async () => true)
    const guest = createExtensionRooms({
      application,
      active: () => true,
      confirm,
      emit: () => {},
      nearbyOnly: true
    })
    const ticket = EndpointTicket.fromAddr(
      new EndpointAddr(EndpointId.fromBytes(Array(32).fill(1)), 'https://attacker.example/')
    ).toString()
    const invitation = encodeRoomInvitation({
      version: 1,
      room: '1'.repeat(64),
      secret: '2'.repeat(64),
      application,
      ticket,
      expiresAt: Date.now() + 10000
    })
    await expect(guest.request({ operation: 'join', invitation })).rejects.toThrow(
      'unsupported relay'
    )
    expect(confirm).not.toHaveBeenCalled()
    await guest.close()
  })
  it('caps rooms at four players and frees a place when a player leaves', async () => {
    const options = {
      application,
      active: () => true,
      confirm: async () => true,
      emit: () => {},
      nearbyOnly: true
    }
    const hostEvents: RoomEvent[] = []
    const host = createExtensionRooms({ ...options, emit: (event) => hostEvents.push(event) })
    const guests = Array.from({ length: 4 }, () => createExtensionRooms(options))
    try {
      const state = await host.request({ operation: 'host' })
      const join = { operation: 'join' as const, invitation: state!.invitation! }
      await Promise.all(
        guests.slice(0, 3).map(async (guest, index) => {
          try {
            await guest.request(join)
          } catch (cause) {
            throw new Error('Initial guest ' + index + ' failed', { cause })
          }
        })
      )
      await expect(guests[3].request(join)).rejects.toThrow()
      await guests[0].close()
      await waitUntil(() => {
        const event = hostEvents.at(-1)
        return event?.type === 'state' && event.room?.peers.length === 2
      })
      const rejoined = await guests[3].request(join).catch((cause) => {
        throw new Error('Replacement guest failed', { cause })
      })
      expect(rejoined?.role).toBe('guest')
    } finally {
      for (const guest of guests) await guest.close()
      await host.close()
    }
  }, 30000)
  it('does not start a room after its permission request timed out', async () => {
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    const room = createExtensionRooms({
      application,
      active: () => true,
      confirm: async () => {
        clock.mockReturnValue(now + 90001)
        return true
      },
      emit: () => {},
      nearbyOnly: true
    })
    try {
      await expect(room.request({ operation: 'host' })).rejects.toThrow('expired')
    } finally {
      clock.mockRestore()
      await room.close()
    }
  })
})
