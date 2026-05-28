import { describe, expect, it } from 'vitest'
import {
  deriveKeyboardState,
  DEFAULT_KEYBOARD_THRESHOLDS,
  resolveToolbarPolicy,
  shouldShowDesktopToolbar
} from './editor-ux-state'

describe('editor UX state helpers', () => {
  describe('deriveKeyboardState', () => {
    it('detects keyboard by viewport height delta', () => {
      const state = deriveKeyboardState(
        {
          layoutHeight: 900,
          viewportHeight: 620,
          viewportOffsetTop: 0
        },
        DEFAULT_KEYBOARD_THRESHOLDS
      )

      expect(state.visible).toBe(true)
      expect(state.height).toBe(280)
    })

    it('detects keyboard by viewport offset top', () => {
      const state = deriveKeyboardState(
        {
          layoutHeight: 900,
          viewportHeight: 860,
          viewportOffsetTop: 48
        },
        DEFAULT_KEYBOARD_THRESHOLDS
      )

      expect(state.visible).toBe(true)
    })

    it('stays hidden when deltas are below thresholds', () => {
      const state = deriveKeyboardState(
        {
          layoutHeight: 900,
          viewportHeight: 850,
          viewportOffsetTop: 0
        },
        DEFAULT_KEYBOARD_THRESHOLDS
      )

      expect(state.visible).toBe(false)
      expect(state.height).toBe(0)
    })
  })

  describe('shouldShowDesktopToolbar', () => {
    it('shows for range selection outside code blocks', () => {
      expect(
        shouldShowDesktopToolbar({
          selectionShape: 'range',
          inCodeBlock: false
        })
      ).toBe(true)
    })

    it('hides for node selection', () => {
      expect(
        shouldShowDesktopToolbar({
          selectionShape: 'node',
          inCodeBlock: false
        })
      ).toBe(false)
    })

    it('hides when cursor is in a code block', () => {
      expect(
        shouldShowDesktopToolbar({
          selectionShape: 'range',
          inCodeBlock: true
        })
      ).toBe(false)
    })
  })

  describe('resolveToolbarPolicy', () => {
    it('uses desktop floating toolbar for page range selections', () => {
      expect(
        resolveToolbarPolicy({
          surface: 'page',
          isMobile: false,
          isFocused: true,
          selectionShape: 'range',
          inCodeBlock: false
        })
      ).toEqual({ presentation: 'desktop-floating', isCompact: false })
    })

    it('uses fixed mobile toolbar while focused on mobile page surfaces', () => {
      expect(
        resolveToolbarPolicy({
          surface: 'page',
          isMobile: true,
          isFocused: true,
          selectionShape: 'collapsed',
          inCodeBlock: false
        })
      ).toEqual({ presentation: 'mobile-fixed', isCompact: false })
    })

    it('uses compact toolbar for canvas inline range selections', () => {
      expect(
        resolveToolbarPolicy({
          surface: 'canvas-inline',
          isMobile: false,
          isFocused: true,
          selectionShape: 'range',
          inCodeBlock: false
        })
      ).toEqual({ presentation: 'canvas-compact', isCompact: true })
    })

    it('hides toolbar for canvas previews and read surfaces', () => {
      const base = {
        isMobile: false,
        isFocused: true,
        selectionShape: 'range' as const,
        inCodeBlock: false
      }

      expect(resolveToolbarPolicy({ ...base, surface: 'canvas-preview' })).toEqual({
        presentation: 'hidden',
        isCompact: false
      })
      expect(resolveToolbarPolicy({ ...base, surface: 'read' })).toEqual({
        presentation: 'hidden',
        isCompact: false
      })
    })

    it('hides toolbar inside code blocks on every surface', () => {
      expect(
        resolveToolbarPolicy({
          surface: 'canvas-inline',
          isMobile: false,
          isFocused: true,
          selectionShape: 'range',
          inCodeBlock: true
        })
      ).toEqual({ presentation: 'hidden', isCompact: false })
    })
  })
})
