import { describe, it, expect } from 'vitest'
import {
  roleHasCapability,
  evaluateCondition,
  getMostPermissiveCapability,
  STANDARD_ROLES,
  type TimeCondition
} from './permissions'

describe('Permissions', () => {
  describe('roleHasCapability', () => {
    it('should check viewer capabilities', () => {
      expect(roleHasCapability(STANDARD_ROLES.viewer, 'read')).toBe(true)
      expect(roleHasCapability(STANDARD_ROLES.viewer, 'write')).toBe(false)
    })

    it('should check editor capabilities', () => {
      expect(roleHasCapability(STANDARD_ROLES.editor, 'read')).toBe(true)
      expect(roleHasCapability(STANDARD_ROLES.editor, 'write')).toBe(true)
      expect(roleHasCapability(STANDARD_ROLES.editor, 'delete')).toBe(false)
    })

    it('should check admin capabilities', () => {
      expect(roleHasCapability(STANDARD_ROLES.admin, 'read')).toBe(true)
      expect(roleHasCapability(STANDARD_ROLES.admin, 'write')).toBe(true)
      expect(roleHasCapability(STANDARD_ROLES.admin, 'delete')).toBe(true)
      expect(roleHasCapability(STANDARD_ROLES.admin, 'share')).toBe(true)
      expect(roleHasCapability(STANDARD_ROLES.admin, 'admin')).toBe(true)
    })
  })

  describe('evaluateCondition', () => {
    it('should evaluate time condition - after', () => {
      const condition: TimeCondition = {
        type: 'time',
        value: { after: 1000 }
      }
      expect(evaluateCondition(condition, { now: 2000 })).toBe(true)
      expect(evaluateCondition(condition, { now: 500 })).toBe(false)
    })

    it('should evaluate time condition - before', () => {
      const condition: TimeCondition = {
        type: 'time',
        value: { before: 3000 }
      }
      expect(evaluateCondition(condition, { now: 2000 })).toBe(true)
      expect(evaluateCondition(condition, { now: 4000 })).toBe(false)
    })

    it('should evaluate time condition - range', () => {
      const condition: TimeCondition = {
        type: 'time',
        value: { after: 1000, before: 3000 }
      }
      expect(evaluateCondition(condition, { now: 2000 })).toBe(true)
      expect(evaluateCondition(condition, { now: 500 })).toBe(false)
      expect(evaluateCondition(condition, { now: 4000 })).toBe(false)
    })
  })

  describe('getMostPermissiveCapability', () => {
    it('should return most permissive capability', () => {
      expect(getMostPermissiveCapability(['read', 'write'])).toBe('write')
      expect(getMostPermissiveCapability(['read', 'admin'])).toBe('admin')
      expect(getMostPermissiveCapability(['read'])).toBe('read')
    })

    it('should return null for empty list', () => {
      expect(getMostPermissiveCapability([])).toBe(null)
    })
  })
})
