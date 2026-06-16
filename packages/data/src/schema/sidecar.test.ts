import { describe, it, expect } from 'vitest'
import { sidecarId, sidecarOverlayKeys, mergeSidecarsIntoRow } from './sidecar'

describe('sidecar helpers', () => {
  it('builds deterministic sidecar ids', () => {
    expect(sidecarId('did:key:z6Mk', 'contact1')).toBe('sidecar:did:key:z6Mk:contact1')
  })

  it('projects sidecar properties into namespaced overlay keys', () => {
    const keys = sidecarOverlayKeys({
      authority: 'did:key:z6Mk',
      properties: { target: 'contact1', space: 's1', priority: 'high', notes: 'call back' }
    })
    expect(keys).toEqual({
      'ext:did:key:z6Mk/priority': 'high',
      'ext:did:key:z6Mk/notes': 'call back'
    })
  })

  it('merges sidecars into a row with base winning collisions', () => {
    const row = mergeSidecarsIntoRow({ name: 'Ada', 'ext:acme.com/leadScore': 90 }, [
      { authority: 'acme.com', properties: { leadScore: 10, region: 'EU' } } // base wins leadScore
    ])
    expect(row).toEqual({
      name: 'Ada',
      'ext:acme.com/leadScore': 90,
      'ext:acme.com/region': 'EU'
    })
  })
})
