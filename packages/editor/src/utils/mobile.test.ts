import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  isMobile,
  isIOS,
  isAndroid,
  hapticFeedback,
  isTouchDevice,
  getSafeAreaInsets
} from './mobile'

describe('mobile utilities', () => {
  const originalNavigator = global.navigator
  const originalWindow = global.window

  function mockUserAgent(ua: string) {
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent: ua,
        platform: 'Linux',
        maxTouchPoints: 0,
        vibrate: undefined
      },
      writable: true,
      configurable: true
    })
  }

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true
    })
    Object.defineProperty(global, 'window', {
      value: originalWindow,
      writable: true,
      configurable: true
    })
  })

  describe('isMobile', () => {
    it('returns true for iPhone user agent', () => {
      mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)')
      expect(isMobile()).toBe(true)
    })

    it('returns true for Android user agent', () => {
      mockUserAgent('Mozilla/5.0 (Linux; Android 12; Pixel 6)')
      expect(isMobile()).toBe(true)
    })

    it('returns true for iPad user agent', () => {
      mockUserAgent('Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X)')
      expect(isMobile()).toBe(true)
    })

    it('returns false for desktop user agent', () => {
      mockUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
      expect(isMobile()).toBe(false)
    })

    it('returns false when navigator is undefined', () => {
      Object.defineProperty(global, 'navigator', {
        value: undefined,
        writable: true,
        configurable: true
      })
      expect(isMobile()).toBe(false)
    })
  })

  describe('isIOS', () => {
    it('returns true for iPhone user agent', () => {
      mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)')
      expect(isIOS()).toBe(true)
    })

    it('returns true for iPad user agent', () => {
      mockUserAgent('Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X)')
      expect(isIOS()).toBe(true)
    })

    it('returns true for iPod user agent', () => {
      mockUserAgent('Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X)')
      expect(isIOS()).toBe(true)
    })

    it('returns true for modern iPad (MacIntel with touch)', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          platform: 'MacIntel',
          maxTouchPoints: 5
        },
        writable: true,
        configurable: true
      })
      expect(isIOS()).toBe(true)
    })

    it('returns false for Android user agent', () => {
      mockUserAgent('Mozilla/5.0 (Linux; Android 12; Pixel 6)')
      expect(isIOS()).toBe(false)
    })

    it('returns false when navigator is undefined', () => {
      Object.defineProperty(global, 'navigator', {
        value: undefined,
        writable: true,
        configurable: true
      })
      expect(isIOS()).toBe(false)
    })
  })

  describe('isAndroid', () => {
    it('returns true for Android user agent', () => {
      mockUserAgent('Mozilla/5.0 (Linux; Android 12; Pixel 6)')
      expect(isAndroid()).toBe(true)
    })

    it('returns false for iPhone user agent', () => {
      mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)')
      expect(isAndroid()).toBe(false)
    })

    it('returns false for desktop user agent', () => {
      mockUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
      expect(isAndroid()).toBe(false)
    })

    it('returns false when navigator is undefined', () => {
      Object.defineProperty(global, 'navigator', {
        value: undefined,
        writable: true,
        configurable: true
      })
      expect(isAndroid()).toBe(false)
    })
  })

  describe('hapticFeedback', () => {
    it('calls navigator.vibrate with default duration', () => {
      const vibrate = vi.fn()
      Object.defineProperty(global, 'navigator', {
        value: { vibrate, userAgent: '' },
        writable: true,
        configurable: true
      })
      hapticFeedback()
      expect(vibrate).toHaveBeenCalledWith(10)
    })

    it('calls navigator.vibrate with custom duration', () => {
      const vibrate = vi.fn()
      Object.defineProperty(global, 'navigator', {
        value: { vibrate, userAgent: '' },
        writable: true,
        configurable: true
      })
      hapticFeedback(50)
      expect(vibrate).toHaveBeenCalledWith(50)
    })

    it('does nothing when vibrate is not supported', () => {
      Object.defineProperty(global, 'navigator', {
        value: { vibrate: undefined, userAgent: '' },
        writable: true,
        configurable: true
      })
      expect(() => hapticFeedback()).not.toThrow()
    })

    it('does nothing when navigator is undefined', () => {
      Object.defineProperty(global, 'navigator', {
        value: undefined,
        writable: true,
        configurable: true
      })
      expect(() => hapticFeedback()).not.toThrow()
    })
  })

  describe('isTouchDevice', () => {
    it('returns true when ontouchstart is in window', () => {
      Object.defineProperty(global, 'window', {
        value: { ontouchstart: null },
        writable: true,
        configurable: true
      })
      Object.defineProperty(global, 'navigator', {
        value: { maxTouchPoints: 0, userAgent: '' },
        writable: true,
        configurable: true
      })
      expect(isTouchDevice()).toBe(true)
    })

    it('returns true when maxTouchPoints > 0', () => {
      // Ensure ontouchstart is not present
      const win = { ...global.window }
      delete (win as any).ontouchstart
      Object.defineProperty(global, 'window', {
        value: win,
        writable: true,
        configurable: true
      })
      Object.defineProperty(global, 'navigator', {
        value: { maxTouchPoints: 5, userAgent: '' },
        writable: true,
        configurable: true
      })
      expect(isTouchDevice()).toBe(true)
    })

    it('returns false when window is undefined', () => {
      Object.defineProperty(global, 'window', {
        value: undefined,
        writable: true,
        configurable: true
      })
      expect(isTouchDevice()).toBe(false)
    })
  })

  describe('getSafeAreaInsets', () => {
    it('returns CSS env() values', () => {
      const insets = getSafeAreaInsets()
      expect(insets.top).toBe('env(safe-area-inset-top, 0px)')
      expect(insets.right).toBe('env(safe-area-inset-right, 0px)')
      expect(insets.bottom).toBe('env(safe-area-inset-bottom, 0px)')
      expect(insets.left).toBe('env(safe-area-inset-left, 0px)')
    })
  })
})
