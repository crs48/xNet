import { describe, expect, it, vi } from 'vitest'
import { createAwarenessCallTransport, type CallAwareness } from './call-transport'
function fixture() {
  const states = new Map<number, Record<string, unknown>>()
  const listeners = new Set<() => void>()
  const change = () => {
    for (const listener of listeners) listener()
  }
  const awareness: CallAwareness = {
    clientID: 1,
    getStates: () => states,
    setLocalStateField: (key, value) => {
      states.set(1, { [key]: value })
      change()
    },
    on: (_, listener) => {
      listeners.add(listener)
    },
    off: (_, listener) => {
      listeners.delete(listener)
    }
  }
  return { awareness, states, change, listeners }
}
const media = { audio: true, video: false, screen: false }
describe('ephemeral channel call signaling', () => {
  it('rejects unknown members, malformed signals, and claimed session mismatches', async () => {
    const f = fixture()
    const transport = createAwarenessCallTransport(
      f.awareness,
      'local',
      'me',
      new Set(['me', 'friend'])
    )
    const receive = vi.fn()
    transport.onMessage(receive)
    f.states.set(2, {
      communityCall: {
        session: 'remote',
        did: 'stranger',
        history: [
          { sequence: 1, signal: { kind: 'announce', from: 'remote', did: 'stranger', media } }
        ]
      }
    })
    f.change()
    expect(receive).not.toHaveBeenCalled()
    f.states.set(2, {
      communityCall: {
        session: 'remote',
        did: 'friend',
        history: [
          { sequence: 1, signal: { kind: 'offer', from: 'impostor', to: 'local', sdp: 'sdp' } },
          { sequence: 2, signal: { kind: 'offer', from: 'remote', to: 'local', sdp: 42 } }
        ]
      }
    })
    f.change()
    expect(receive).not.toHaveBeenCalled()
    transport.close()
  })
  it('delivers buffered negotiation once and observes a peer closing its room', () => {
    const f = fixture()
    const transport = createAwarenessCallTransport(f.awareness, 'local', 'me', new Set(['friend']))
    const receive = vi.fn()
    transport.onMessage(receive)
    const signal = { kind: 'announce', from: 'remote', did: 'friend', media }
    f.states.set(2, {
      communityCall: { session: 'remote', did: 'friend', history: [{ sequence: 1, signal }] }
    })
    f.change()
    f.change()
    expect(receive).toHaveBeenCalledTimes(1)
    expect(receive).toHaveBeenCalledWith(signal)
    f.states.delete(2)
    f.change()
    expect(receive).toHaveBeenLastCalledWith({ kind: 'leave', from: 'remote' })
    transport.close()
    expect(f.listeners.size).toBe(0)
  })
  it('batches synchronous ICE candidates without losing them and cancels pending writes on close', async () => {
    const f = fixture()
    const transport = createAwarenessCallTransport(f.awareness, 'local', 'me', new Set())
    transport.send({ kind: 'ice', from: 'local', to: 'remote', candidate: { candidate: 'one' } })
    transport.send({ kind: 'ice', from: 'local', to: 'remote', candidate: { candidate: 'two' } })
    await Promise.resolve()
    expect((f.states.get(1)?.communityCall as { history: unknown[] }).history).toHaveLength(2)
    transport.send({ kind: 'leave', from: 'local' })
    transport.close()
    await Promise.resolve()
    expect(f.states.get(1)?.communityCall).toBeNull()
  })
})
