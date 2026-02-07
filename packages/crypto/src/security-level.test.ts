import type { SecurityLevel, UnifiedSignature } from './index'
import { describe, it, expect } from 'vitest'
import {
  SECURITY_LEVELS,
  DEFAULT_SECURITY_LEVEL,
  isSecurityLevel,
  getSecurityLevelConfig,
  requiresEd25519,
  requiresMlDsa,
  validateSignature,
  signatureSize,
  isUnifiedSignature,
  encodeSignature,
  decodeSignature,
  encodeSignatureBinary,
  decodeSignatureBinary,
  estimateSignatureSize,
  ED25519_SIGNATURE_SIZE,
  ML_DSA_65_SIGNATURE_SIZE,
  HYBRID_SIGNATURE_SIZE_LEVEL_0,
  HYBRID_SIGNATURE_SIZE_LEVEL_1,
  HYBRID_SIGNATURE_SIZE_LEVEL_2
} from './index'

describe('SecurityLevel', () => {
  describe('SECURITY_LEVELS', () => {
    it('has three levels defined', () => {
      expect(Object.keys(SECURITY_LEVELS)).toHaveLength(3)
      expect(SECURITY_LEVELS[0]).toBeDefined()
      expect(SECURITY_LEVELS[1]).toBeDefined()
      expect(SECURITY_LEVELS[2]).toBeDefined()
    })

    it('Level 0 uses Ed25519 only', () => {
      const config = SECURITY_LEVELS[0]
      expect(config.name).toBe('Fast')
      expect(config.algorithms.signing).toEqual(['ed25519'])
      expect(config.algorithms.keyExchange).toEqual(['x25519'])
      expect(config.signatureSize).toBe(ED25519_SIGNATURE_SIZE)
    })

    it('Level 1 uses both Ed25519 and ML-DSA', () => {
      const config = SECURITY_LEVELS[1]
      expect(config.name).toBe('Hybrid')
      expect(config.algorithms.signing).toEqual(['ed25519', 'ml-dsa-65'])
      expect(config.algorithms.keyExchange).toEqual(['x25519', 'ml-kem-768'])
      expect(config.signatureSize).toBe(64 + 3309) // ED25519 + ML-DSA-65
    })

    it('Level 2 uses ML-DSA only', () => {
      const config = SECURITY_LEVELS[2]
      expect(config.name).toBe('Post-Quantum')
      expect(config.algorithms.signing).toEqual(['ml-dsa-65'])
      expect(config.algorithms.keyExchange).toEqual(['ml-kem-768'])
      expect(config.signatureSize).toBe(3309) // ML-DSA-65
    })
  })

  describe('DEFAULT_SECURITY_LEVEL', () => {
    it('defaults to Level 0 (Fast) for zero overhead', () => {
      expect(DEFAULT_SECURITY_LEVEL).toBe(0)
    })
  })

  describe('isSecurityLevel', () => {
    it('returns true for valid levels', () => {
      expect(isSecurityLevel(0)).toBe(true)
      expect(isSecurityLevel(1)).toBe(true)
      expect(isSecurityLevel(2)).toBe(true)
    })

    it('returns false for invalid values', () => {
      expect(isSecurityLevel(-1)).toBe(false)
      expect(isSecurityLevel(3)).toBe(false)
      expect(isSecurityLevel('1')).toBe(false)
      expect(isSecurityLevel(null)).toBe(false)
      expect(isSecurityLevel(undefined)).toBe(false)
    })
  })

  describe('getSecurityLevelConfig', () => {
    it('returns config for each level', () => {
      expect(getSecurityLevelConfig(0).name).toBe('Fast')
      expect(getSecurityLevelConfig(1).name).toBe('Hybrid')
      expect(getSecurityLevelConfig(2).name).toBe('Post-Quantum')
    })
  })

  describe('requiresEd25519', () => {
    it('returns true for levels 0 and 1', () => {
      expect(requiresEd25519(0)).toBe(true)
      expect(requiresEd25519(1)).toBe(true)
    })

    it('returns false for level 2', () => {
      expect(requiresEd25519(2)).toBe(false)
    })
  })

  describe('requiresMlDsa', () => {
    it('returns false for level 0', () => {
      expect(requiresMlDsa(0)).toBe(false)
    })

    it('returns true for levels 1 and 2', () => {
      expect(requiresMlDsa(1)).toBe(true)
      expect(requiresMlDsa(2)).toBe(true)
    })
  })
})

describe('UnifiedSignature', () => {
  describe('validateSignature', () => {
    it('validates Level 0 signature', () => {
      const sig: UnifiedSignature = {
        level: 0,
        ed25519: new Uint8Array(64)
      }
      const result = validateSignature(sig)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('rejects Level 0 without ed25519', () => {
      const sig = { level: 0 as const }
      const result = validateSignature(sig)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Level 0 signature must have ed25519 component')
    })

    it('rejects Level 0 with mlDsa', () => {
      const sig: UnifiedSignature = {
        level: 0,
        ed25519: new Uint8Array(64),
        mlDsa: new Uint8Array(3309)
      }
      const result = validateSignature(sig)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Level 0 signature should not have mlDsa component')
    })

    it('validates Level 1 signature', () => {
      const sig: UnifiedSignature = {
        level: 1,
        ed25519: new Uint8Array(64),
        mlDsa: new Uint8Array(3309)
      }
      const result = validateSignature(sig)
      expect(result.valid).toBe(true)
    })

    it('rejects Level 1 without ed25519', () => {
      const sig = {
        level: 1 as const,
        mlDsa: new Uint8Array(3309)
      }
      const result = validateSignature(sig)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Level 1 signature must have ed25519 component')
    })

    it('rejects Level 1 without mlDsa', () => {
      const sig = {
        level: 1 as const,
        ed25519: new Uint8Array(64)
      }
      const result = validateSignature(sig)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Level 1 signature must have mlDsa component')
    })

    it('validates Level 2 signature', () => {
      const sig: UnifiedSignature = {
        level: 2,
        mlDsa: new Uint8Array(3309)
      }
      const result = validateSignature(sig)
      expect(result.valid).toBe(true)
    })

    it('rejects Level 2 with ed25519', () => {
      const sig = {
        level: 2 as const,
        ed25519: new Uint8Array(64),
        mlDsa: new Uint8Array(3309)
      }
      const result = validateSignature(sig)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Level 2 signature should not have ed25519 component')
    })

    it('rejects wrong ed25519 size', () => {
      const sig = {
        level: 0 as const,
        ed25519: new Uint8Array(32) // wrong size
      }
      const result = validateSignature(sig)
      expect(result.valid).toBe(false)
      expect(result.errors[0]).toContain('must be 64 bytes')
    })

    it('rejects wrong mlDsa size', () => {
      const sig = {
        level: 2 as const,
        mlDsa: new Uint8Array(100) // too small
      }
      const result = validateSignature(sig)
      expect(result.valid).toBe(false)
      expect(result.errors[0]).toContain('should be ~3309 bytes')
    })
  })

  describe('signatureSize', () => {
    it('calculates Level 0 size', () => {
      const sig: UnifiedSignature = { level: 0, ed25519: new Uint8Array(64) }
      expect(signatureSize(sig)).toBe(65) // 1 + 64
    })

    it('calculates Level 1 size', () => {
      const sig: UnifiedSignature = {
        level: 1,
        ed25519: new Uint8Array(64),
        mlDsa: new Uint8Array(3309)
      }
      expect(signatureSize(sig)).toBe(3374) // 1 + 64 + 3309
    })

    it('calculates Level 2 size', () => {
      const sig: UnifiedSignature = { level: 2, mlDsa: new Uint8Array(3309) }
      expect(signatureSize(sig)).toBe(3310) // 1 + 3309
    })
  })

  describe('isUnifiedSignature', () => {
    it('accepts valid Level 0 signature', () => {
      const sig = { level: 0, ed25519: new Uint8Array(64) }
      expect(isUnifiedSignature(sig)).toBe(true)
    })

    it('accepts valid Level 1 signature', () => {
      const sig = {
        level: 1,
        ed25519: new Uint8Array(64),
        mlDsa: new Uint8Array(3309)
      }
      expect(isUnifiedSignature(sig)).toBe(true)
    })

    it('accepts valid Level 2 signature', () => {
      const sig = { level: 2, mlDsa: new Uint8Array(3309) }
      expect(isUnifiedSignature(sig)).toBe(true)
    })

    it('rejects non-objects', () => {
      expect(isUnifiedSignature(null)).toBe(false)
      expect(isUnifiedSignature('string')).toBe(false)
      expect(isUnifiedSignature(123)).toBe(false)
    })

    it('rejects invalid level', () => {
      expect(isUnifiedSignature({ level: 5 })).toBe(false)
    })

    it('rejects wrong component presence for Level 0', () => {
      expect(isUnifiedSignature({ level: 0 })).toBe(false)
      expect(isUnifiedSignature({ level: 0, mlDsa: new Uint8Array(3309) })).toBe(false)
    })

    it('rejects wrong ed25519 size', () => {
      expect(isUnifiedSignature({ level: 0, ed25519: new Uint8Array(32) })).toBe(false)
    })

    it('rejects non-Uint8Array components', () => {
      expect(isUnifiedSignature({ level: 0, ed25519: [1, 2, 3] })).toBe(false)
    })
  })
})

describe('Signature encoding', () => {
  describe('JSON wire format', () => {
    it('round-trips Level 0 signature', () => {
      const original: UnifiedSignature = {
        level: 0,
        ed25519: new Uint8Array([1, 2, 3, ...Array(61).fill(0)])
      }
      const wire = encodeSignature(original)
      const decoded = decodeSignature(wire)

      expect(wire.l).toBe(0)
      expect(wire.e).toBeDefined()
      expect(wire.p).toBeUndefined()
      expect(decoded.level).toBe(0)
      expect(decoded.ed25519).toEqual(original.ed25519)
      expect(decoded.mlDsa).toBeUndefined()
    })

    it('round-trips Level 1 signature', () => {
      const original: UnifiedSignature = {
        level: 1,
        ed25519: new Uint8Array(64).fill(1),
        mlDsa: new Uint8Array(3309).fill(2)
      }
      const wire = encodeSignature(original)
      const decoded = decodeSignature(wire)

      expect(wire.l).toBe(1)
      expect(wire.e).toBeDefined()
      expect(wire.p).toBeDefined()
      expect(decoded.level).toBe(1)
      expect(decoded.ed25519).toEqual(original.ed25519)
      expect(decoded.mlDsa).toEqual(original.mlDsa)
    })

    it('round-trips Level 2 signature', () => {
      const original: UnifiedSignature = {
        level: 2,
        mlDsa: new Uint8Array(3309).fill(3)
      }
      const wire = encodeSignature(original)
      const decoded = decodeSignature(wire)

      expect(wire.l).toBe(2)
      expect(wire.e).toBeUndefined()
      expect(wire.p).toBeDefined()
      expect(decoded.level).toBe(2)
      expect(decoded.ed25519).toBeUndefined()
      expect(decoded.mlDsa).toEqual(original.mlDsa)
    })
  })

  describe('Binary format', () => {
    it('round-trips Level 0 signature', () => {
      const original: UnifiedSignature = {
        level: 0,
        ed25519: new Uint8Array(64).fill(42)
      }
      const binary = encodeSignatureBinary(original)
      const decoded = decodeSignatureBinary(binary)

      expect(binary.length).toBe(65)
      expect(binary[0]).toBe(0) // level byte
      expect(decoded.level).toBe(0)
      expect(decoded.ed25519).toEqual(original.ed25519)
    })

    it('round-trips Level 1 signature', () => {
      const original: UnifiedSignature = {
        level: 1,
        ed25519: new Uint8Array(64).fill(1),
        mlDsa: new Uint8Array(3309).fill(2)
      }
      const binary = encodeSignatureBinary(original)
      const decoded = decodeSignatureBinary(binary)

      expect(binary.length).toBe(3374) // 1 + 64 + 3309
      expect(binary[0]).toBe(1) // level byte
      expect(decoded.level).toBe(1)
      expect(decoded.ed25519).toEqual(original.ed25519)
      expect(decoded.mlDsa).toEqual(original.mlDsa)
    })

    it('round-trips Level 2 signature', () => {
      const original: UnifiedSignature = {
        level: 2,
        mlDsa: new Uint8Array(3309).fill(3)
      }
      const binary = encodeSignatureBinary(original)
      const decoded = decodeSignatureBinary(binary)

      expect(binary.length).toBe(3310) // 1 + 3309
      expect(binary[0]).toBe(2) // level byte
      expect(decoded.level).toBe(2)
      expect(decoded.mlDsa).toEqual(original.mlDsa)
    })

    it('throws on empty data', () => {
      expect(() => decodeSignatureBinary(new Uint8Array(0))).toThrow('Signature data too short')
    })

    it('throws on Level 0 too short', () => {
      expect(() => decodeSignatureBinary(new Uint8Array([0, 1, 2]))).toThrow(
        'Level 0 signature too short'
      )
    })

    it('throws on Level 1 too short', () => {
      expect(() => decodeSignatureBinary(new Uint8Array([1, 1, 2]))).toThrow(
        'Level 1 signature too short'
      )
    })

    it('throws on invalid level', () => {
      expect(() => decodeSignatureBinary(new Uint8Array([5]))).toThrow('Invalid security level')
    })
  })

  describe('estimateSignatureSize', () => {
    it('returns correct size for each level', () => {
      expect(estimateSignatureSize(0)).toBe(65) // 1 + 64
      expect(estimateSignatureSize(1)).toBe(3374) // 1 + 64 + 3309
      expect(estimateSignatureSize(2)).toBe(3310) // 1 + 3309
    })

    it('throws on invalid level', () => {
      expect(() => estimateSignatureSize(5 as SecurityLevel)).toThrow('Invalid security level')
    })
  })
})

describe('Algorithm size constants', () => {
  it('has correct Ed25519 sizes', () => {
    expect(ED25519_SIGNATURE_SIZE).toBe(64)
  })

  it('has correct ML-DSA-65 sizes', () => {
    expect(ML_DSA_65_SIGNATURE_SIZE).toBe(3309)
  })

  it('has correct hybrid signature sizes', () => {
    expect(HYBRID_SIGNATURE_SIZE_LEVEL_0).toBe(64)
    expect(HYBRID_SIGNATURE_SIZE_LEVEL_1).toBe(64 + 3309)
    expect(HYBRID_SIGNATURE_SIZE_LEVEL_2).toBe(3309)
  })
})
