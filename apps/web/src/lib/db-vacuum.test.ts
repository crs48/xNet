import type { SQLiteAdapter } from '@xnetjs/sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { scheduleOneTimeVacuum } from './db-vacuum'

const FLAG = 'xnet:db-vacuumed:v1'

function makeAdapter(mode: 'opfs' | 'memory' = 'opfs') {
  return {
    getStorageMode: vi.fn(async () => mode),
    getDatabaseSize: vi.fn(async () => 1000),
    vacuum: vi.fn(async () => undefined)
  } as unknown as SQLiteAdapter & {
    getStorageMode: ReturnType<typeof vi.fn>
    getDatabaseSize: ReturnType<typeof vi.fn>
    vacuum: ReturnType<typeof vi.fn>
  }
}

describe('scheduleOneTimeVacuum (0233)', () => {
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

  it('vacuums an OPFS database and latches the flag', async () => {
    const adapter = makeAdapter('opfs')
    scheduleOneTimeVacuum(adapter)
    await vi.waitFor(() => expect(adapter.vacuum).toHaveBeenCalled())
    expect(localStorage.getItem(FLAG)).toBe('1')
  })

  it('skips an in-memory database and does NOT latch (retries next boot)', async () => {
    const adapter = makeAdapter('memory')
    scheduleOneTimeVacuum(adapter)
    await vi.waitFor(() => expect(adapter.getStorageMode).toHaveBeenCalled())
    expect(adapter.vacuum).not.toHaveBeenCalled()
    expect(localStorage.getItem(FLAG)).toBeNull()
  })

  it('no-ops once the flag is set', async () => {
    localStorage.setItem(FLAG, '1')
    const adapter = makeAdapter('opfs')
    scheduleOneTimeVacuum(adapter)
    await Promise.resolve()
    expect(adapter.vacuum).not.toHaveBeenCalled()
    expect(adapter.getStorageMode).not.toHaveBeenCalled()
  })
})
