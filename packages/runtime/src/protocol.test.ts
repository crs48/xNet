import { CURRENT_PROTOCOL_VERSION } from '@xnetjs/sync'
import { describe, it, expect } from 'vitest'
import {
  XNET_PROTOCOL_VERSION,
  XNET_SUPPORTED_PROTOCOL_VERSIONS,
  negotiateProtocolVersion,
  isProtocolCompatible
} from './protocol'

describe('XNET_PROTOCOL_VERSION', () => {
  it('advertises the xnet/1.0 umbrella id', () => {
    expect(XNET_PROTOCOL_VERSION.id).toBe('xnet/1.0')
    expect(XNET_SUPPORTED_PROTOCOL_VERSIONS).toContain('xnet/1.0')
  })

  it('bundles the change record version from @xnetjs/sync (single source of truth)', () => {
    // If CURRENT_PROTOCOL_VERSION changes without updating the bundle, this
    // fails — the umbrella version cannot silently drift from the wire format.
    expect(XNET_PROTOCOL_VERSION.change).toBe(CURRENT_PROTOCOL_VERSION)
  })

  it('pins the documented subsystem versions', () => {
    expect(XNET_PROTOCOL_VERSION.dataModel).toBe(1)
    expect(XNET_PROTOCOL_VERSION.syncEnvelope).toBe(2)
    expect(XNET_PROTOCOL_VERSION.awareness).toBe(1)
    expect(XNET_PROTOCOL_VERSION.schema).toBe('1.0.0')
    expect(XNET_PROTOCOL_VERSION.cryptoLevel).toBe(0)
    expect(XNET_PROTOCOL_VERSION.ucan).toBe('1.0')
  })
})

describe('negotiateProtocolVersion', () => {
  it('returns the newest shared umbrella version', () => {
    expect(negotiateProtocolVersion(['xnet/1.1', 'xnet/1.0'], ['xnet/1.0'])).toBe('xnet/1.0')
  })

  it('prefers our ordering (newest first) on multiple overlaps', () => {
    expect(negotiateProtocolVersion(['xnet/2.0', 'xnet/1.0'], ['xnet/1.0', 'xnet/2.0'])).toBe(
      'xnet/2.0'
    )
  })

  it('returns null when the sets do not intersect', () => {
    expect(negotiateProtocolVersion(['xnet/1.0'], ['xnet/9.9'])).toBeNull()
  })
})

describe('isProtocolCompatible', () => {
  it('is true for a peer advertising our version', () => {
    expect(isProtocolCompatible(['xnet/1.0'])).toBe(true)
  })

  it('is false for an unknown-only peer', () => {
    expect(isProtocolCompatible(['xnet/0.1'])).toBe(false)
  })
})
