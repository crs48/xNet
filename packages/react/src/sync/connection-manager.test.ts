import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createConnectionManager } from './connection-manager'

type SocketHandler<T> = ((event: T) => void) | null

class MockWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static instances: MockWebSocket[] = []

  readonly sent: string[] = []
  readyState = MockWebSocket.CONNECTING
  onopen: SocketHandler<Event> = null
  onmessage: SocketHandler<MessageEvent> = null
  onclose: SocketHandler<CloseEvent> = null
  onerror: SocketHandler<Event> = null

  constructor(
    public readonly url: string,
    public readonly protocols?: string | string[]
  ) {
    MockWebSocket.instances.push(this)
  }

  send(message: string): void {
    this.sent.push(message)
  }

  close(code = 1000, reason = 'closed'): void {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({ code, reason } as CloseEvent)
  }

  emitOpen(): void {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.(new Event('open'))
  }

  emitMessage(payload: object): void {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent)
  }

  emitError(): void {
    this.onerror?.(new Event('error'))
  }

  emitClose(code = 1006, reason = 'abnormal'): void {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({ code, reason } as CloseEvent)
  }
}

function parseMessages(socket: MockWebSocket): Array<Record<string, unknown>> {
  return socket.sent.map((message) => JSON.parse(message) as Record<string, unknown>)
}

describe('createConnectionManager', () => {
  const originalWebSocket = globalThis.WebSocket

  beforeEach(() => {
    vi.useFakeTimers()
    MockWebSocket.instances = []
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket
  })

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket
    vi.useRealTimers()
  })

  it('re-subscribes tracked rooms after reconnect', async () => {
    const manager = createConnectionManager({
      url: 'ws://localhost:4444',
      reconnectDelay: 250
    })
    const seenStatuses: string[] = []
    manager.onStatus((status) => {
      seenStatuses.push(status)
    })

    manager.joinRoom('xnet-doc-node-1', vi.fn())
    manager.connect()
    await Promise.resolve()

    const firstSocket = MockWebSocket.instances[0]
    expect(firstSocket?.url).toBe('ws://localhost:4444')
    expect(seenStatuses).toContain('connecting')

    firstSocket.emitOpen()
    expect(seenStatuses.at(-1)).toBe('connected')
    expect(parseMessages(firstSocket)).toContainEqual({
      type: 'subscribe',
      topics: ['xnet-doc-node-1']
    })

    firstSocket.emitClose()
    expect(seenStatuses.at(-1)).toBe('disconnected')

    await vi.advanceTimersByTimeAsync(250)

    const secondSocket = MockWebSocket.instances[1]
    expect(secondSocket).toBeDefined()

    secondSocket.emitOpen()
    expect(parseMessages(secondSocket)).toContainEqual({
      type: 'subscribe',
      topics: ['xnet-doc-node-1']
    })
  })

  it('resolves joinRoomAsync when the server confirms the subscription', async () => {
    const manager = createConnectionManager({
      url: 'ws://localhost:4444'
    })

    manager.connect()
    await Promise.resolve()

    const socket = MockWebSocket.instances[0]
    socket.emitOpen()

    const subscription = manager.joinRoomAsync('xnet-doc-node-2', vi.fn())
    expect(parseMessages(socket)).toContainEqual({
      type: 'subscribe',
      topics: ['xnet-doc-node-2']
    })

    let ready = false
    const readyPromise = subscription.ready.then(() => {
      ready = true
    })

    socket.emitMessage({
      type: 'subscribed',
      topics: ['xnet-doc-node-2']
    })

    await readyPromise
    expect(ready).toBe(true)
  })
})
