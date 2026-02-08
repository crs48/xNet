/**
 * useFocusTrap - Trap focus within a container
 *
 * Keeps keyboard focus within a container element, useful for
 * modals, dialogs, and other overlay components.
 */

import * as React from 'react'

// ─── Constants ─────────────────────────────────────────────────────

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]'
].join(', ')

// ─── Types ─────────────────────────────────────────────────────────

export interface UseFocusTrapOptions {
  /** Whether the focus trap is active (default: true) */
  active?: boolean
  /** Whether to focus the first element on mount (default: true) */
  autoFocus?: boolean
  /** Whether to restore focus on unmount (default: true) */
  restoreFocus?: boolean
  /** Initial element to focus (by ref) */
  initialFocus?: React.RefObject<HTMLElement>
  /** Element to focus when trap is deactivated */
  returnFocus?: React.RefObject<HTMLElement>
}

// ─── Hook ──────────────────────────────────────────────────────────

/**
 * Hook to trap focus within a container element.
 *
 * @param options - Configuration options
 * @returns Ref to attach to the container element
 *
 * @example
 * function Modal({ open, onClose, children }) {
 *   const containerRef = useFocusTrap({ active: open })
 *
 *   return open ? (
 *     <div ref={containerRef} role="dialog" aria-modal="true">
 *       {children}
 *       <button onClick={onClose}>Close</button>
 *     </div>
 *   ) : null
 * }
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  options: UseFocusTrapOptions = {}
): React.RefObject<T> {
  const {
    active = true,
    autoFocus = true,
    restoreFocus = true,
    initialFocus,
    returnFocus
  } = options

  const containerRef = React.useRef<T>(null)
  const previousActiveElement = React.useRef<HTMLElement | null>(null)

  React.useEffect(() => {
    if (!active) return

    const container = containerRef.current
    if (!container) return

    // Store the previously focused element
    if (restoreFocus) {
      previousActiveElement.current = document.activeElement as HTMLElement
    }

    // Get all focusable elements
    const getFocusableElements = () => {
      return container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
    }

    // Focus the initial element or first focusable
    if (autoFocus) {
      const focusableElements = getFocusableElements()
      const elementToFocus = initialFocus?.current || focusableElements[0]
      elementToFocus?.focus()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return

      const focusableElements = getFocusableElements()
      if (focusableElements.length === 0) return

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (event.shiftKey) {
        // Shift + Tab: go to last element if on first
        if (document.activeElement === firstElement) {
          event.preventDefault()
          lastElement?.focus()
        }
      } else {
        // Tab: go to first element if on last
        if (document.activeElement === lastElement) {
          event.preventDefault()
          firstElement?.focus()
        }
      }
    }

    // Handle clicks outside the container
    const handleClickOutside = (event: MouseEvent) => {
      if (!container.contains(event.target as Node)) {
        event.preventDefault()
        event.stopPropagation()
        // Refocus the first focusable element
        const focusableElements = getFocusableElements()
        focusableElements[0]?.focus()
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside, true)

    return () => {
      container.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside, true)

      // Restore focus to the previously focused element
      if (restoreFocus) {
        const elementToRestore = returnFocus?.current || previousActiveElement.current
        elementToRestore?.focus()
      }
    }
  }, [active, autoFocus, restoreFocus, initialFocus, returnFocus])

  return containerRef
}

// ─── Utility Functions ─────────────────────────────────────────────

/**
 * Get all focusable elements within a container.
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS))
}

/**
 * Get the first focusable element within a container.
 */
export function getFirstFocusable(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(FOCUSABLE_SELECTORS)
}

/**
 * Get the last focusable element within a container.
 */
export function getLastFocusable(container: HTMLElement): HTMLElement | null {
  const elements = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
  return elements[elements.length - 1] || null
}

/**
 * Check if an element is focusable.
 */
export function isFocusable(element: HTMLElement): boolean {
  return element.matches(FOCUSABLE_SELECTORS)
}
