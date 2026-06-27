/**
 * Charter §Consent receipt (exploration 0234): the "what we know about you"
 * mirror is complete (covers every registered derived-data producer) and every
 * item it surfaces is actually purgeable from its underlying store.
 */

import { describe, it, expect } from 'vitest'
import { TelemetryCollector } from '../src/collection/collector'
import { ConsentManager, MemoryConsentStorage } from '../src/consent'
import {
  DERIVED_DATA_KINDS,
  describeWhatWeKnow,
  missingDerivedKinds,
  telemetryDerivedSource,
  type DerivedDataKind,
  type DerivedDataSource,
  type DerivedItem
} from '../src/dignity'

/** A minimal source that surfaces one item for the given kind. */
function fakeSource(kind: DerivedDataKind, store: Set<string>): DerivedDataSource {
  const id = `${kind}-1`
  store.add(id)
  return {
    kind,
    list: (): DerivedItem[] =>
      store.has(id)
        ? [
            {
              id,
              kind,
              label: `${kind} artifact`,
              location: 'this device',
              purge: () => store.delete(id)
            }
          ]
        : []
  }
}

describe('Charter §Consent — derived-data mirror', () => {
  it('is complete: every registered producer kind has a source', () => {
    const store = new Set<string>()
    const sources = DERIVED_DATA_KINDS.map((kind) => fakeSource(kind, store))
    expect(missingDerivedKinds(sources)).toEqual([])
  })

  it('flags an incomplete mirror (a registered kind with no source)', () => {
    const store = new Set<string>()
    // Cover every kind except the first → it must be reported missing.
    const partial = DERIVED_DATA_KINDS.slice(1).map((kind) => fakeSource(kind, store))
    expect(missingDerivedKinds(partial)).toEqual([DERIVED_DATA_KINDS[0]])
  })

  it('surfaces an item for every kind, then purges remove them', async () => {
    const store = new Set<string>()
    const sources = DERIVED_DATA_KINDS.map((kind) => fakeSource(kind, store))

    const before = await describeWhatWeKnow(sources)
    expect(new Set(before.map((i) => i.kind))).toEqual(new Set(DERIVED_DATA_KINDS))

    await Promise.all(before.map((item) => item.purge()))
    const after = await describeWhatWeKnow(sources)
    expect(after).toEqual([])
  })

  it('telemetry source surfaces real buffered records and purges them', async () => {
    const consent = new ConsentManager({ storage: new MemoryConsentStorage(), autoLoad: false })
    await consent.setTier('anonymous')
    const collector = new TelemetryCollector({ consent })
    collector.reportUsage('pages.opened', 3)

    const source = telemetryDerivedSource(collector)
    const items = await Promise.resolve(source.list())
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'telemetry', location: 'this device' })

    await items[0].purge()
    expect(collector.getLocalTelemetry()).toHaveLength(0)
  })
})
