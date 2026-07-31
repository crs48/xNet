/**
 * The dev log bridge's ring buffer (exploration 0413).
 *
 * The property that matters is the boring one: records emitted **before** a
 * window exists must survive until there is somewhere to send them. Those are
 * boot failures — the class an agent driving over CDP most needs to see and,
 * pre-0413, the class it could never see at all.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { devLogRecords, recordDevLog, resetDevLogBridge } from './dev-log-bridge'

describe('dev log ring buffer', () => {
  beforeEach(() => {
    resetDevLogBridge()
  })

  it('retains records written with no window attached', () => {
    recordDevLog('main', 'error', 'better_sqlite3.node failed to load')
    const records = devLogRecords()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      source: 'main',
      level: 'error',
      message: 'better_sqlite3.node failed to load'
    })
  })

  it('tags main and data records distinctly', () => {
    recordDevLog('main', 'log', 'from main')
    recordDevLog('data', 'error', 'from data')
    expect(devLogRecords().map((r) => r.source)).toEqual(['main', 'data'])
  })

  it('keeps insertion order', () => {
    for (const n of [1, 2, 3]) recordDevLog('main', 'log', `m${n}`)
    expect(devLogRecords().map((r) => r.message)).toEqual(['m1', 'm2', 'm3'])
  })

  it('bounds the buffer and drops the oldest, not the newest', () => {
    for (let i = 0; i < 600; i += 1) recordDevLog('main', 'log', `m${i}`)
    const records = devLogRecords()
    expect(records).toHaveLength(500)
    // The newest record must survive: a crash is the last thing logged.
    expect(records[records.length - 1].message).toBe('m599')
    expect(records[0].message).toBe('m100')
  })

  it('stamps every record with a timestamp', () => {
    recordDevLog('main', 'warn', 'something')
    expect(() => new Date(devLogRecords()[0].at).toISOString()).not.toThrow()
  })

  it('returns a copy, so a caller cannot mutate the buffer', () => {
    recordDevLog('main', 'log', 'one')
    devLogRecords().push({ at: '', source: 'main', level: 'log', message: 'injected' })
    expect(devLogRecords()).toHaveLength(1)
  })
})
