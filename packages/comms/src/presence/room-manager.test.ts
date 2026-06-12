import { describe, expect, it } from 'vitest'
import { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { peersInCall, remotePeers, rosterUsers, typingPeers } from './helpers'
import { createRoomManager } from './room-manager'
import { workspacePresenceRoomId, type AwarenessLike, type RoomProvider } from './types'

const alice = { did: 'did:key:zAlice', name: 'Alice', color: '#3b82f6' }
const bob = { did: 'did:key:zBob', name: 'Bob', color: '#10b981' }

/** Two providers whose awareness instances are wired together like a relay. */
function linkedProviders(): { a: RoomProvider; b: RoomProvider } {
  const docs = new Map<string, Awareness[]>()

  function makeProvider(): RoomProvider {
    const local = new Map<string, Awareness>()
    return {
      async acquire(nodeId) {
        if (!local.has(nodeId)) {
          const awareness = new Awareness(new Y.Doc())
          local.set(nodeId, awareness)
          const peers = docs.get(nodeId) ?? []
          // Join snapshot: copy existing peers' states (real awareness
          // exchanges a full snapshot when a peer connects).
          for (const other of peers) {
            const state = other.getLocalState()
            if (state) awareness.states.set(other.clientID, state)
          }
          peers.push(awareness)
          docs.set(nodeId, peers)
          // Relay: any local state change is mirrored into the other
          // awareness instances for the same room (stand-in for the hub).
          awareness.on('update', () => {
            const state = awareness.getLocalState()
            for (const other of docs.get(nodeId) ?? []) {
              if (other !== awareness) {
                other.states.set(awareness.clientID, state ?? {})
                other.emit('change', [[awareness.clientID], 'remote'])
              }
            }
          })
        }
        return {}
      },
      release(nodeId) {
        local.delete(nodeId)
      },
      getAwareness(nodeId) {
        return (local.get(nodeId) as unknown as AwarenessLike) ?? null
      }
    }
  }

  return { a: makeProvider(), b: makeProvider() }
}

describe('createRoomManager', () => {
  it('joins a room and announces the user card', async () => {
    const { a, b } = linkedProviders()
    const alicesRooms = createRoomManager(a, alice)
    const bobsRooms = createRoomManager(b, bob)

    const aliceSession = await alicesRooms.join('page-1')
    const bobSession = await bobsRooms.join('page-1')

    const seenByBob = bobSession.getPeers()
    expect(seenByBob).toHaveLength(1)
    expect(seenByBob[0]?.user?.did).toBe(alice.did)
    expect(aliceSession.getPeers()[0]?.user?.did).toBe(bob.did)
  })

  it('notifies on roster changes and stops after unsubscribe', async () => {
    const { a, b } = linkedProviders()
    const aliceSession = await createRoomManager(a, alice).join('page-2')
    const bobSession = await createRoomManager(b, bob).join('page-2')

    const snapshots: number[] = []
    const unsubscribe = aliceSession.onPeersChange((peers) => snapshots.push(peers.length))
    bobSession.update({ status: 'idle' })
    expect(snapshots.length).toBeGreaterThan(0)

    const count = snapshots.length
    unsubscribe()
    bobSession.update({ status: 'active' })
    expect(snapshots.length).toBe(count)
  })

  it('merges presence fields without clobbering existing awareness state', async () => {
    const { a } = linkedProviders()
    const provider = a
    const session = await createRoomManager(provider, alice).join('canvas-1')

    // Simulate canvas presence writing its own fields on the same awareness
    const awareness = provider.getAwareness('canvas-1')
    awareness?.setLocalState({ ...(awareness.getLocalState() ?? {}), cursor: { x: 1, y: 2 } })

    session.update({ viewing: 'canvas-1' })
    const state = awareness?.getLocalState() as Record<string, unknown>
    expect(state.cursor).toEqual({ x: 1, y: 2 })
    expect(state.viewing).toBe('canvas-1')
    expect(state.user).toMatchObject({ did: alice.did })
  })

  it('refcounts sessions and clears state only when the last leaves', async () => {
    const { a } = linkedProviders()
    const manager = createRoomManager(a, alice)
    const first = await manager.join('chan-1')
    const second = await manager.join('chan-1')

    first.leave()
    expect(a.getAwareness('chan-1')?.getLocalState()).not.toBeNull()

    second.leave()
    expect(a.getAwareness('chan-1')).toBeNull()
  })

  it('joinWorkspace uses the well-known presence room id', async () => {
    const { a } = linkedProviders()
    const session = await createRoomManager(a, alice).joinWorkspace('ws-1')
    expect(session.nodeId).toBe(workspacePresenceRoomId('ws-1'))
  })
})

describe('presence helpers', () => {
  const states = new Map<number, Record<string, unknown>>([
    [1, { user: alice, lastUpdated: 100 }],
    [2, { user: bob, typing: { channelId: 'chan-1', until: 2000 }, lastUpdated: 200 }],
    [3, { user: bob, call: { roomId: 'chan-9', audio: true, video: false, screen: false } }]
  ])

  it('remotePeers excludes self and sorts newest first', () => {
    const peers = remotePeers(states, 1)
    expect(peers.map((p) => p.clientId)).toEqual([2, 3])
  })

  it('typingPeers respects expiry', () => {
    const peers = remotePeers(states, 99)
    expect(typingPeers(peers, 'chan-1', 1000)).toHaveLength(1)
    expect(typingPeers(peers, 'chan-1', 3000)).toHaveLength(0)
    expect(typingPeers(peers, 'other', 1000)).toHaveLength(0)
  })

  it('peersInCall filters by room', () => {
    const peers = remotePeers(states, 99)
    expect(peersInCall(peers, 'chan-9')).toHaveLength(1)
    expect(peersInCall(peers, 'chan-1')).toHaveLength(0)
  })

  it('rosterUsers dedupes by DID', () => {
    const peers = remotePeers(states, 99)
    expect(rosterUsers(peers).map((u) => u.did)).toEqual([bob.did, alice.did])
  })
})
