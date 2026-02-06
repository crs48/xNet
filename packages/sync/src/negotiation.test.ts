/**
 * Tests for version negotiation protocol
 */
import { describe, it, expect } from 'vitest'
import { CURRENT_PROTOCOL_VERSION } from './change'
import {
  VersionNegotiator,
  createLocalCapabilities,
  parseCapabilities,
  type PeerCapabilities
} from './negotiation'

describe('negotiation', () => {
  const negotiator = new VersionNegotiator()

  describe('createLocalCapabilities', () => {
    it('should create capabilities with defaults', () => {
      const caps = createLocalCapabilities('did:key:z123')
      expect(caps.peerId).toBe('did:key:z123')
      expect(caps.protocolVersion).toBe(CURRENT_PROTOCOL_VERSION)
      expect(caps.minProtocolVersion).toBe(1)
      expect(caps.features).toContain('node-changes')
      expect(caps.features).toContain('yjs-updates')
    })

    it('should allow custom features', () => {
      const caps = createLocalCapabilities('did:key:z123', ['node-changes', 'yjs-updates'])
      expect(caps.features).toHaveLength(2)
      expect(caps.features).toContain('node-changes')
    })

    it('should allow custom options', () => {
      const caps = createLocalCapabilities('did:key:z123', undefined, {
        packageVersion: '1.0.0',
        minProtocolVersion: 1,
        schemas: ['xnet://app/Task@1.0.0']
      })
      expect(caps.packageVersion).toBe('1.0.0')
      expect(caps.minProtocolVersion).toBe(1)
      expect(caps.schemas).toContain('xnet://app/Task@1.0.0')
    })
  })

  describe('parseCapabilities', () => {
    it('should parse valid capabilities', () => {
      const message = {
        peerId: 'did:key:z123',
        protocolVersion: 1,
        minProtocolVersion: 1,
        features: ['node-changes', 'yjs-updates'],
        packageVersion: '0.5.0'
      }
      const caps = parseCapabilities(message)
      expect(caps).not.toBeNull()
      expect(caps!.peerId).toBe('did:key:z123')
      expect(caps!.protocolVersion).toBe(1)
      expect(caps!.features).toContain('node-changes')
    })

    it('should handle missing optional fields', () => {
      const message = {
        peerId: 'did:key:z123'
      }
      const caps = parseCapabilities(message)
      expect(caps).not.toBeNull()
      expect(caps!.protocolVersion).toBe(CURRENT_PROTOCOL_VERSION)
      expect(caps!.minProtocolVersion).toBe(1)
    })

    it('should accept did field as peerId', () => {
      const message = {
        did: 'did:key:z456'
      }
      const caps = parseCapabilities(message)
      expect(caps).not.toBeNull()
      expect(caps!.peerId).toBe('did:key:z456')
    })

    it('should return null for invalid input', () => {
      expect(parseCapabilities(null)).toBeNull()
      expect(parseCapabilities(undefined)).toBeNull()
      expect(parseCapabilities('string')).toBeNull()
      expect(parseCapabilities({})).toBeNull() // Missing peerId
    })

    it('should filter unknown features', () => {
      const message = {
        peerId: 'did:key:z123',
        protocolVersion: 1,
        features: ['node-changes', 'unknown-feature', 'yjs-updates']
      }
      const caps = parseCapabilities(message)
      expect(caps!.features).toContain('node-changes')
      expect(caps!.features).toContain('yjs-updates')
      expect(caps!.features).not.toContain('unknown-feature')
    })

    it('should parse schemas array', () => {
      const message = {
        peerId: 'did:key:z123',
        schemas: ['xnet://app/Task@1.0.0', 'xnet://app/Project@1.0.0']
      }
      const caps = parseCapabilities(message)
      expect(caps!.schemas).toHaveLength(2)
      expect(caps!.schemas).toContain('xnet://app/Task@1.0.0')
    })
  })

  describe('VersionNegotiator.negotiate', () => {
    it('should negotiate successfully with matching versions', () => {
      const local = createLocalCapabilities('did:key:local', ['node-changes', 'yjs-updates'])
      const remote: PeerCapabilities = {
        peerId: 'did:key:remote',
        protocolVersion: 1,
        minProtocolVersion: 1,
        features: ['node-changes', 'yjs-updates'],
        packageVersion: '0.5.0'
      }

      const result = negotiator.negotiate(local, remote)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.agreedVersion).toBe(1)
        expect(result.commonFeatures).toContain('node-changes')
        expect(result.commonFeatures).toContain('yjs-updates')
        expect(result.peerId).toBe('did:key:remote')
      }
    })

    it('should negotiate to lower version when needed', () => {
      const local = createLocalCapabilities('did:key:local')
      // Simulate local at v2, set explicitly
      const localV2: PeerCapabilities = {
        ...local,
        protocolVersion: 2,
        minProtocolVersion: 1
      }
      const remote: PeerCapabilities = {
        peerId: 'did:key:remote',
        protocolVersion: 1,
        minProtocolVersion: 1,
        features: ['node-changes', 'yjs-updates'],
        packageVersion: '0.4.0'
      }

      const result = negotiator.negotiate(localV2, remote)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.agreedVersion).toBe(1) // Negotiated to v1
        expect(result.warnings.length).toBeGreaterThan(0)
      }
    })

    it('should fail when versions are incompatible', () => {
      const local: PeerCapabilities = {
        peerId: 'did:key:local',
        protocolVersion: 1,
        minProtocolVersion: 1,
        features: ['node-changes', 'yjs-updates'],
        packageVersion: '0.5.0'
      }
      const remote: PeerCapabilities = {
        peerId: 'did:key:remote',
        protocolVersion: 3,
        minProtocolVersion: 2, // Requires at least v2
        features: ['node-changes', 'yjs-updates'],
        packageVersion: '1.0.0'
      }

      const result = negotiator.negotiate(local, remote)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe('incompatible-versions')
        expect(result.suggestion).toBe('upgrade-client')
      }
    })

    it('should suggest upgrade-hub when remote is too old', () => {
      const local: PeerCapabilities = {
        peerId: 'did:key:local',
        protocolVersion: 3,
        minProtocolVersion: 2,
        features: ['node-changes', 'yjs-updates'],
        packageVersion: '1.0.0'
      }
      const remote: PeerCapabilities = {
        peerId: 'did:key:remote',
        protocolVersion: 1,
        minProtocolVersion: 1,
        features: ['node-changes', 'yjs-updates'],
        packageVersion: '0.3.0'
      }

      const result = negotiator.negotiate(local, remote)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.suggestion).toBe('upgrade-hub')
      }
    })

    it('should find common features', () => {
      const local = createLocalCapabilities('did:key:local', [
        'node-changes',
        'yjs-updates',
        'batch-changes',
        'signed-yjs-envelopes'
      ])
      const remote: PeerCapabilities = {
        peerId: 'did:key:remote',
        protocolVersion: 1,
        minProtocolVersion: 1,
        features: ['node-changes', 'yjs-updates', 'lamport-ordering'],
        packageVersion: '0.5.0'
      }

      const result = negotiator.negotiate(local, remote)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.commonFeatures).toContain('node-changes')
        expect(result.commonFeatures).toContain('yjs-updates')
        expect(result.commonFeatures).not.toContain('batch-changes')
        expect(result.commonFeatures).not.toContain('lamport-ordering')
      }
    })

    it('should provide canUse helper', () => {
      const local = createLocalCapabilities('did:key:local', ['node-changes', 'yjs-updates'])
      const remote: PeerCapabilities = {
        peerId: 'did:key:remote',
        protocolVersion: 1,
        minProtocolVersion: 1,
        features: ['node-changes', 'yjs-updates'],
        packageVersion: '0.5.0'
      }

      const result = negotiator.negotiate(local, remote)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.canUse('node-changes')).toBe(true)
        expect(result.canUse('schema-versioning')).toBe(false)
      }
    })

    it('should warn about degraded features', () => {
      const local = createLocalCapabilities('did:key:local', [
        'node-changes',
        'yjs-updates',
        'batch-changes'
      ])
      const remote: PeerCapabilities = {
        peerId: 'did:key:remote',
        protocolVersion: 1,
        minProtocolVersion: 1,
        features: ['node-changes', 'yjs-updates'],
        packageVersion: '0.5.0'
      }

      const result = negotiator.negotiate(local, remote)
      expect(result.success).toBe(true)
      if (result.success) {
        const degradedWarning = result.warnings.find((w) => w.type === 'degraded-features')
        expect(degradedWarning).toBeDefined()
        expect(degradedWarning!.affectedFeatures).toContain('batch-changes')
      }
    })

    it('should warn about version mismatch', () => {
      const local: PeerCapabilities = {
        peerId: 'did:key:local',
        protocolVersion: 2,
        minProtocolVersion: 1,
        features: ['node-changes', 'yjs-updates'],
        packageVersion: '0.6.0'
      }
      const remote: PeerCapabilities = {
        peerId: 'did:key:remote',
        protocolVersion: 1,
        minProtocolVersion: 1,
        features: ['node-changes', 'yjs-updates'],
        packageVersion: '0.5.0'
      }

      const result = negotiator.negotiate(local, remote)
      expect(result.success).toBe(true)
      if (result.success) {
        const versionWarning = result.warnings.find((w) => w.type === 'version-mismatch')
        expect(versionWarning).toBeDefined()
      }
    })

    it('should fail when required features are missing', () => {
      const local: PeerCapabilities = {
        peerId: 'did:key:local',
        protocolVersion: 1,
        minProtocolVersion: 1,
        features: ['node-changes'], // Missing yjs-updates (required)
        packageVersion: '0.5.0'
      }
      const remote: PeerCapabilities = {
        peerId: 'did:key:remote',
        protocolVersion: 1,
        minProtocolVersion: 1,
        features: ['node-changes'], // Also missing yjs-updates
        packageVersion: '0.5.0'
      }

      const result = negotiator.negotiate(local, remote)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe('missing-required-features')
        expect(result.message).toContain('yjs-updates')
      }
    })
  })

  describe('VersionNegotiator.validateCapabilities', () => {
    it('should validate correct capabilities', () => {
      const caps = createLocalCapabilities('did:key:z123', ['node-changes', 'yjs-updates'])
      const result = negotiator.validateCapabilities(caps)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject missing peerId', () => {
      const caps: PeerCapabilities = {
        peerId: '',
        protocolVersion: 1,
        minProtocolVersion: 1,
        features: ['node-changes', 'yjs-updates'],
        packageVersion: '0.5.0'
      }
      const result = negotiator.validateCapabilities(caps)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Missing peerId')
    })

    it('should reject protocol version less than 1', () => {
      const caps: PeerCapabilities = {
        peerId: 'did:key:z123',
        protocolVersion: 0,
        minProtocolVersion: 0,
        features: [],
        packageVersion: '0.5.0'
      }
      const result = negotiator.validateCapabilities(caps)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Protocol version'))).toBe(true)
    })

    it('should reject min version greater than max version', () => {
      const caps: PeerCapabilities = {
        peerId: 'did:key:z123',
        protocolVersion: 1,
        minProtocolVersion: 2,
        features: ['node-changes', 'yjs-updates'],
        packageVersion: '0.5.0'
      }
      const result = negotiator.validateCapabilities(caps)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Minimum protocol version'))).toBe(true)
    })

    it('should validate feature dependencies', () => {
      const caps: PeerCapabilities = {
        peerId: 'did:key:z123',
        protocolVersion: 2,
        minProtocolVersion: 1,
        features: ['node-changes', 'yjs-updates', 'schema-lenses'], // Missing schema-versioning
        packageVersion: '0.5.0'
      }
      const result = negotiator.validateCapabilities(caps)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('schema-versioning'))).toBe(true)
    })
  })
})
