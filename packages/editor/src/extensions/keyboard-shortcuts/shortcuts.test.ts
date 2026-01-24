import { describe, it, expect } from 'vitest'
import {
  KEYBOARD_SHORTCUTS,
  getShortcutsByCategory,
  getShortcutById,
  getShortcutsMap
} from './shortcuts'
import { formatShortcut } from './types'

describe('keyboard shortcuts', () => {
  describe('KEYBOARD_SHORTCUTS', () => {
    it('should have unique IDs', () => {
      const ids = KEYBOARD_SHORTCUTS.map((s) => s.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)
    })

    it('should have unique keys', () => {
      const keys = KEYBOARD_SHORTCUTS.map((s) => s.keys)
      const uniqueKeys = new Set(keys)
      expect(uniqueKeys.size).toBe(keys.length)
    })

    it('should have required properties', () => {
      KEYBOARD_SHORTCUTS.forEach((shortcut) => {
        expect(shortcut.id).toBeTruthy()
        expect(shortcut.name).toBeTruthy()
        expect(shortcut.description).toBeTruthy()
        expect(shortcut.keys).toBeTruthy()
        expect(shortcut.display.mac).toBeTruthy()
        expect(shortcut.display.windows).toBeTruthy()
        expect(shortcut.category).toBeTruthy()
        expect(typeof shortcut.command).toBe('function')
      })
    })

    it('should cover all categories', () => {
      const categories = new Set(KEYBOARD_SHORTCUTS.map((s) => s.category))
      expect(categories.has('formatting')).toBe(true)
      expect(categories.has('blocks')).toBe(true)
      expect(categories.has('lists')).toBe(true)
      expect(categories.has('editor')).toBe(true)
    })

    it('should include core formatting shortcuts', () => {
      const ids = KEYBOARD_SHORTCUTS.map((s) => s.id)
      expect(ids).toContain('bold')
      expect(ids).toContain('italic')
      expect(ids).toContain('code')
      expect(ids).toContain('strikethrough')
    })

    it('should include block shortcuts', () => {
      const ids = KEYBOARD_SHORTCUTS.map((s) => s.id)
      expect(ids).toContain('heading-1')
      expect(ids).toContain('heading-2')
      expect(ids).toContain('heading-3')
      expect(ids).toContain('blockquote')
      expect(ids).toContain('code-block')
    })

    it('should include list shortcuts', () => {
      const ids = KEYBOARD_SHORTCUTS.map((s) => s.id)
      expect(ids).toContain('bullet-list')
      expect(ids).toContain('ordered-list')
      expect(ids).toContain('task-list')
    })
  })

  describe('getShortcutsByCategory', () => {
    it('should return only shortcuts from specified category', () => {
      const formatting = getShortcutsByCategory('formatting')
      expect(formatting.every((s) => s.category === 'formatting')).toBe(true)
      expect(formatting.length).toBeGreaterThan(0)
    })

    it('should return blocks category', () => {
      const blocks = getShortcutsByCategory('blocks')
      expect(blocks.every((s) => s.category === 'blocks')).toBe(true)
      expect(blocks.length).toBeGreaterThan(0)
    })

    it('should return empty array for unknown category', () => {
      const result = getShortcutsByCategory('unknown' as any)
      expect(result).toEqual([])
    })
  })

  describe('getShortcutById', () => {
    it('should return shortcut by ID', () => {
      const bold = getShortcutById('bold')
      expect(bold).toBeDefined()
      expect(bold?.name).toBe('Bold')
      expect(bold?.keys).toBe('Mod-b')
    })

    it('should return undefined for unknown ID', () => {
      const result = getShortcutById('nonexistent')
      expect(result).toBeUndefined()
    })
  })

  describe('getShortcutsMap', () => {
    it('should return map keyed by shortcut keys', () => {
      const map = getShortcutsMap()
      expect(map.get('Mod-b')?.id).toBe('bold')
      expect(map.get('Mod-i')?.id).toBe('italic')
    })

    it('should contain all shortcuts', () => {
      const map = getShortcutsMap()
      expect(map.size).toBe(KEYBOARD_SHORTCUTS.length)
    })
  })

  describe('formatShortcut', () => {
    it('should format Mod correctly', () => {
      const result = formatShortcut('Mod-b')
      expect(result.mac).toBe('⌘B')
      expect(result.windows).toBe('Ctrl+B')
    })

    it('should format Shift correctly', () => {
      const result = formatShortcut('Mod-Shift-s')
      expect(result.mac).toBe('⌘⇧S')
      expect(result.windows).toBe('Ctrl+Shift+S')
    })

    it('should format Alt correctly', () => {
      const result = formatShortcut('Mod-Alt-1')
      expect(result.mac).toBe('⌘⌥1')
      expect(result.windows).toBe('Ctrl+Alt+1')
    })

    it('should format Ctrl separately from Mod', () => {
      const result = formatShortcut('Ctrl-c')
      expect(result.mac).toBe('⌃C')
      expect(result.windows).toBe('Ctrl+C')
    })

    it('should format multi-modifier shortcuts', () => {
      const result = formatShortcut('Mod-Shift-Alt-x')
      expect(result.mac).toBe('⌘⇧⌥X')
      expect(result.windows).toBe('Ctrl+Shift+Alt+X')
    })

    it('should uppercase single letter keys', () => {
      const result = formatShortcut('Mod-k')
      expect(result.mac).toBe('⌘K')
      expect(result.windows).toBe('Ctrl+K')
    })
  })
})
