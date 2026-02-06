/**
 * Tests for feature flag system
 */
import { describe, it, expect } from 'vitest'
import {
  FEATURES,
  ALL_FEATURES,
  getEnabledFeatures,
  isFeatureEnabled,
  getRequiredFeatures,
  getOptionalFeatures,
  getFeatureVersion,
  isFeatureAvailable,
  getFeatureDependencies,
  getFeatureConflicts,
  getAllDependencies,
  validateFeatureSet,
  intersectFeatures,
  diffFeatures,
  addDependencies,
  type FeatureFlag
} from './features'

describe('features', () => {
  describe('FEATURES registry', () => {
    it('should have all expected feature flags', () => {
      expect(ALL_FEATURES).toContain('node-changes')
      expect(ALL_FEATURES).toContain('yjs-updates')
      expect(ALL_FEATURES).toContain('schema-versioning')
      expect(ALL_FEATURES).toContain('capability-negotiation')
    })

    it('should have required core features', () => {
      expect(FEATURES['node-changes'].required).toBe(true)
      expect(FEATURES['yjs-updates'].required).toBe(true)
    })

    it('should have optional v2 features', () => {
      expect(FEATURES['schema-versioning'].required).toBe(false)
      expect(FEATURES['capability-negotiation'].required).toBe(false)
    })

    it('should have proper version assignments', () => {
      expect(FEATURES['node-changes'].since).toBe(1)
      expect(FEATURES['schema-versioning'].since).toBe(2)
      expect(FEATURES['federated-queries'].since).toBe(3)
    })
  })

  describe('getEnabledFeatures', () => {
    it('should return core features for protocol v1', () => {
      const features = getEnabledFeatures(1)
      expect(features).toContain('node-changes')
      expect(features).toContain('yjs-updates')
      expect(features).toContain('signed-yjs-envelopes')
      expect(features).toContain('batch-changes')
    })

    it('should not return v2 features for protocol v1', () => {
      const features = getEnabledFeatures(1)
      expect(features).not.toContain('schema-versioning')
      expect(features).not.toContain('capability-negotiation')
    })

    it('should return v1 and v2 features for protocol v2', () => {
      const features = getEnabledFeatures(2)
      // v1 features
      expect(features).toContain('node-changes')
      expect(features).toContain('yjs-updates')
      // v2 features
      expect(features).toContain('schema-versioning')
      expect(features).toContain('capability-negotiation')
      expect(features).toContain('peer-scoring')
    })

    it('should not return v3 features for protocol v2', () => {
      const features = getEnabledFeatures(2)
      expect(features).not.toContain('federated-queries')
      expect(features).not.toContain('schema-inheritance')
    })

    it('should return all features for protocol v3', () => {
      const features = getEnabledFeatures(3)
      expect(features).toContain('federated-queries')
      expect(features).toContain('schema-inheritance')
      expect(features).toContain('compressed-payloads')
    })

    it('should return empty for protocol v0', () => {
      const features = getEnabledFeatures(0)
      expect(features).toHaveLength(0)
    })
  })

  describe('isFeatureEnabled', () => {
    it('should return true for enabled features', () => {
      const enabled: FeatureFlag[] = ['node-changes', 'yjs-updates', 'schema-versioning']
      expect(isFeatureEnabled('node-changes', enabled)).toBe(true)
      expect(isFeatureEnabled('schema-versioning', enabled)).toBe(true)
    })

    it('should return false for disabled features', () => {
      const enabled: FeatureFlag[] = ['node-changes', 'yjs-updates']
      expect(isFeatureEnabled('schema-versioning', enabled)).toBe(false)
      expect(isFeatureEnabled('federated-queries', enabled)).toBe(false)
    })

    it('should work with string arrays from negotiation', () => {
      const enabled = ['node-changes', 'yjs-updates'] as const
      expect(isFeatureEnabled('node-changes', enabled)).toBe(true)
    })
  })

  describe('getRequiredFeatures', () => {
    it('should return required features for protocol v1', () => {
      const required = getRequiredFeatures(1)
      expect(required).toContain('node-changes')
      expect(required).toContain('yjs-updates')
      expect(required).not.toContain('batch-changes')
    })

    it('should only include features at or below the version', () => {
      const required = getRequiredFeatures(1)
      // There should only be v1 required features
      for (const feature of required) {
        expect(FEATURES[feature].since).toBeLessThanOrEqual(1)
      }
    })
  })

  describe('getOptionalFeatures', () => {
    it('should return optional features for protocol v1', () => {
      const optional = getOptionalFeatures(1)
      expect(optional).toContain('signed-yjs-envelopes')
      expect(optional).toContain('batch-changes')
      expect(optional).not.toContain('node-changes') // required
    })

    it('should return optional v2 features for protocol v2', () => {
      const optional = getOptionalFeatures(2)
      expect(optional).toContain('schema-versioning')
      expect(optional).toContain('capability-negotiation')
    })
  })

  describe('getFeatureVersion', () => {
    it('should return correct version for each feature', () => {
      expect(getFeatureVersion('node-changes')).toBe(1)
      expect(getFeatureVersion('schema-versioning')).toBe(2)
      expect(getFeatureVersion('federated-queries')).toBe(3)
    })
  })

  describe('isFeatureAvailable', () => {
    it('should return true when feature is available', () => {
      expect(isFeatureAvailable('node-changes', 1)).toBe(true)
      expect(isFeatureAvailable('node-changes', 2)).toBe(true)
      expect(isFeatureAvailable('schema-versioning', 2)).toBe(true)
    })

    it('should return false when feature is not yet available', () => {
      expect(isFeatureAvailable('schema-versioning', 1)).toBe(false)
      expect(isFeatureAvailable('federated-queries', 2)).toBe(false)
    })
  })

  describe('getFeatureDependencies', () => {
    it('should return dependencies for features that have them', () => {
      expect(getFeatureDependencies('signed-yjs-envelopes')).toContain('yjs-updates')
      expect(getFeatureDependencies('batch-changes')).toContain('node-changes')
      expect(getFeatureDependencies('schema-lenses')).toContain('schema-versioning')
    })

    it('should return empty array for features without dependencies', () => {
      expect(getFeatureDependencies('node-changes')).toHaveLength(0)
      expect(getFeatureDependencies('yjs-updates')).toHaveLength(0)
    })
  })

  describe('getFeatureConflicts', () => {
    it('should return empty array for features without conflicts', () => {
      expect(getFeatureConflicts('node-changes')).toHaveLength(0)
      expect(getFeatureConflicts('schema-versioning')).toHaveLength(0)
    })
  })

  describe('getAllDependencies', () => {
    it('should return transitive dependencies', () => {
      // schema-lenses -> schema-versioning
      const deps = getAllDependencies('schema-lenses')
      expect(deps).toContain('schema-versioning')
    })

    it('should return empty for features without dependencies', () => {
      expect(getAllDependencies('node-changes')).toHaveLength(0)
    })

    it('should handle features with direct dependencies', () => {
      const deps = getAllDependencies('signed-yjs-envelopes')
      expect(deps).toContain('yjs-updates')
    })
  })

  describe('validateFeatureSet', () => {
    it('should pass for valid feature set with required features', () => {
      const features: FeatureFlag[] = ['node-changes', 'yjs-updates']
      const result = validateFeatureSet(features, 1)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should fail when required features are missing', () => {
      const features: FeatureFlag[] = ['batch-changes'] // Missing node-changes, yjs-updates
      const result = validateFeatureSet(features, 1)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.type === 'missing-required')).toBe(true)
    })

    it('should fail when dependencies are missing', () => {
      const features: FeatureFlag[] = [
        'node-changes',
        'yjs-updates',
        'schema-lenses' // requires schema-versioning
      ]
      const result = validateFeatureSet(features, 2)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.type === 'missing-dependency')).toBe(true)
    })

    it('should fail when feature is not available at version', () => {
      const features: FeatureFlag[] = [
        'node-changes',
        'yjs-updates',
        'schema-versioning' // v2 feature
      ]
      const result = validateFeatureSet(features, 1)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.type === 'version-mismatch')).toBe(true)
    })

    it('should pass for complete valid v2 feature set', () => {
      const features: FeatureFlag[] = [
        'node-changes',
        'yjs-updates',
        'schema-versioning',
        'schema-lenses'
      ]
      const result = validateFeatureSet(features, 2)
      expect(result.valid).toBe(true)
    })
  })

  describe('intersectFeatures', () => {
    it('should return common features', () => {
      const local: FeatureFlag[] = ['node-changes', 'yjs-updates', 'schema-versioning']
      const remote: FeatureFlag[] = ['node-changes', 'yjs-updates', 'batch-changes']
      const common = intersectFeatures(local, remote)
      expect(common).toContain('node-changes')
      expect(common).toContain('yjs-updates')
      expect(common).not.toContain('schema-versioning')
      expect(common).not.toContain('batch-changes')
    })

    it('should return empty for no common features', () => {
      const local: FeatureFlag[] = ['schema-versioning']
      const remote: FeatureFlag[] = ['batch-changes']
      const common = intersectFeatures(local, remote)
      expect(common).toHaveLength(0)
    })

    it('should work with string arrays', () => {
      const local: FeatureFlag[] = ['node-changes', 'yjs-updates']
      const remote = ['node-changes', 'batch-changes'] as string[]
      const common = intersectFeatures(local, remote)
      expect(common).toContain('node-changes')
      expect(common).not.toContain('yjs-updates')
    })
  })

  describe('diffFeatures', () => {
    it('should return features in a but not in b', () => {
      const a: FeatureFlag[] = ['node-changes', 'yjs-updates', 'schema-versioning']
      const b: FeatureFlag[] = ['node-changes', 'yjs-updates']
      const diff = diffFeatures(a, b)
      expect(diff).toContain('schema-versioning')
      expect(diff).not.toContain('node-changes')
      expect(diff).not.toContain('yjs-updates')
    })

    it('should return empty when a is subset of b', () => {
      const a: FeatureFlag[] = ['node-changes']
      const b: FeatureFlag[] = ['node-changes', 'yjs-updates']
      const diff = diffFeatures(a, b)
      expect(diff).toHaveLength(0)
    })
  })

  describe('addDependencies', () => {
    it('should add missing dependencies', () => {
      const features: FeatureFlag[] = ['schema-lenses'] // requires schema-versioning
      const withDeps = addDependencies(features)
      expect(withDeps).toContain('schema-lenses')
      expect(withDeps).toContain('schema-versioning')
    })

    it('should not duplicate existing dependencies', () => {
      const features: FeatureFlag[] = ['schema-versioning', 'schema-lenses']
      const withDeps = addDependencies(features)
      const versioningCount = withDeps.filter((f) => f === 'schema-versioning').length
      expect(versioningCount).toBe(1)
    })

    it('should preserve features without dependencies', () => {
      const features: FeatureFlag[] = ['node-changes', 'yjs-updates']
      const withDeps = addDependencies(features)
      expect(withDeps).toContain('node-changes')
      expect(withDeps).toContain('yjs-updates')
      expect(withDeps).toHaveLength(2)
    })
  })
})
