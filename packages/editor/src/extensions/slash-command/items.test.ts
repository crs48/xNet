import { describe, it, expect } from 'vitest'
import { filterCommands, getAllCommands, COMMAND_GROUPS } from './items'

describe('slash command items', () => {
  describe('COMMAND_GROUPS', () => {
    it('should have at least one group', () => {
      expect(COMMAND_GROUPS.length).toBeGreaterThan(0)
    })

    it('should have items in each group', () => {
      for (const group of COMMAND_GROUPS) {
        expect(group.items.length).toBeGreaterThan(0)
      }
    })

    it('should have required properties on each item', () => {
      for (const group of COMMAND_GROUPS) {
        for (const item of group.items) {
          expect(item.title).toBeTruthy()
          expect(item.description).toBeTruthy()
          expect(item.icon).toBeTruthy()
          expect(typeof item.command).toBe('function')
        }
      }
    })
  })

  describe('getAllCommands', () => {
    it('should return all commands as flat array', () => {
      const commands = getAllCommands()
      const totalItems = COMMAND_GROUPS.reduce((sum, g) => sum + g.items.length, 0)
      expect(commands.length).toBe(totalItems)
    })
  })

  describe('filterCommands', () => {
    it('should return all commands when query is empty', () => {
      const result = filterCommands('')
      expect(result.length).toBe(getAllCommands().length)
    })

    it('should filter by title', () => {
      const result = filterCommands('heading')
      expect(result.length).toBeGreaterThan(0)
      expect(
        result.every(
          (item) =>
            item.title.toLowerCase().includes('heading') ||
            item.searchTerms?.some((t) => t.includes('heading')) ||
            item.description.toLowerCase().includes('heading')
        )
      ).toBe(true)
    })

    it('should filter by search terms', () => {
      const result = filterCommands('todo')
      expect(result.some((item) => item.title === 'Task List')).toBe(true)
    })

    it('should be case insensitive', () => {
      const result1 = filterCommands('CODE')
      const result2 = filterCommands('code')
      expect(result1).toEqual(result2)
    })

    it('should return empty array when no matches', () => {
      const result = filterCommands('xyznonexistent')
      expect(result.length).toBe(0)
    })

    it('should filter by description', () => {
      const result = filterCommands('separator')
      expect(result.some((item) => item.title === 'Divider')).toBe(true)
    })
  })
})
