import { describe, it, expect } from 'vitest'
import { MARK_SYNTAX, getSyntax, getEnabledMarks } from './syntax'

describe('syntax', () => {
  describe('MARK_SYNTAX', () => {
    it('should have definitions for all standard marks', () => {
      expect(MARK_SYNTAX.bold).toBeDefined()
      expect(MARK_SYNTAX.italic).toBeDefined()
      expect(MARK_SYNTAX.strike).toBeDefined()
      expect(MARK_SYNTAX.code).toBeDefined()
    })

    it('should have open and close syntax for each mark', () => {
      for (const [, syntax] of Object.entries(MARK_SYNTAX)) {
        expect(syntax.open).toBeTruthy()
        expect(syntax.close).toBeTruthy()
        expect(syntax.priority).toBeTypeOf('number')
      }
    })
  })

  describe('getSyntax', () => {
    it('should return syntax for known marks', () => {
      expect(getSyntax('bold')).toMatchObject({ open: '**', close: '**' })
      expect(getSyntax('italic')).toMatchObject({ open: '*', close: '*' })
    })

    it('should return null for unknown marks', () => {
      expect(getSyntax('unknown')).toBeNull()
      expect(getSyntax('')).toBeNull()
    })
  })

  describe('getEnabledMarks', () => {
    it('should return all marks when no options provided', () => {
      const marks = getEnabledMarks()
      expect(marks).toContain('bold')
      expect(marks).toContain('italic')
      expect(marks).toContain('strike')
      expect(marks).toContain('code')
    })

    it('should filter to specified marks', () => {
      const marks = getEnabledMarks({ marks: ['bold', 'italic'] })
      expect(marks).toEqual(['bold', 'italic'])
    })

    it('should ignore unknown marks in options', () => {
      const marks = getEnabledMarks({ marks: ['bold', 'unknown', 'code'] })
      expect(marks).toEqual(['bold', 'code'])
    })
  })
})
