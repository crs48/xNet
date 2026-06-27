/**
 * Charter §Consent receipt (exploration 0234): "nothing leaves without
 * permission." A fresh install is tier `off`, and at `off` every telemetry path
 * is a no-op — nothing is buffered, so nothing can be sent. Opting in is a real
 * gate, not theatre: a higher tier actually starts recording.
 */

import { describe, it, expect } from 'vitest'
import { TelemetryCollector } from '../src/collection/collector'
import { ConsentManager, MemoryConsentStorage, DEFAULT_CONSENT } from '../src/consent'

function freshConsent(): ConsentManager {
  return new ConsentManager({ storage: new MemoryConsentStorage(), autoLoad: false })
}

describe('Charter §Consent — off by default', () => {
  it('defaults a fresh install to tier off (not enabled)', () => {
    expect(DEFAULT_CONSENT.tier).toBe('off')
    const consent = freshConsent()
    expect(consent.current.tier).toBe('off')
    expect(consent.isEnabled).toBe(false)
  })

  it('buffers nothing while consent is off — no surplus to send', () => {
    const collector = new TelemetryCollector({ consent: freshConsent() })

    // Every reporting path is exercised; all must be refused at tier off.
    expect(collector.report('xnet://telemetry/Event', { a: 1 })).toBeNull()
    expect(collector.reportUsage('pages.opened', 3)).toBeNull()
    expect(collector.reportPerformance('route.render', 42)).toBeNull()
    expect(collector.reportCrash(new Error('boom'))).toBeNull()
    expect(collector.reportSecurityEvent('probe', 'low')).toBeNull()

    expect(collector.getStats().total).toBe(0)
  })

  it('is a real gate: opting in starts recording', async () => {
    const consent = freshConsent()
    const collector = new TelemetryCollector({ consent })

    expect(collector.reportUsage('pages.opened', 3)).toBeNull()
    await consent.setTier('anonymous')
    expect(collector.reportUsage('pages.opened', 3)).not.toBeNull()
    expect(collector.getStats().total).toBe(1)
  })
})
