import { describe, it, expect } from 'vitest'
import type { SchemaIRI } from './node'
import { composeLens, promoteOverlay } from './lens-builders'

describe('promoteOverlay lens (overlay → core graduation)', () => {
  const lens = composeLens(
    'xnet://xnet.fyi/Contact@1.0.0' as SchemaIRI,
    'xnet://xnet.fyi/Contact@2.0.0' as SchemaIRI,
    promoteOverlay('acme.com', 'leadScore', 'leadScore')
  )

  it('forward moves the overlay key onto the core property', () => {
    expect(lens.forward({ name: 'Ada', 'ext:acme.com/leadScore': 87 })).toEqual({
      name: 'Ada',
      leadScore: 87
    })
  })

  it('backward restores the overlay key', () => {
    expect(lens.backward({ name: 'Ada', leadScore: 87 })).toEqual({
      name: 'Ada',
      'ext:acme.com/leadScore': 87
    })
  })

  it('is lossless and round-trips', () => {
    expect(lens.lossless).toBe(true)
    const original = { name: 'Ada', 'ext:acme.com/leadScore': 87 }
    expect(lens.backward(lens.forward(original))).toEqual(original)
  })
})
