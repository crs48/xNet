import { describe, expect, it } from 'vitest'
import { createDocumentWriteBarrier } from './document-writes'

describe('document write barrier', () => {
  it('waits for debounced editors and pending storage acknowledgements', async () => {
    const barrier = createDocumentWriteBarrier()
    const events: string[] = []
    let release!: () => void
    const disk = new Promise<void>((resolve) => {
      release = resolve
    })
    barrier.register(() =>
      barrier.write('note', async () => {
        await disk
        events.push('saved')
      })
    )
    const flush = barrier.flush().then(() => events.push('flushed'))
    await Promise.resolve()
    expect(events).toEqual([])
    release()
    await flush
    expect(events).toEqual(['saved', 'flushed'])
  })

  it('prevents an earlier slow save from overwriting a newer edit', async () => {
    const barrier = createDocumentWriteBarrier()
    const written: string[] = []
    let release!: () => void
    const disk = new Promise<void>((resolve) => {
      release = resolve
    })
    const old = barrier.write('note', async () => {
      await disk
      written.push('old')
    })
    const fresh = barrier.write('note', async () => {
      written.push('new')
    })
    await Promise.resolve()
    expect(written).toEqual([])
    release()
    await Promise.all([old, fresh])
    expect(written).toEqual(['old', 'new'])
  })

  it('keeps an unmounted failed write retryable and never reports a failed flush as saved', async () => {
    const barrier = createDocumentWriteBarrier()
    let full = true
    let persisted = false
    await expect(
      barrier.write('unmounted', async () => {
        if (full) throw new Error('disk full')
        persisted = true
      })
    ).rejects.toThrow('disk full')
    await expect(barrier.flush()).rejects.toThrow('Document writes failed')
    full = false
    await barrier.flush()
    expect(persisted).toBe(true)
  })

  it('retries retained bytes before a reopened document reads storage', async () => {
    const barrier = createDocumentWriteBarrier()
    let blocked = true
    let stored = 'old'
    await expect(
      barrier.write('note', async () => {
        if (blocked) throw new Error('disk full')
        stored = 'latest'
      })
    ).rejects.toThrow()
    await expect(barrier.flushKey('note')).rejects.toThrow('disk full')
    blocked = false
    await barrier.flushKey('note')
    expect(stored).toBe('latest')
  })

  it('does not replay a failed old snapshot over a successful newer save', async () => {
    const barrier = createDocumentWriteBarrier()
    const written: string[] = []
    await expect(
      barrier.write('note', async () => {
        throw new Error('offline disk')
      })
    ).rejects.toThrow()
    await barrier.write('note', async () => {
      written.push('latest')
    })
    await barrier.flush()
    expect(written).toEqual(['latest'])
  })

  it('rejects encoding failures and unregisters closed editors', async () => {
    const barrier = createDocumentWriteBarrier()
    const unregister = barrier.register(async () => {
      throw new Error('cannot encode')
    })
    await expect(barrier.flush()).rejects.toThrow('Could not flush every open document')
    unregister()
    await expect(barrier.flush()).resolves.toBeUndefined()
  })
})
