import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createConnectionManager, createMultiHubConnectionManager } from './connection-manager'

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

  it('errors and backs off when the handshake never opens (connect timeout, 0188)', async () => {
    const manager = createConnectionManager({
      url: 'ws://localhost:4444',
      connectTimeout: 1000,
      reconnectDelay: 250
    })
    const statuses: string[] = []
    manager.onStatus((status) => {
      statuses.push(status)
    })

    manager.connect()
    await Promise.resolve()

    const first = MockWebSocket.instances[0]
    expect(first).toBeDefined()
    expect(statuses.at(-1)).toBe('connecting')

    // Never emitOpen — the handshake stalls. The connect timeout must fire.
    await vi.advanceTimersByTimeAsync(1000)
    expect(statuses).toContain('error')

    // After backoff, a fresh socket is created (the manager keeps trying).
    await vi.advanceTimersByTimeAsync(250)
    const second = MockWebSocket.instances[1]
    expect(second).toBeDefined()
    expect(second).not.toBe(first)

    // A later open on the *first* (abandoned) socket must not flip us connected.
    first.emitOpen()
    expect(statuses.at(-1)).not.toBe('connected')
  })

  it('does not fire the connect timeout once the socket opens', async () => {
    const manager = createConnectionManager({
      url: 'ws://localhost:4444',
      connectTimeout: 1000
    })
    const statuses: string[] = []
    manager.onStatus((status) => {
      statuses.push(status)
    })

    manager.connect()
    await Promise.resolve()
    const socket = MockWebSocket.instances[0]
    socket.emitOpen()
    expect(statuses.at(-1)).toBe('connected')

    // Advancing past the timeout must not error a healthy connection.
    await vi.advanceTimersByTimeAsync(2000)
    expect(statuses.at(-1)).toBe('connected')
    expect(statuses).not.toContain('error')
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

describe('createMultiHubConnectionManager', () => {
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

  it('fans out subscriptions and publishes across hubs', async () => {
    const manager = createMultiHubConnectionManager({
      hubs: [{ url: 'ws://hub-a.example.net' }, { url: 'ws://hub-b.example.net' }]
    })
    const statuses: string[] = []
    const handler = vi.fn()

    manager.onStatus((status) => {
      statuses.push(status)
    })
    manager.connect()
    await Promise.resolve()

    const [hubA, hubB] = MockWebSocket.instances
    expect(hubA?.url).toBe('ws://hub-a.example.net')
    expect(hubB?.url).toBe('ws://hub-b.example.net')

    hubA.emitOpen()
    hubB.emitOpen()
    expect(statuses.at(-1)).toBe('connected')

    const subscription = manager.joinRoomAsync('xnet-doc-node-1', handler)
    expect(parseMessages(hubA)).toContainEqual({
      type: 'subscribe',
      topics: ['xnet-doc-node-1']
    })
    expect(parseMessages(hubB)).toContainEqual({
      type: 'subscribe',
      topics: ['xnet-doc-node-1']
    })

    hubA.emitMessage({
      type: 'subscribed',
      topics: ['xnet-doc-node-1']
    })
    hubB.emitMessage({
      type: 'subscribed',
      topics: ['xnet-doc-node-1']
    })
    await subscription.ready

    hubA.emitMessage({
      type: 'publish',
      topic: 'xnet-doc-node-1',
      data: { type: 'sync-step1', from: 'peer-a' }
    })

    expect(handler).toHaveBeenCalledWith({ type: 'sync-step1', from: 'peer-a' })

    manager.publish('xnet-doc-node-1', { type: 'sync-update', from: 'local' })
    expect(parseMessages(hubA)).toContainEqual({
      type: 'publish',
      topic: 'xnet-doc-node-1',
      data: { type: 'sync-update', from: 'local' }
    })
    expect(parseMessages(hubB)).toContainEqual({
      type: 'publish',
      topic: 'xnet-doc-node-1',
      data: { type: 'sync-update', from: 'local' }
    })

    expect(manager.roomCount).toBe(1)
    subscription.unsubscribe()
    expect(manager.roomCount).toBe(0)
  })

  it('stays logically connected while any hub remains connected', async () => {
    const manager = createMultiHubConnectionManager({
      hubs: [{ url: 'ws://hub-a.example.net' }, { url: 'ws://hub-b.example.net' }]
    })
    const statuses: string[] = []

    manager.onStatus((status) => {
      statuses.push(status)
    })
    manager.connect()
    await Promise.resolve()

    const [hubA, hubB] = MockWebSocket.instances
    hubA.emitOpen()
    hubB.emitOpen()
    expect(manager.status).toBe('connected')

    hubA.emitClose()
    expect(manager.status).toBe('connected')
    expect(statuses.at(-1)).toBe('connected')

    hubB.emitClose()
    expect(manager.status).toBe('disconnected')
    expect(statuses.at(-1)).toBe('disconnected')
  })
})
