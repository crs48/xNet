import { describe, expect, it } from 'vitest'
import {
  GranularityError,
  MIN_SYNC_INTERVAL_MS,
  assertDurableCadence,
  assertDurableSchemas,
  cadenceIntervalMs,
  isHighFrequencyCadence
} from './granularity'

describe('cadenceIntervalMs', () => {
  it('maps named cadences to their interval, manual to null', () => {
    expect(cadenceIntervalMs('manual')).toBeNull()
    expect(cadenceIntervalMs('hourly')).toBe(60 * 60 * 1_000)
    expect(cadenceIntervalMs('daily')).toBe(24 * 60 * 60 * 1_000)
    expect(cadenceIntervalMs({ everyMs: 5_000 })).toBe(5_000)
  })
})

describe('isHighFrequencyCadence', () => {
  it('rejects per-frame / per-tick intervals below the floor', () => {
    expect(isHighFrequencyCadence({ everyMs: 16 })).toBe(true) // ~60fps
    expect(isHighFrequencyCadence({ everyMs: 100 })).toBe(true) // 10Hz tick
    expect(isHighFrequencyCadence({ everyMs: MIN_SYNC_INTERVAL_MS - 1 })).toBe(true)
  })

  it('accepts durable intervals and the non-looping manual cadence', () => {
    expect(isHighFrequencyCadence({ everyMs: MIN_SYNC_INTERVAL_MS })).toBe(false)
    expect(isHighFrequencyCadence({ everyMs: 60_000 })).toBe(false)
    expect(isHighFrequencyCadence('manual')).toBe(false)
    expect(isHighFrequencyCadence('hourly')).toBe(false)
    expect(isHighFrequencyCadence('daily')).toBe(false)
  })
})

describe('assertDurableCadence', () => {
  it('throws GranularityError for netcode-packet cadences', () => {
    expect(() => assertDurableCadence({ everyMs: 16 })).toThrow(GranularityError)
    expect(() => assertDurableCadence({ everyMs: 16 })).toThrow(/durable floor/)
  })

  it('passes for save-file-grade cadences', () => {
    expect(() => assertDurableCadence('daily')).not.toThrow()
    expect(() => assertDurableCadence({ everyMs: 60_000 })).not.toThrow()
  })
})

describe('assertDurableSchemas', () => {
  const durable = ['xnet://xnet.fyi/GameItem@1.0.0', 'xnet://xnet.fyi/Achievement@1.0.0']

  it('passes when every schema is in the durable allowlist', () => {
    expect(() => assertDurableSchemas(['xnet://xnet.fyi/GameItem@1.0.0'], durable)).not.toThrow()
  })

  it('throws naming the offenders when a schema is outside the pack', () => {
    expect(() => assertDurableSchemas(['xnet://xnet.fyi/ActorTransform@1.0.0'], durable)).toThrow(
      /ActorTransform/
    )
  })
})
