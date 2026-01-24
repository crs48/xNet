/**
 * Focus trap utility for modal-like editor components.
 *
 * Traps keyboard focus within a container element, cycling through
 * focusable elements with Tab/Shift+Tab.
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]'
].join(', ')

export interface FocusTrapOptions {
  /** Element to return focus to when the trap is deactivated */
  returnFocusTo?: HTMLElement | null
  /** Whether to auto-focus the first element on activation. Default: true */
  autoFocus?: boolean
  /** Callback when escape is pressed */
  onEscape?: () => void
}

export interface FocusTrap {
  /** Activate the focus trap */
  activate(): void
  /** Deactivate the focus trap and optionally return focus */
  deactivate(): void
  /** Whether the trap is currently active */
  readonly isActive: boolean
}

/**
 * Create a focus trap for the given container element.
 *
 * @param container - The element to trap focus within
 * @param options - Configuration options
 */
export function createFocusTrap(container: HTMLElement, options: FocusTrapOptions = {}): FocusTrap {
  const { returnFocusTo = null, autoFocus = true, onEscape } = options
  let active = false
  let previouslyFocused: HTMLElement | null = returnFocusTo

  function getFocusableElements(): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (el) => !el.hasAttribute('disabled') && !el.hidden
    )
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (!active) return

    if (event.key === 'Escape' && onEscape) {
      event.preventDefault()
      onEscape()
      return
    }

    if (event.key !== 'Tab') return

    const focusable = getFocusableElements()
    if (focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const activeEl = document.activeElement as HTMLElement

    if (event.shiftKey) {
      // Shift+Tab: wrap from first to last
      if (activeEl === first || !container.contains(activeEl)) {
        event.preventDefault()
        last.focus()
      }
    } else {
      // Tab: wrap from last to first
      if (activeEl === last || !container.contains(activeEl)) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  function activate(): void {
    if (active) return
    active = true

    // Store currently focused element if no explicit return target
    if (!previouslyFocused) {
      previouslyFocused = document.activeElement as HTMLElement
    }

    container.addEventListener('keydown', handleKeyDown)

    if (autoFocus) {
      const focusable = getFocusableElements()
      if (focusable.length > 0) {
        focusable[0].focus()
      } else {
        // If no focusable children, focus the container itself
        container.setAttribute('tabindex', '-1')
        container.focus()
      }
    }
  }

  function deactivate(): void {
    if (!active) return
    active = false

    container.removeEventListener('keydown', handleKeyDown)

    if (previouslyFocused && previouslyFocused.focus) {
      previouslyFocused.focus()
    }
  }

  return {
    activate,
    deactivate,
    get isActive() {
      return active
    }
  }
}
