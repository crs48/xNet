import type { MediaFlags, PeerConnectionLike } from './types'
import { describe, expect, it, vi } from 'vitest'
import { createCallManager, type CallManager } from './call-manager'
import { createLoopbackBus } from './signaling'

const AUDIO: MediaFlags = { audio: true, video: false, screen: false }
const VIDEO: MediaFlags = { audio: true, video: true, screen: false }

/** Fake RTCPeerConnection: deterministic SDP, immediate resolution. */
function fakePeerConnection(label: string): PeerConnectionLike {
  return {
    createOffer: vi.fn(async () => ({ type: 'offer', sdp: `offer-from-${label}` })),
    createAnswer: vi.fn(async () => ({ type: 'answer', sdp: `answer-from-${label}` })),
    setLocalDescription: vi.fn(async () => {}),
    setRemoteDescription: vi.fn(async () => {}),
    addIceCandidate: vi.fn(async () => {}),
    addTrack: vi.fn(),
    close: vi.fn(),
    onicecandidate: null,
    ontrack: null,
    onconnectionstatechange: null,
    connectionState: 'connected'
  }
}

function participant(
  bus: ReturnType<typeof createLoopbackBus>,
  sessionId: string,
  maxParticipants?: number
): { manager: CallManager; connections: PeerConnectionLike[] } {
  const connections: PeerConnectionLike[] = []
  const manager = createCallManager({
    self: { did: `did:key:z${sessionId}`, sessionId },
    transport: bus.transport(),
    createPeerConnection: () => {
      const connection = fakePeerConnection(sessionId)
      connections.push(connection)
      return connection
    },
    maxParticipants
  })
  return { manager, connections }
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('createCallManager mesh', () => {
  it('two participants discover each other and exchange offer/answer once', async () => {
    const bus = createLoopbackBus()
    const a = participant(bus, 'aaa')
    const b = participant(bus, 'bbb')

    a.manager.join(AUDIO)
    b.manager.join(AUDIO)
    await settle()

    expect(a.manager.getPeers().map((p) => p.sessionId)).toEqual(['bbb'])
    expect(b.manager.getPeers().map((p) => p.sessionId)).toEqual(['aaa'])

    // Deterministic initiator: 'aaa' < 'bbb' so only A offers.
    expect(a.connections).toHaveLength(1)
    expect(a.connections[0]?.createOffer).toHaveBeenCalledTimes(1)
    expect(b.connections[0]?.createAnswer).toHaveBeenCalledTimes(1)
    expect(b.connections[0]?.createOffer).not.toHaveBeenCalled()
  })

  it('three participants form a full mesh (every pair connected)', async () => {
    const bus = createLoopbackBus()
    const a = participant(bus, 'aaa')
    const b = participant(bus, 'bbb')
    const c = participant(bus, 'ccc')

    a.manager.join(AUDIO)
    await settle()
    b.manager.join(AUDIO)
    await settle()
    c.manager.join(AUDIO)
    await settle()

    expect(a.manager.getPeers()).toHaveLength(2)
    expect(b.manager.getPeers()).toHaveLength(2)
    expect(c.manager.getPeers()).toHaveLength(2)
  })

  it('leave tears down connections on both sides', async () => {
    const bus = createLoopbackBus()
    const a = participant(bus, 'aaa')
    const b = participant(bus, 'bbb')
    a.manager.join(AUDIO)
    b.manager.join(AUDIO)
    await settle()

    b.manager.leave()
    await settle()

    expect(b.manager.getStatus()).toBe('left')
    expect(a.manager.getPeers()).toHaveLength(0)
    expect(b.connections[0]?.close).toHaveBeenCalled()
  })

  it('enforces the mesh ceiling reactively', async () => {
    const bus = createLoopbackBus()
    const a = participant(bus, 'aaa', 2) // capacity 2: self + 1 peer
    const b = participant(bus, 'bbb', 2)
    const c = participant(bus, 'ccc', 2)

    a.manager.join(AUDIO)
    b.manager.join(AUDIO)
    await settle()
    c.manager.join(AUDIO)
    await settle()

    expect(a.manager.getPeers()).toHaveLength(1)
    expect(a.manager.getStatus()).toBe('full')
  })

  it('video capacity defaults to the 0167 mesh ceiling of 4', async () => {
    const bus = createLoopbackBus()
    const members = ['aa', 'bb', 'cc', 'dd', 'ee'].map((id) => participant(bus, id))
    for (const member of members) {
      member.manager.join(VIDEO)
      await settle()
    }
    // First four form the mesh; the fifth pushes rooms to 'full'.
    expect(members[0]?.manager.getPeers().length).toBe(3)
    expect(members[0]?.manager.getStatus()).toBe('full')
  })

  it('notifies subscribers on membership changes', async () => {
    const bus = createLoopbackBus()
    const a = participant(bus, 'aaa')
    const changes = vi.fn()
    a.manager.onChange(changes)
    a.manager.join(AUDIO)

    const b = participant(bus, 'bbb')
    b.manager.join(AUDIO)
    await settle()

    expect(changes).toHaveBeenCalled()
    expect(a.manager.getPeers()[0]?.did).toBe('did:key:zbbb')
  })
})
