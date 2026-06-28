import { describe, expect, it } from 'vitest'
import { MemoryNonceStore, NONCE_TTL_MS, nonceStoreFromDocs, type NonceRecord } from './nonce'
import { InMemoryDocStore } from './stores/durable'

describe('MemoryNonceStore', () => {
  it('issues a unique nonce bound to the device flow', async () => {
    const store = new MemoryNonceStore()
    const a = await store.issue('device-1', 0)
    const b = await store.issue('device-1', 0)
    expect(a.nonce).not.toBe(b.nonce)
    expect(a.deviceCode).toBe('device-1')
  })

  it('consumes a nonce exactly once (single-use)', async () => {
    const store = new MemoryNonceStore()
    const { nonce } = await store.issue('device-1', 0)
    const first = await store.consume(nonce, 0)
    expect(first?.deviceCode).toBe('device-1')
    expect(await store.consume(nonce, 0)).toBeNull() // already consumed
  })

  it('rejects an expired nonce and still burns it', async () => {
    const store = new MemoryNonceStore()
    const { nonce } = await store.issue('device-1', 0)
    expect(await store.consume(nonce, NONCE_TTL_MS + 1)).toBeNull()
    // Even expired, it was deleted — a later in-window retry can't resurrect it.
    expect(await store.consume(nonce, 0)).toBeNull()
  })

  it('returns null for an unknown nonce', async () => {
    const store = new MemoryNonceStore()
    expect(await store.consume('never-issued', 0)).toBeNull()
  })
})

describe('nonceStoreFromDocs (durable)', () => {
  it('round-trips issue/consume through a DocStore and stays single-use', async () => {
    const store = nonceStoreFromDocs(new InMemoryDocStore<NonceRecord>())
    const { nonce } = await store.issue('device-9', 100)
    expect((await store.consume(nonce, 100))?.deviceCode).toBe('device-9')
    expect(await store.consume(nonce, 100)).toBeNull()
  })
})
