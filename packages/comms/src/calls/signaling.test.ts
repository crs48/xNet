import type { CallSignal } from './types'
import { describe, expect, it, vi } from 'vitest'
import { callTopic, createWebSocketSignaling, parseBrokerMessage } from './signaling'

const SIGNAL: CallSignal = { kind: 'leave', from: 'aaa' }

interface FakeSocket {
  readyState: number
  sent: string[]
  send(data: string): void
  close(): void
  addEventListener(event: string, handler: (event: { data?: unknown }) => void): void
  fire(event: string, payload?: { data?: unknown }): void
}

function fakeSocket(): FakeSocket {
  const handlers = new Map<string, Array<(event: { data?: unknown }) => void>>()
  return {
    readyState: 0,
    sent: [],
    send(data) {
      this.sent.push(data)
    },
    close: vi.fn(),
    addEventListener(event, handler) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler])
    },
    fire(event, payload = {}) {
      for (const handler of handlers.get(event) ?? []) handler(payload)
    }
  }
}

describe('parseBrokerMessage', () => {
  const topic = callTopic('room-1')

  it('accepts publishes for the topic and rejects everything else', () => {
    const frame = JSON.stringify({ type: 'publish', topic, data: SIGNAL })
    expect(parseBrokerMessage(frame, topic)).toEqual(SIGNAL)
    expect(parseBrokerMessage(frame, callTopic('other'))).toBeNull()
    expect(parseBrokerMessage(JSON.stringify({ type: 'pong' }), topic)).toBeNull()
    expect(parseBrokerMessage('not-json', topic)).toBeNull()
    expect(parseBrokerMessage(42, topic)).toBeNull()
    expect(parseBrokerMessage(JSON.stringify({ type: 'publish', topic }), topic)).toBeNull()
  })
})

describe('createWebSocketSignaling', () => {
  it('subscribes on open, queues sends until open, publishes and receives', () => {
    const socket = fakeSocket()
    const transport = createWebSocketSignaling({
      url: 'wss://hub.test',
      roomId: 'room-1',
      webSocketFactory: () => socket
    })

    // Send before open: queued.
    transport.send(SIGNAL)
    expect(socket.sent).toHaveLength(0)

    socket.readyState = 1
    socket.fire('open')
    expect(JSON.parse(socket.sent[0] as string)).toEqual({
      type: 'subscribe',
      topics: [callTopic('room-1')]
    })
    expect(JSON.parse(socket.sent[1] as string).data).toEqual(SIGNAL)

    // Receive a broker publish.
    const received: CallSignal[] = []
    const unsubscribe = transport.onMessage((signal) => received.push(signal))
    socket.fire('message', {
      data: JSON.stringify({ type: 'publish', topic: callTopic('room-1'), data: SIGNAL })
    })
    expect(received).toEqual([SIGNAL])

    unsubscribe()
    socket.fire('message', {
      data: JSON.stringify({ type: 'publish', topic: callTopic('room-1'), data: SIGNAL })
    })
    expect(received).toHaveLength(1)

    transport.close()
    expect(JSON.parse(socket.sent.at(-1) as string).type).toBe('unsubscribe')
    expect(socket.close).toHaveBeenCalled()
  })
})
