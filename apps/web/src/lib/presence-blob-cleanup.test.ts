import type { SQLiteAdapter } from '@xnetjs/sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { scheduleStalePresenceCleanup } from './presence-blob-cleanup'

const FLAG = 'xnet:presence-blob-vacuumed:v1'

function makeAdapter(deletedRows: number) {
  return {
    getDatabaseSize: vi.fn(async () => 1000),
    run: vi.fn(async () => ({ changes: deletedRows })),
    vacuum: vi.fn(async () => undefined)
  } as unknown as SQLiteAdapter & {
    getDatabaseSize: ReturnType<typeof vi.fn>
    run: ReturnType<typeof vi.fn>
    vacuum: ReturnType<typeof vi.fn>
  }
}

describe('scheduleStalePresenceCleanup (0229)', () => {
  beforeEach(() => {
    localStorage.clear()
    // Run the idle callback synchronously so the test can await the work.
    ;(
      window as unknown as { requestIdleCallback: (cb: () => void) => number }
    ).requestIdleCallback = (cb: () => void) => {
      cb()
      return 1
    }
  })

  it('deletes presence rows, vacuums, and latches', async () => {
    const adapter = makeAdapter(3)
    scheduleStalePresenceCleanup(adapter)
    await vi.waitFor(() => expect(adapter.vacuum).toHaveBeenCalled())
    expect(adapter.run).toHaveBeenCalledWith(expect.stringContaining('presence-%'))
    expect(localStorage.getItem(FLAG)).toBe('1')
  })

  it('skips VACUUM when there is no stale blob to remove', async () => {
    const adapter = makeAdapter(0)
    scheduleStalePresenceCleanup(adapter)
    await vi.waitFor(() => expect(adapter.run).toHaveBeenCalled())
    expect(adapter.vacuum).not.toHaveBeenCalled()
    expect(localStorage.getItem(FLAG)).toBe('1')
  })

  it('no-ops once the flag is set', async () => {
    localStorage.setItem(FLAG, '1')
    const adapter = makeAdapter(3)
    scheduleStalePresenceCleanup(adapter)
    await Promise.resolve()
    expect(adapter.run).not.toHaveBeenCalled()
  })
})
