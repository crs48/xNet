import { describe, expect, it } from 'vitest'
import { createQuitBarrier } from './quit-barrier'

describe('quit barrier', () => {
  it('holds quit until saving completes and coalesces repeated requests', async () => {
    const events: string[] = []
    let release!: () => void
    const saved = new Promise<void>((resolve) => {
      release = resolve
    })
    const barrier = createQuitBarrier({
      prepare: async () => {
        events.push('saving')
        await saved
      },
      finish: () => {
        events.push('quit')
      },
      failed: () => {
        events.push('failed')
      }
    })
    const first = barrier.request()
    expect(barrier.request()).toBe(first)
    await Promise.resolve()
    expect(events).toEqual(['saving'])
    expect(barrier.approved).toBe(false)
    release()
    await first
    expect(events).toEqual(['saving', 'quit'])
    expect(barrier.approved).toBe(true)
  })

  it('leaves the app usable on failure and allows retry', async () => {
    let fail = true
    const events: string[] = []
    const barrier = createQuitBarrier({
      prepare: async () => {
        if (fail) throw new Error('disk full')
      },
      finish: () => {
        events.push('quit')
      },
      failed: () => {
        events.push('failed')
      }
    })
    await barrier.request()
    expect(events).toEqual(['failed'])
    expect(barrier.approved).toBe(false)
    fail = false
    await barrier.request()
    expect(events).toEqual(['failed', 'quit'])
  })
})
