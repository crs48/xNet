import { generateIdentity } from '@xnetjs/identity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { WebSocketSyncProvider } from './WebSocketSyncProvider'

type PublishMessage = {
  type: 'publish'
  topic: string
  data: Record<string, unknown>
}

function toBase64(data: Uint8Array): string {
  return Buffer.from(data).toString('base64')
}

class MockWebSocket {
  static readonly OPEN = 1
  static readonly CLOSED = 3
  static instances: MockWebSocket[] = []

  readonly url: string
  readyState = MockWebSocket.OPEN
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  sent: string[] = []

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({ code: 1000, reason: 'closed' } as CloseEvent)
  }

  open(): void {
    this.onopen?.(new Event('open'))
  }

  receive(message: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent)
  }

  clearSent(): void {
    this.sent.length = 0
  }

  publishedMessages(): PublishMessage[] {
    return this.sent
      .map((entry) => JSON.parse(entry) as PublishMessage)
      .filter((entry) => entry.type === 'publish')
  }
}

function createProvider(
  options: Partial<ConstructorParameters<typeof WebSocketSyncProvider>[1]> = {}
): {
  doc: Y.Doc
  provider: WebSocketSyncProvider
  socket: MockWebSocket
} {
  const doc = new Y.Doc()
  const provider = new WebSocketSyncProvider(doc, {
    url: 'ws://localhost:4444',
    room: 'xnet-doc-node-1',
    ...options
  })
  const socket = MockWebSocket.instances.at(-1)
  if (!socket) {
    throw new Error('Expected WebSocketSyncProvider to create a WebSocket instance')
  }

  socket.open()
  socket.clearSent()

  return { doc, provider, socket }
}

describe('WebSocketSyncProvider', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('signs outgoing sync updates by default when identity is available', () => {
    const identity = generateIdentity()
    const { doc, provider, socket } = createProvider({
      authorDID: identity.identity.did,
      signingKey: identity.privateKey
    })

    try {
      doc.getText('content').insert(0, 'signed')

      const syncUpdate = socket
        .publishedMessages()
        .find((entry) => entry.data.type === 'sync-update')

      expect(syncUpdate).toBeDefined()
      expect(syncUpdate?.data).toMatchObject({
        type: 'sync-update',
        envelope: expect.objectContaining({
          authorDID: identity.identity.did,
          signature: expect.any(String)
        })
      })
      expect(syncUpdate?.data.update).toBeUndefined()
    } finally {
      provider.destroy()
    }
  })

  it('rejects unsigned incoming sync updates by default', () => {
    const { doc, provider, socket } = createProvider()

    try {
      const sourceDoc = new Y.Doc()
      sourceDoc.getText('content').insert(0, 'legacy')
      const update = Y.encodeStateAsUpdate(sourceDoc)

      socket.receive({
        type: 'publish',
        topic: 'xnet-doc-node-1',
        data: {
          type: 'sync-update',
          from: 'peer-legacy',
          update: toBase64(update)
        }
      })

      expect(doc.getText('content').toString()).toBe('')
    } finally {
      provider.destroy()
    }
  })

  it('accepts unsigned incoming sync updates only in explicit compatibility mode', () => {
    const { doc, provider, socket } = createProvider({
      replication: {
        compatibility: {
          allowUnsignedReplication: true
        }
      }
    })

    try {
      const sourceDoc = new Y.Doc()
      sourceDoc.getText('content').insert(0, 'legacy')
      const update = Y.encodeStateAsUpdate(sourceDoc)

      socket.receive({
        type: 'publish',
        topic: 'xnet-doc-node-1',
        data: {
          type: 'sync-update',
          from: 'peer-legacy',
          update: toBase64(update)
        }
      })

      expect(doc.getText('content').toString()).toBe('legacy')
    } finally {
      provider.destroy()
    }
  })
})
