import type { TelemetryRecord } from '../src/collection/collector'
import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryTelemetryBuffer } from '../src/collection/persistence'

const rec = (id: string, overrides: Partial<TelemetryRecord> = {}): TelemetryRecord => ({
  id,
  schemaId: 'xnet://xnet.fyi/telemetry/UsageMetric',
  data: { metricName: 'test', metricBucket: '1-5' },
  createdAt: Date.now(),
  status: 'local',
  ...overrides
})

describe('MemoryTelemetryBuffer', () => {
  let buffer: MemoryTelemetryBuffer

  beforeEach(() => {
    buffer = new MemoryTelemetryBuffer()
  })

  it('appends and reads back records', async () => {
    await buffer.append(rec('a'))
    await buffer.append(rec('b'))
    const all = await buffer.all()
    expect(all.map((r) => r.id).sort()).toEqual(['a', 'b'])
  })

  it('returns copies, not live references', async () => {
    await buffer.append(rec('a'))
    const all = await buffer.all()
    all[0].status = 'dismissed'
    const again = await buffer.all()
    expect(again[0].status).toBe('local')
  })

  it('overwrites on append with the same id', async () => {
    await buffer.append(rec('a', { status: 'local' }))
    await buffer.append(rec('a', { status: 'pending' }))
    const all = await buffer.all()
    expect(all).toHaveLength(1)
    expect(all[0].status).toBe('pending')
  })

  it('updates status for the given ids only', async () => {
    await buffer.append(rec('a'))
    await buffer.append(rec('b'))
    await buffer.setStatus(['a'], 'shared')
    const all = await buffer.all()
    expect(all.find((r) => r.id === 'a')?.status).toBe('shared')
    expect(all.find((r) => r.id === 'b')?.status).toBe('local')
  })

  it('removes specific records', async () => {
    await buffer.append(rec('a'))
    await buffer.append(rec('b'))
    await buffer.remove(['a'])
    const all = await buffer.all()
    expect(all.map((r) => r.id)).toEqual(['b'])
  })

  it('clears all records', async () => {
    await buffer.append(rec('a'))
    await buffer.clear()
    expect(await buffer.all()).toHaveLength(0)
  })

  it('prunes only terminal records older than the cutoff', async () => {
    const old = Date.now() - 10 * 24 * 60 * 60 * 1000
    await buffer.append(rec('old-shared', { status: 'shared', createdAt: old }))
    await buffer.append(rec('old-dismissed', { status: 'dismissed', createdAt: old }))
    await buffer.append(rec('old-pending', { status: 'pending', createdAt: old }))
    await buffer.append(rec('fresh-shared', { status: 'shared', createdAt: Date.now() }))

    await buffer.prune(7 * 24 * 60 * 60 * 1000)

    const ids = (await buffer.all()).map((r) => r.id).sort()
    // old-shared and old-dismissed pruned; pending (non-terminal) and fresh kept.
    expect(ids).toEqual(['fresh-shared', 'old-pending'])
  })
})
