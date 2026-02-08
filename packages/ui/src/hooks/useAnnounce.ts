/**
 * useAnnounce - Screen reader announcements via ARIA live regions
 *
 * Provides a way to announce dynamic content changes to screen readers
 * without visual changes.
 */

import * as React from 'react'

// ─── Types ─────────────────────────────────────────────────────────

export type AnnouncePoliteness = 'polite' | 'assertive'

export interface UseAnnounceOptions {
  /** Default politeness level (default: 'polite') */
  defaultPoliteness?: AnnouncePoliteness
  /** Delay before clearing the announcement (default: 1000ms) */
  clearDelay?: number
}

export interface AnnounceFunction {
  (message: string, politeness?: AnnouncePoliteness): void
}

// ─── Singleton Announcer ───────────────────────────────────────────

let politeAnnouncer: HTMLDivElement | null = null
let assertiveAnnouncer: HTMLDivElement | null = null

function createAnnouncer(politeness: AnnouncePoliteness): HTMLDivElement {
  const announcer = document.createElement('div')
  announcer.setAttribute('aria-live', politeness)
  announcer.setAttribute('aria-atomic', 'true')
  announcer.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status')
  announcer.style.cssText = `
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  `
  document.body.appendChild(announcer)
  return announcer
}

function getAnnouncer(politeness: AnnouncePoliteness): HTMLDivElement {
  if (politeness === 'assertive') {
    if (!assertiveAnnouncer) {
      assertiveAnnouncer = createAnnouncer('assertive')
    }
    return assertiveAnnouncer
  }

  if (!politeAnnouncer) {
    politeAnnouncer = createAnnouncer('polite')
  }
  return politeAnnouncer
}

// ─── Hook ──────────────────────────────────────────────────────────

/**
 * Hook to announce messages to screen readers.
 *
 * Uses ARIA live regions to announce dynamic content changes.
 *
 * @param options - Configuration options
 * @returns Announce function
 *
 * @example
 * function SaveButton() {
 *   const announce = useAnnounce()
 *
 *   const handleSave = async () => {
 *     await saveData()
 *     announce('Changes saved successfully')
 *   }
 *
 *   return <button onClick={handleSave}>Save</button>
 * }
 *
 * @example
 * // Assertive announcement (interrupts)
 * function ErrorMessage({ error }) {
 *   const announce = useAnnounce()
 *
 *   useEffect(() => {
 *     if (error) {
 *       announce(`Error: ${error}`, 'assertive')
 *     }
 *   }, [error, announce])
 *
 *   return error ? <div role="alert">{error}</div> : null
 * }
 */
export function useAnnounce(options: UseAnnounceOptions = {}): AnnounceFunction {
  const { defaultPoliteness = 'polite', clearDelay = 1000 } = options

  const announce = React.useCallback(
    (message: string, politeness: AnnouncePoliteness = defaultPoliteness) => {
      // Skip if not in browser
      if (typeof window === 'undefined') return

      const announcer = getAnnouncer(politeness)

      // Clear and set message to trigger announcement
      // The double-update ensures screen readers pick up the change
      announcer.textContent = ''

      // Use requestAnimationFrame to ensure the clear is processed
      requestAnimationFrame(() => {
        announcer.textContent = message

        // Clear after delay to prevent stale announcements
        setTimeout(() => {
          announcer.textContent = ''
        }, clearDelay)
      })
    },
    [defaultPoliteness, clearDelay]
  )

  return announce
}

// ─── Utility Functions ─────────────────────────────────────────────

/**
 * Announce a message immediately (outside of React).
 *
 * Useful for announcing from event handlers or non-React code.
 */
export function announce(message: string, politeness: AnnouncePoliteness = 'polite'): void {
  if (typeof window === 'undefined') return

  const announcer = getAnnouncer(politeness)
  announcer.textContent = ''

  requestAnimationFrame(() => {
    announcer.textContent = message

    setTimeout(() => {
      announcer.textContent = ''
    }, 1000)
  })
}

/**
 * Clear all pending announcements.
 */
export function clearAnnouncements(): void {
  if (politeAnnouncer) {
    politeAnnouncer.textContent = ''
  }
  if (assertiveAnnouncer) {
    assertiveAnnouncer.textContent = ''
  }
}

// ─── Cleanup ───────────────────────────────────────────────────────

/**
 * Remove announcer elements from the DOM.
 *
 * Call this when your app unmounts if needed.
 */
export function cleanupAnnouncers(): void {
  if (politeAnnouncer) {
    politeAnnouncer.remove()
    politeAnnouncer = null
  }
  if (assertiveAnnouncer) {
    assertiveAnnouncer.remove()
    assertiveAnnouncer = null
  }
}
