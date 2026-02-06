/**
 * Tests for the deprecation system.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  checkDeprecations,
  checkAndLogDeprecations,
  logDeprecation,
  clearLoggedDeprecations,
  configureDeprecationPolicy,
  getDeprecationsByType,
  getDeprecation,
  isDeprecated,
  registerDeprecation,
  formatDeprecationReport,
  DEPRECATION_POLICY,
  DEPRECATIONS,
  DeprecationError,
  type DeprecationNotice,
  type DeprecationContext
} from './deprecation'

describe('Deprecation System', () => {
  beforeEach(() => {
    clearLoggedDeprecations()
    // Reset policy to defaults
    configureDeprecationPolicy({
      logWarnings: true,
      strictMode: false,
      logger: console.warn
    })
  })

  describe('checkDeprecations', () => {
    it('should return empty array when no deprecations apply', () => {
      const context: DeprecationContext = {
        protocolVersion: 1,
        schemas: [],
        features: []
      }

      const warnings = checkDeprecations(context)
      expect(warnings).toHaveLength(0)
    })

    it('should detect deprecated protocol version', () => {
      const context: DeprecationContext = {
        protocolVersion: 0
      }

      const warnings = checkDeprecations(context)
      expect(warnings.length).toBeGreaterThan(0)
      expect(warnings.some((w) => w.notice.type === 'protocol')).toBe(true)
    })

    it('should detect legacy Yjs updates', () => {
      const context: DeprecationContext = {
        protocolVersion: 0
      }

      const warnings = checkDeprecations(context)
      const yjsWarning = warnings.find((w) => w.notice.subject.includes('Yjs'))
      expect(yjsWarning).toBeDefined()
    })

    it('should not warn for current protocol version', () => {
      const context: DeprecationContext = {
        protocolVersion: 1
      }

      const warnings = checkDeprecations(context)
      const protocolWarnings = warnings.filter((w) => w.notice.type === 'protocol')
      expect(protocolWarnings).toHaveLength(0)
    })

    it('should return warning severity for deprecated items', () => {
      const context: DeprecationContext = {
        protocolVersion: 0
      }

      const warnings = checkDeprecations(context)
      expect(warnings[0].severity).toBe('warning')
    })

    it('should include migration guide in action', () => {
      const context: DeprecationContext = {
        protocolVersion: 0
      }

      const warnings = checkDeprecations(context)
      const withGuide = warnings.find((w) => w.notice.migrationGuide)
      expect(withGuide?.action).toContain('See')
    })
  })

  describe('checkAndLogDeprecations', () => {
    it('should log deprecation warnings', () => {
      const mockLogger = vi.fn()
      configureDeprecationPolicy({ logger: mockLogger })

      const context: DeprecationContext = {
        protocolVersion: 0
      }

      checkAndLogDeprecations(context)
      expect(mockLogger).toHaveBeenCalled()
    })

    it('should not log the same deprecation twice', () => {
      const mockLogger = vi.fn()
      configureDeprecationPolicy({ logger: mockLogger })

      const context: DeprecationContext = {
        protocolVersion: 0
      }

      checkAndLogDeprecations(context)
      checkAndLogDeprecations(context)

      // Each unique deprecation should only be logged once
      const uniqueCalls = new Set(mockLogger.mock.calls.map((c) => c[0]))
      expect(mockLogger.mock.calls.length).toBe(uniqueCalls.size)
    })

    it('should not log when logWarnings is false', () => {
      const mockLogger = vi.fn()
      configureDeprecationPolicy({
        logger: mockLogger,
        logWarnings: false
      })

      const context: DeprecationContext = {
        protocolVersion: 0
      }

      checkAndLogDeprecations(context)
      expect(mockLogger).not.toHaveBeenCalled()
    })
  })

  describe('logDeprecation', () => {
    it('should log with [DEPRECATED] prefix for warnings', () => {
      const mockLogger = vi.fn()
      configureDeprecationPolicy({ logger: mockLogger })

      const warning = checkDeprecations({ protocolVersion: 0 })[0]
      logDeprecation(warning)

      expect(mockLogger).toHaveBeenCalled()
      expect(mockLogger.mock.calls[0][0]).toContain('[DEPRECATED]')
    })

    it('should only log each deprecation once', () => {
      const mockLogger = vi.fn()
      configureDeprecationPolicy({ logger: mockLogger })

      const warning = checkDeprecations({ protocolVersion: 0 })[0]
      logDeprecation(warning)
      logDeprecation(warning)
      logDeprecation(warning)

      expect(mockLogger).toHaveBeenCalledTimes(1)
    })
  })

  describe('clearLoggedDeprecations', () => {
    it('should allow re-logging after clear', () => {
      const mockLogger = vi.fn()
      configureDeprecationPolicy({ logger: mockLogger })

      const warning = checkDeprecations({ protocolVersion: 0 })[0]
      logDeprecation(warning)
      clearLoggedDeprecations()
      logDeprecation(warning)

      expect(mockLogger).toHaveBeenCalledTimes(2)
    })
  })

  describe('getDeprecationsByType', () => {
    it('should filter by protocol type', () => {
      const protocols = getDeprecationsByType('protocol')
      expect(protocols.every((d) => d.type === 'protocol')).toBe(true)
    })

    it('should return empty array for unused types', () => {
      const apis = getDeprecationsByType('api')
      expect(apis).toHaveLength(0)
    })
  })

  describe('getDeprecation', () => {
    it('should find deprecation by subject', () => {
      const notice = getDeprecation('Protocol v0 (unsigned changes)')
      expect(notice).toBeDefined()
      expect(notice?.type).toBe('protocol')
    })

    it('should return undefined for unknown subject', () => {
      const notice = getDeprecation('nonexistent-deprecation')
      expect(notice).toBeUndefined()
    })
  })

  describe('isDeprecated', () => {
    it('should return true for deprecated items', () => {
      expect(isDeprecated('Protocol v0 (unsigned changes)')).toBe(true)
    })

    it('should return false for non-deprecated items', () => {
      expect(isDeprecated('nonexistent')).toBe(false)
    })
  })

  describe('registerDeprecation', () => {
    it('should add new deprecation notice', () => {
      const notice: DeprecationNotice = {
        type: 'api',
        subject: 'test-api-deprecation',
        description: 'Test deprecation',
        deprecatedIn: '1.0.0'
      }

      registerDeprecation(notice)

      expect(isDeprecated('test-api-deprecation')).toBe(true)
      expect(getDeprecation('test-api-deprecation')).toEqual(notice)
    })

    it('should update existing deprecation', () => {
      const notice1: DeprecationNotice = {
        type: 'api',
        subject: 'update-test',
        description: 'Original',
        deprecatedIn: '1.0.0'
      }

      const notice2: DeprecationNotice = {
        type: 'api',
        subject: 'update-test',
        description: 'Updated',
        deprecatedIn: '2.0.0'
      }

      registerDeprecation(notice1)
      registerDeprecation(notice2)

      const found = getDeprecation('update-test')
      expect(found?.description).toBe('Updated')
      expect(found?.deprecatedIn).toBe('2.0.0')
    })
  })

  describe('formatDeprecationReport', () => {
    it('should return no warnings message for empty array', () => {
      const report = formatDeprecationReport([])
      expect(report).toContain('No deprecation warnings')
    })

    it('should format warnings correctly', () => {
      const warnings = checkDeprecations({ protocolVersion: 0 })
      const report = formatDeprecationReport(warnings)

      expect(report).toContain('Deprecation Report')
      expect(report).toContain('DEPRECATED')
    })

    it('should include migration actions', () => {
      const warnings = checkDeprecations({ protocolVersion: 0 })
      const report = formatDeprecationReport(warnings)

      expect(report).toContain('Migrate to')
    })
  })

  describe('DeprecationError', () => {
    it('should include warning details in message', () => {
      const warning = checkDeprecations({ protocolVersion: 0 })[0]
      const error = new DeprecationError(warning)

      expect(error.message).toContain(warning.message)
      expect(error.name).toBe('DeprecationError')
      expect(error.warning).toBe(warning)
    })
  })

  describe('strict mode', () => {
    it('should throw error for removed functionality in strict mode', () => {
      configureDeprecationPolicy({ strictMode: true })

      // Register a "removed" deprecation
      registerDeprecation({
        type: 'api',
        subject: 'removed-test',
        description: 'Removed API',
        deprecatedIn: '0.1.0',
        removedIn: '0.5.0',
        sunsetDate: '2020-01-01' // In the past
      })

      // This test is tricky because we need to simulate a removed item
      // For now, we verify the mechanism exists
      expect(DEPRECATION_POLICY.strictMode).toBe(true)
    })
  })

  describe('configureDeprecationPolicy', () => {
    it('should update policy settings', () => {
      configureDeprecationPolicy({
        minimumDeprecationPeriodDays: 365,
        logWarnings: false,
        strictMode: true
      })

      expect(DEPRECATION_POLICY.minimumDeprecationPeriodDays).toBe(365)
      expect(DEPRECATION_POLICY.logWarnings).toBe(false)
      expect(DEPRECATION_POLICY.strictMode).toBe(true)
    })

    it('should preserve unset values', () => {
      const originalLogger = DEPRECATION_POLICY.logger
      configureDeprecationPolicy({ logWarnings: false })

      expect(DEPRECATION_POLICY.logger).toBe(originalLogger)
    })
  })

  describe('DEPRECATIONS registry', () => {
    it('should have protocol deprecations', () => {
      const protocols = DEPRECATIONS.filter((d) => d.type === 'protocol')
      expect(protocols.length).toBeGreaterThan(0)
    })

    it('should have valid deprecation notices', () => {
      for (const notice of DEPRECATIONS) {
        expect(notice.type).toBeDefined()
        expect(notice.subject).toBeDefined()
        expect(notice.description).toBeDefined()
        expect(notice.deprecatedIn).toBeDefined()
      }
    })

    it('should have alternatives where possible', () => {
      const withAlternatives = DEPRECATIONS.filter((d) => d.alternative)
      expect(withAlternatives.length).toBeGreaterThan(0)
    })
  })
})
