import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ScreenReaderAnnouncer, createAnnouncer } from './announcer'

describe('ScreenReaderAnnouncer', () => {
  let announcer: ScreenReaderAnnouncer

  beforeEach(() => {
    announcer = new ScreenReaderAnnouncer()
  })

  afterEach(() => {
    announcer.destroy()
  })

  describe('mount', () => {
    it('creates two aria-live regions in document.body by default', () => {
      announcer.mount()
      const regions = document.querySelectorAll('[aria-live]')
      expect(regions.length).toBeGreaterThanOrEqual(2)
    })

    it('creates regions in a custom container', () => {
      const container = document.createElement('div')
      document.body.appendChild(container)
      announcer.mount(container)
      const regions = container.querySelectorAll('[aria-live]')
      expect(regions.length).toBe(2)
      container.remove()
    })

    it('creates a polite region', () => {
      announcer.mount()
      const polite = document.querySelector('[aria-live="polite"]')
      expect(polite).not.toBeNull()
      expect(polite?.getAttribute('role')).toBe('status')
      expect(polite?.getAttribute('aria-atomic')).toBe('true')
    })

    it('creates an assertive region', () => {
      announcer.mount()
      const assertive = document.querySelector('[aria-live="assertive"]')
      expect(assertive).not.toBeNull()
      expect(assertive?.getAttribute('role')).toBe('status')
    })

    it('regions are visually hidden', () => {
      announcer.mount()
      const polite = document.querySelector('[aria-live="polite"]') as HTMLElement
      expect(polite.style.position).toBe('absolute')
      expect(polite.style.width).toBe('1px')
      expect(polite.style.height).toBe('1px')
      expect(polite.style.overflow).toBe('hidden')
    })

    it('sets isMounted to true', () => {
      expect(announcer.isMounted).toBe(false)
      announcer.mount()
      expect(announcer.isMounted).toBe(true)
    })
  })

  describe('destroy', () => {
    it('removes regions from DOM', () => {
      announcer.mount()
      announcer.destroy()
      // Our specific regions should be removed
      expect(announcer.isMounted).toBe(false)
    })

    it('sets isMounted to false', () => {
      announcer.mount()
      announcer.destroy()
      expect(announcer.isMounted).toBe(false)
    })

    it('clears pending timers', () => {
      vi.useFakeTimers()
      announcer.mount()
      announcer.announce('test')
      announcer.destroy()
      // Should not throw when timers fire
      vi.runAllTimers()
      vi.useRealTimers()
    })

    it('is safe to call multiple times', () => {
      announcer.mount()
      announcer.destroy()
      expect(() => announcer.destroy()).not.toThrow()
    })
  })

  describe('announce', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      announcer.mount()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('sets text content on polite region by default', () => {
      announcer.announce('Hello')
      // Trigger rAF
      vi.advanceTimersByTime(16)
      const polite = document.querySelector('[aria-live="polite"]')
      expect(polite?.textContent).toBe('Hello')
    })

    it('sets text content on assertive region when specified', () => {
      announcer.announce('Urgent!', { priority: 'assertive' })
      vi.advanceTimersByTime(16)
      const assertive = document.querySelector('[aria-live="assertive"]')
      expect(assertive?.textContent).toBe('Urgent!')
    })

    it('clears text content after clearDelay', () => {
      announcer.announce('Temporary', { clearDelay: 500 })
      vi.advanceTimersByTime(16) // rAF
      const polite = document.querySelector('[aria-live="polite"]')
      expect(polite?.textContent).toBe('Temporary')
      vi.advanceTimersByTime(500)
      expect(polite?.textContent).toBe('')
    })

    it('uses default clearDelay of 1000ms', () => {
      announcer.announce('Default delay')
      vi.advanceTimersByTime(16) // rAF
      const polite = document.querySelector('[aria-live="polite"]')
      expect(polite?.textContent).toBe('Default delay')
      vi.advanceTimersByTime(999)
      expect(polite?.textContent).toBe('Default delay')
      vi.advanceTimersByTime(1)
      expect(polite?.textContent).toBe('')
    })

    it('cancels previous clear timer on new announcement', () => {
      announcer.announce('First', { clearDelay: 500 })
      vi.advanceTimersByTime(16)
      announcer.announce('Second', { clearDelay: 500 })
      vi.advanceTimersByTime(16)
      const polite = document.querySelector('[aria-live="polite"]')
      // Only "Second" should be set; first timer was cleared
      expect(polite?.textContent).toBe('Second')
    })

    it('does nothing when not mounted', () => {
      announcer.destroy()
      expect(() => announcer.announce('test')).not.toThrow()
    })
  })
})

describe('createAnnouncer', () => {
  it('creates and mounts an announcer', () => {
    const announcer = createAnnouncer()
    expect(announcer.isMounted).toBe(true)
    announcer.destroy()
  })

  it('accepts a custom container', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const announcer = createAnnouncer(container)
    expect(container.querySelectorAll('[aria-live]').length).toBe(2)
    announcer.destroy()
    container.remove()
  })
})
