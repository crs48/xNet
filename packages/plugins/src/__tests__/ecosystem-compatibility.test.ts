/**
 * Tests for the dependency-free semver compatibility helpers (exploration 0192).
 */

import { describe, it, expect } from 'vitest'
import {
  parseVersion,
  compareVersions,
  satisfiesRange,
  isHostCompatible,
  hasUpdate
} from '../ecosystem/compatibility'

describe('parseVersion', () => {
  it('parses major.minor.patch and ignores pre/build/v-prefix', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 })
    expect(parseVersion('v0.6.0')).toEqual({ major: 0, minor: 6, patch: 0 })
    expect(parseVersion('2.0.0-beta.1')).toEqual({ major: 2, minor: 0, patch: 0 })
    expect(parseVersion('nope')).toBeNull()
  })
})

describe('compareVersions', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareVersions(parseVersion('1.0.0')!, parseVersion('2.0.0')!)).toBeLessThan(0)
    expect(compareVersions(parseVersion('1.2.0')!, parseVersion('1.1.9')!)).toBeGreaterThan(0)
    expect(compareVersions(parseVersion('1.2.3')!, parseVersion('1.2.3')!)).toBe(0)
  })
})

describe('satisfiesRange', () => {
  it('treats *, x and empty as any', () => {
    expect(satisfiesRange('1.0.0', '*')).toBe(true)
    expect(satisfiesRange('1.0.0', 'x')).toBe(true)
    expect(satisfiesRange('1.0.0', '')).toBe(true)
  })

  it('handles comparison operators', () => {
    expect(satisfiesRange('0.7.0', '>=0.6.0')).toBe(true)
    expect(satisfiesRange('0.5.0', '>=0.6.0')).toBe(false)
    expect(satisfiesRange('1.0.0', '>1.0.0')).toBe(false)
    expect(satisfiesRange('1.0.0', '<=1.0.0')).toBe(true)
    expect(satisfiesRange('0.9.9', '<1.0.0')).toBe(true)
  })

  it('handles caret ranges including 0.x special cases', () => {
    expect(satisfiesRange('1.4.0', '^1.2.3')).toBe(true)
    expect(satisfiesRange('2.0.0', '^1.2.3')).toBe(false)
    expect(satisfiesRange('0.2.9', '^0.2.3')).toBe(true)
    expect(satisfiesRange('0.3.0', '^0.2.3')).toBe(false)
    expect(satisfiesRange('0.0.3', '^0.0.3')).toBe(true)
    expect(satisfiesRange('0.0.4', '^0.0.3')).toBe(false)
  })

  it('handles tilde ranges', () => {
    expect(satisfiesRange('1.2.9', '~1.2.3')).toBe(true)
    expect(satisfiesRange('1.3.0', '~1.2.3')).toBe(false)
  })

  it('fails an exact match for the wrong version', () => {
    expect(satisfiesRange('1.0.1', '1.0.0')).toBe(false)
    expect(satisfiesRange('1.0.0', '1.0.0')).toBe(true)
  })
})

describe('isHostCompatible', () => {
  it('is always compatible when no requirement is declared', () => {
    expect(isHostCompatible(undefined, '0.5.0')).toBe(true)
  })
  it('gates on the declared range', () => {
    expect(isHostCompatible('>=0.6.0', '0.6.1')).toBe(true)
    expect(isHostCompatible('>=0.6.0', '0.5.9')).toBe(false)
  })
})

describe('hasUpdate', () => {
  it('detects a newer available version', () => {
    expect(hasUpdate('1.0.0', '1.1.0')).toBe(true)
    expect(hasUpdate('1.1.0', '1.0.0')).toBe(false)
    expect(hasUpdate('1.0.0', '1.0.0')).toBe(false)
    expect(hasUpdate('bad', '1.0.0')).toBe(false)
  })
})
