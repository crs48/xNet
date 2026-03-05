/**
 * Tests for WebhookEmitter
 */

import type { NodeStoreAPI } from '../services/local-api'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  WebhookEmitter,
  createWebhookEmitter,
  type WebhookConfig
} from '../services/webhook-emitter'

// ─── Mock Store ──────────────────────────────────────────────────────────────

type MockNode = {
  id: string
  schemaId: string
  properties: Record<string, unknown>
  deleted: boolean
  createdAt: number
  updatedAt: number
}

type MockListener = (event: {
  change: { type: string }
  node: MockNode | null
  isRemote: boolean
}) => void

function createMockStore(): NodeStoreAPI & {
  emit: (event: { change: { type: string }; node: MockNode | null; isRemote: boolean }) => void
} {
  const listeners = new Set<MockListener>()

  return {
    get: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    subscribe: (listener) => {
      listeners.add(listener as MockListener)
      return () => listeners.delete(listener as MockListener)
    },
    emit: (event) => {
      for (const listener of listeners) {
        listener(event)
      }
    }
  }
}

// ─── Mock Fetch ──────────────────────────────────────────────────────────────

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WebhookEmitter', () => {
  let emitter: WebhookEmitter
  let mockStore: ReturnType<typeof createMockStore>

  beforeEach(() => {
    vi.useFakeTimers()
    mockStore = createMockStore()
    emitter = new WebhookEmitter(mockStore)
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({ ok: true, status: 200 })
  })

  afterEach(() => {
    emitter.stop()
    vi.useRealTimers()
  })

  describe('registration', () => {
    it('registers a webhook', () => {
      const config: WebhookConfig = {
        id: 'test-webhook',
        url: 'https://example.com/webhook',
        events: ['created', 'updated']
      }

      const disposable = emitter.register(config)

      expect(emitter.getWebhooks()).toHaveLength(1)
      expect(emitter.getWebhook('test-webhook')).toEqual({
        ...config,
        enabled: true
      })

      disposable.dispose()
      expect(emitter.getWebhooks()).toHaveLength(0)
    })

    it('unregisters a webhook by ID', () => {
      emitter.register({
        id: 'test-webhook',
        url: 'https://example.com/webhook',
        events: ['created']
      })

      expect(emitter.unregister('test-webhook')).toBe(true)
      expect(emitter.unregister('non-existent')).toBe(false)
      expect(emitter.getWebhooks()).toHaveLength(0)
    })

    it('updates a webhook', () => {
      emitter.register({
        id: 'test-webhook',
        url: 'https://example.com/webhook',
        events: ['created']
      })

      const updated = emitter.updateWebhook('test-webhook', {
        url: 'https://new-url.com/webhook'
      })

      expect(updated).toBe(true)
      expect(emitter.getWebhook('test-webhook')?.url).toBe('https://new-url.com/webhook')
    })

    it('returns false when updating non-existent webhook', () => {
      expect(emitter.updateWebhook('non-existent', { url: 'test' })).toBe(false)
    })
  })

  describe('event handling', () => {
    it('sends webhook on node change', async () => {
      emitter.start()

      emitter.register({
        id: 'test-webhook',
        url: 'https://example.com/webhook',
        events: ['updated']
      })

      const node: MockNode = {
        id: 'node-1',
        schemaId: 'xnet://xnet.dev/Task',
        properties: { title: 'Test' },
        deleted: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }

      mockStore.emit({ change: { type: 'node-change' }, node, isRemote: false })

      // Wait for async webhook delivery
      await vi.advanceTimersByTimeAsync(50)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'content-type': 'application/json'
          })
        })
      )
    })

    it('filters by event type', async () => {
      emitter.start()

      emitter.register({
        id: 'test-webhook',
        url: 'https://example.com/webhook',
        events: ['created'] // Only 'created', not 'updated'
      })

      const node: MockNode = {
        id: 'node-1',
        schemaId: 'xnet://xnet.dev/Task',
        properties: {},
        deleted: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }

      // This emits 'updated' by default
      mockStore.emit({ change: { type: 'node-change' }, node, isRemote: false })

      await vi.advanceTimersByTimeAsync(50)

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('filters by schema', async () => {
      emitter.start()

      emitter.register({
        id: 'test-webhook',
        url: 'https://example.com/webhook',
        events: ['updated'],
        schema: 'xnet://xnet.dev/Project' // Only projects
      })

      const taskNode: MockNode = {
        id: 'task-1',
        schemaId: 'xnet://xnet.dev/Task',
        properties: {},
        deleted: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }

      mockStore.emit({ change: { type: 'node-change' }, node: taskNode, isRemote: false })

      await vi.advanceTimersByTimeAsync(50)

      expect(mockFetch).not.toHaveBeenCalled()

      const projectNode: MockNode = {
        id: 'project-1',
        schemaId: 'xnet://xnet.dev/Project',
        properties: {},
        deleted: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }

      mockStore.emit({ change: { type: 'node-change' }, node: projectNode, isRemote: false })

      await vi.advanceTimersByTimeAsync(50)

      expect(mockFetch).toHaveBeenCalled()
    })

    it('skips disabled webhooks', async () => {
      emitter.start()

      emitter.register({
        id: 'test-webhook',
        url: 'https://example.com/webhook',
        events: ['updated'],
        enabled: false
      })

      mockStore.emit({
        change: { type: 'node-change' },
        node: {
          id: 'node-1',
          schemaId: 'xnet://xnet.dev/Task',
          properties: {},
          deleted: false,
          createdAt: Date.now(),
          updatedAt: Date.now()
        },
        isRemote: false
      })

      await vi.advanceTimersByTimeAsync(50)

      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('HMAC signing', () => {
    it('adds signature header when secret is configured', async () => {
      emitter.start()

      const mockImportKey = vi
        .spyOn(globalThis.crypto.subtle, 'importKey')
        .mockResolvedValue({} as CryptoKey)
      const mockSign = vi
        .spyOn(globalThis.crypto.subtle, 'sign')
        .mockResolvedValue(new Uint8Array([1, 2, 3, 4]).buffer)

      try {
        emitter.register({
          id: 'test-webhook',
          url: 'https://example.com/webhook',
          events: ['updated'],
          secret: 'my-secret-key'
        })

        mockStore.emit({
          change: { type: 'node-change' },
          node: {
            id: 'node-1',
            schemaId: 'xnet://xnet.dev/Task',
            properties: {},
            deleted: false,
            createdAt: Date.now(),
            updatedAt: Date.now()
          },
          isRemote: false
        })

        await vi.advanceTimersByTimeAsync(50)

        expect(mockFetch).toHaveBeenCalledWith(
          'https://example.com/webhook',
          expect.objectContaining({
            headers: expect.objectContaining({
              'x-xnet-signature': '01020304',
              'x-xnet-signature-256': 'sha256=01020304'
            })
          })
        )
      } finally {
        mockSign.mockRestore()
        mockImportKey.mockRestore()
      }
    })
  })

  describe('retries', () => {
    it('retries on failure', async () => {
      emitter.start()

      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ ok: true, status: 200 })

      emitter.register({
        id: 'test-webhook',
        url: 'https://example.com/webhook',
        events: ['updated'],
        retries: 3
      })

      mockStore.emit({
        change: { type: 'node-change' },
        node: {
          id: 'node-1',
          schemaId: 'xnet://xnet.dev/Task',
          properties: {},
          deleted: false,
          createdAt: Date.now(),
          updatedAt: Date.now()
        },
        isRemote: false
      })

      // Flush initial delivery attempt (fail #1)
      await vi.advanceTimersByTimeAsync(50)
      // Advance past 1s backoff (2^0) → fail #2
      await vi.advanceTimersByTimeAsync(1000)
      // Advance past 2s backoff (2^1) → success #3
      await vi.advanceTimersByTimeAsync(2000)

      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('records delivery history', async () => {
      emitter.start()

      emitter.register({
        id: 'test-webhook',
        url: 'https://example.com/webhook',
        events: ['updated']
      })

      mockStore.emit({
        change: { type: 'node-change' },
        node: {
          id: 'node-1',
          schemaId: 'xnet://xnet.dev/Task',
          properties: {},
          deleted: false,
          createdAt: Date.now(),
          updatedAt: Date.now()
        },
        isRemote: false
      })

      await vi.advanceTimersByTimeAsync(50)

      const history = emitter.getDeliveryHistory()
      expect(history).toHaveLength(1)
      expect(history[0].webhookId).toBe('test-webhook')
      expect(history[0].success).toBe(true)
      expect(history[0].statusCode).toBe(200)
    })

    it('clears delivery history', async () => {
      emitter.start()

      emitter.register({
        id: 'test-webhook',
        url: 'https://example.com/webhook',
        events: ['updated']
      })

      mockStore.emit({
        change: { type: 'node-change' },
        node: {
          id: 'node-1',
          schemaId: 'xnet://xnet.dev/Task',
          properties: {},
          deleted: false,
          createdAt: Date.now(),
          updatedAt: Date.now()
        },
        isRemote: false
      })

      await vi.advanceTimersByTimeAsync(50)

      expect(emitter.getDeliveryHistory()).toHaveLength(1)
      emitter.clearDeliveryHistory()
      expect(emitter.getDeliveryHistory()).toHaveLength(0)
    })
  })

  describe('start/stop', () => {
    it('does not send webhooks when stopped', async () => {
      // Don't call emitter.start()

      emitter.register({
        id: 'test-webhook',
        url: 'https://example.com/webhook',
        events: ['updated']
      })

      mockStore.emit({
        change: { type: 'node-change' },
        node: {
          id: 'node-1',
          schemaId: 'xnet://xnet.dev/Task',
          properties: {},
          deleted: false,
          createdAt: Date.now(),
          updatedAt: Date.now()
        },
        isRemote: false
      })

      await vi.advanceTimersByTimeAsync(50)

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('stops listening after stop()', async () => {
      emitter.start()
      emitter.stop()

      emitter.register({
        id: 'test-webhook',
        url: 'https://example.com/webhook',
        events: ['updated']
      })

      mockStore.emit({
        change: { type: 'node-change' },
        node: {
          id: 'node-1',
          schemaId: 'xnet://xnet.dev/Task',
          properties: {},
          deleted: false,
          createdAt: Date.now(),
          updatedAt: Date.now()
        },
        isRemote: false
      })

      await vi.advanceTimersByTimeAsync(50)

      expect(mockFetch).not.toHaveBeenCalled()
    })
  })
})

describe('createWebhookEmitter', () => {
  it('creates an emitter instance', () => {
    const store = createMockStore()
    const emitter = createWebhookEmitter(store)

    expect(emitter).toBeInstanceOf(WebhookEmitter)
  })
})
