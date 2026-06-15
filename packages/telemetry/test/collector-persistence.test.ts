import { describe, it, expect, beforeEach } from 'vitest'
import { TelemetryCollector } from '../src/collection/collector'
import { MemoryTelemetryBuffer } from '../src/collection/persistence'
import { ConsentManager, MemoryConsentStorage } from '../src/consent'

const newConsent = async () => {
  const consent = new ConsentManager({ storage: new MemoryConsentStorage(), autoLoad: false })
  await consent.setTier('anonymous')
  return consent
}

describe('TelemetryCollector durable buffer', () => {
  let buffer: MemoryTelemetryBuffer

  beforeEach(() => {
    buffer = new MemoryTelemetryBuffer()
  })

  it('mirrors reported records into the buffer', async () => {
    const consent = await newConsent()
    const collector = new TelemetryCollector({ consent, buffer })

    collector.reportUsage('editor.save', 3)
    // append is fire-and-forget; let the microtask flush.
    await Promise.resolve()

    const persisted = await buffer.all()
    expect(persisted).toHaveLength(1)
    expect(persisted[0].schemaId).toContain('UsageMetric')
    expect(persisted[0].status).toBe('local')
  })

  it('does not persist records blocked by consent', async () => {
    const consent = new ConsentManager({ storage: new MemoryConsentStorage(), autoLoad: false })
    // tier 'off' — nothing should be collected or persisted
    const collector = new TelemetryCollector({ consent, buffer })

    expect(collector.reportUsage('editor.save', 1)).toBeNull()
    await Promise.resolve()
    expect(await buffer.all()).toHaveLength(0)
  })

  it('hydrates records from the buffer on startup', async () => {
    const consent = await newConsent()

    // First session writes some records.
    const first = new TelemetryCollector({ consent, buffer })
    first.reportUsage('a', 1)
    first.reportUsage('b', 2)
    await Promise.resolve()

    // New collector (simulating a reload) hydrates from the same buffer.
    const second = new TelemetryCollector({ consent, buffer })
    expect(second.getLocalTelemetry()).toHaveLength(0)
    await second.hydrate()
    expect(second.getLocalTelemetry()).toHaveLength(2)
  })

  it('keeps ids unique after hydrate', async () => {
    const consent = await newConsent()
    const first = new TelemetryCollector({ consent, buffer })
    first.reportUsage('a', 1)
    await Promise.resolve()

    const second = new TelemetryCollector({ consent, buffer })
    await second.hydrate()
    const newId = second.reportUsage('b', 1)
    const ids = second.getLocalTelemetry().map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(newId).not.toBeNull()
  })

  it('writes status changes through to the buffer', async () => {
    const consent = await newConsent()
    const collector = new TelemetryCollector({ consent, buffer })
    const id = collector.reportUsage('a', 1)!
    await Promise.resolve()

    collector.approveForSharing(id)
    await Promise.resolve()
    expect((await buffer.all())[0].status).toBe('pending')

    collector.markShared(id)
    await Promise.resolve()
    expect((await buffer.all())[0].status).toBe('shared')
  })

  it('removes records from the buffer on delete', async () => {
    const consent = await newConsent()
    const collector = new TelemetryCollector({ consent, buffer })
    const id = collector.reportUsage('a', 1)!
    await Promise.resolve()

    collector.deleteTelemetry(id)
    await Promise.resolve()
    expect(await buffer.all()).toHaveLength(0)
  })

  it('prunes aged terminal records during hydrate', async () => {
    const consent = await newConsent()
    const old = Date.now() - 30 * 24 * 60 * 60 * 1000
    await buffer.append({
      id: 'tel_1_old',
      schemaId: 'xnet://xnet.fyi/telemetry/UsageMetric',
      data: {},
      createdAt: old,
      status: 'shared'
    })

    const collector = new TelemetryCollector({
      consent,
      buffer,
      bufferKeepMs: 7 * 24 * 60 * 60 * 1000
    })
    await collector.hydrate()
    expect(collector.getLocalTelemetry()).toHaveLength(0)
    expect(await buffer.all()).toHaveLength(0)
  })
})
